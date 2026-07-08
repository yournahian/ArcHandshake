import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { jobId, resolution, clientShare, adminPassword } = body;

    const expectedPassword = process.env.ADMIN_PASSWORD || "admin123";
    if (adminPassword !== expectedPassword) {
      return NextResponse.json({ error: "Invalid Admin Password. Access denied." }, { status: 401 });
    }

    const res = await fetch(`http://localhost:4000/api/escrow/resolve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ jobId, resolution, clientShare }),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error("Failed to resolve dispute on bot server:", error.message || error);
    return NextResponse.json({ error: "Payout gateway (bot server) is offline. Please launch the bot using 'npm run dev:bot'." }, { status: 503 });
  }
}
