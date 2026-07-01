import { NextRequest, NextResponse } from "next/server";

const IRIS_API = "https://iris-api-sandbox.circle.com";

/**
 * GET /api/circle/cctp/attestation?messageHash=0x...
 *
 * Proxies Circle's IRIS attestation service.
 * Returns { status: "pending_confirmations" | "complete", attestation: "0x..." }
 * Poll this endpoint every 5s after the depositForBurn transaction is mined.
 */
export async function GET(req: NextRequest) {
  const messageHash = req.nextUrl.searchParams.get("messageHash");
  if (!messageHash) {
    return NextResponse.json({ error: "messageHash is required" }, { status: 400 });
  }

  try {
    const res = await fetch(`${IRIS_API}/attestations/${messageHash}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.ok ? 200 : res.status });
  } catch (err: any) {
    console.error("[CCTP Attestation] Error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch attestation" },
      { status: 500 }
    );
  }
}
