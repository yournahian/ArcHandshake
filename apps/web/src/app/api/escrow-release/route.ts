import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { jobId } = body;

    const hasSupabase = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (hasSupabase) {
      try {
        await supabase.from("escrow_submissions").update({
          buyer_authorized: true,
          status: "Approved",
          result: "Escrow payment released manually by buyer."
        }).eq("job_id", Number(jobId));
      } catch (err: any) {
        console.warn("POST Route direct Supabase release authorization update failed:", err.message || err);
      }
    }

    const res = await fetch(`http://localhost:4000/api/escrow/release`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error("Failed to call escrow release on bot server:", error.message || error);
    return NextResponse.json({ error: "Payout gateway (bot server) is offline. Please launch the bot using 'npm run dev:bot'." }, { status: 503 });
  }
}
