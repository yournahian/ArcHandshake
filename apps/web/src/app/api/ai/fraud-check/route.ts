import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY?.trim() || "";
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

export async function POST(req: NextRequest) {
  try {
    const { description, amount, buyerAddress, sellerAddress, escrowId } = await req.json();

    const flags: string[] = [];

    // ── Rule-based checks (instant, no AI needed) ──
    if (!description || description.trim().length < 10) {
      flags.push("Description is too vague — add more detail to protect both parties.");
    }

    if (amount && (parseFloat(amount) > 10000)) {
      flags.push("High-value escrow — consider splitting into milestones.");
    }

    if (buyerAddress && sellerAddress &&
        buyerAddress.toLowerCase() === sellerAddress.toLowerCase()) {
      flags.push("⛔ Buyer and seller are the same address — this looks suspicious.");
    }

    const scamPhrases = ["guaranteed profit", "100%", "risk free", "get rich", "double your", "investment return"];
    if (scamPhrases.some(p => description?.toLowerCase().includes(p))) {
      flags.push("Description contains phrases commonly associated with scams.");
    }

    // Check if buyer has NO prior completed escrows (new + high amount)
    if (buyerAddress && amount && parseFloat(amount) > 100) {
      const hasSupabase = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (hasSupabase) {
        try {
          const { count } = await supabaseAdmin
            .from("reviews")
            .select("*", { count: "exact", head: true })
            .eq("reviewer_address", buyerAddress.toLowerCase());
          if (!count || count === 0) {
            flags.push("Buyer has no prior escrow history — proceed with caution for large amounts.");
          }
        } catch {}
      }
    }

    // ── AI-based check (if key available) ──
    if (GEMINI_API_KEY && flags.length < 2) {
      try {
        const ai = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = `Analyze this escrow description for fraud risk. Be concise. Only flag if truly suspicious.
Description: "${description}"
Amount: ${amount} USDC

Respond with JSON only: { "aiFlag": "<one sentence risk flag or null>" }`;
        const result = await model.generateContent(prompt);
        const raw = result.response.text().replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(raw);
        if (parsed.aiFlag && parsed.aiFlag !== "null") flags.push(parsed.aiFlag);
      } catch {}
    }

    const riskLevel = flags.length === 0 ? "LOW" : flags.length === 1 ? "MEDIUM" : "HIGH";

    return NextResponse.json({ flags, riskLevel });
  } catch (err: any) {
    console.error("[AI Fraud Check]", err);
    return NextResponse.json({ flags: [], riskLevel: "LOW" }, { status: 200 });
  }
}
