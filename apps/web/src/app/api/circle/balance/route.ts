import { NextRequest, NextResponse } from "next/server";

const CIRCLE_API_KEY  = process.env.CIRCLE_API_KEY?.trim() || "";
const CIRCLE_API_BASE = "https://api.circle.com/v1/w3s";

// GET /api/circle/balance?walletId=xxx&userToken=xxx
// Returns token balances for a Circle wallet.
export async function GET(req: NextRequest) {
  try {
    const walletId   = req.nextUrl.searchParams.get("walletId");
    const userToken  = req.nextUrl.searchParams.get("userToken");

    if (!walletId)  return NextResponse.json({ error: "walletId is required" },  { status: 400 });
    if (!userToken) return NextResponse.json({ error: "userToken is required" }, { status: 400 });

    const res = await fetch(`${CIRCLE_API_BASE}/wallets/${walletId}/balances`, {
      headers: {
        Authorization:  `Bearer ${CIRCLE_API_KEY}`,
        "X-User-Token": userToken,
      },
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { error: data?.message || "Failed to fetch balances" },
        { status: res.status }
      );
    }

    const tokenBalances = data?.data?.tokenBalances || [];
    return NextResponse.json({ tokenBalances });

  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
