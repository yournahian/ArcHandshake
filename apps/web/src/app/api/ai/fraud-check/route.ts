import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { callAI, getAISettings } from "@/lib/adminSettings";

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
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (supabaseUrl && supabaseKey) {
        try {
          const supabaseAdmin = createClient(supabaseUrl, supabaseKey);
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
    const settings = getAISettings();
    if (settings.apiKey && flags.length < 2) {
      try {
        const prompt = `Analyze this escrow description for fraud risk. Be concise. Only flag if truly suspicious.
Description: "${description}"
Amount: ${amount} USDC

Respond with JSON only: { "aiFlag": "<one sentence risk flag or null>" }`;

        const raw = await callAI(prompt);
        const cleaned = raw.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(cleaned);
        if (parsed.aiFlag && parsed.aiFlag !== "null") flags.push(parsed.aiFlag);
      } catch (aiErr) {
        console.warn("AI Fraud Check failed:", aiErr);
      }
    }

    const riskLevel = flags.length === 0 ? "LOW" : flags.length === 1 ? "MEDIUM" : "HIGH";

    return NextResponse.json({ flags, riskLevel });
  } catch (err: any) {
    console.error("[AI Fraud Check]", err);
    return NextResponse.json({ flags: [], riskLevel: "LOW" }, { status: 200 });
  }
}
