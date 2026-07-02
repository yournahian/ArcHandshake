import { NextRequest, NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const CIRCLE_API_KEY = (process.env.CIRCLE_API_KEY || "").trim();
  const baseUrl = "https://api.circle.com/v1/w3s";
  const walletId = "c9372c88-ce95-50b7-85b6-b506d5dfc673";

  try {
    const res = await fetch(`${baseUrl}/transactions?walletIds[]=${walletId}&pageSize=10`, {
      headers: {
        Authorization: `Bearer ${CIRCLE_API_KEY}`,
      },
    });

    const data = await res.json();
    return NextResponse.json({
      status: res.status,
      rawTransactions: data?.data?.transactions || []
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
