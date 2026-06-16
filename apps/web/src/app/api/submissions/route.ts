import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { jobId, fileUrl, fileName } = body;

    const hasSupabase = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (hasSupabase) {
      try {
        await supabase.from("escrow_submissions").upsert({
          job_id: Number(jobId),
          file_url: fileUrl,
          file_name: fileName || "deliverable",
          status: "Pending Verification",
          result: "AI verification agent analyzing the uploaded deliverable...",
          source: "web"
        });
      } catch (err: any) {
        console.warn("POST Route direct Supabase insert failed:", err.message || err);
      }
    }

    const res = await fetch(`http://localhost:4000/api/submissions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error("Failed to post submission to bot server:", error.message || error);
    return NextResponse.json({ error: "Verification backend (bot server) is offline. Please launch the bot using 'npm run dev:bot'." }, { status: 503 });
  }
}
