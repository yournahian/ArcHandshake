import { NextRequest, NextResponse } from "next/server";

const CIRCLE_API_KEY  = process.env.CIRCLE_API_KEY?.trim() || "";
const CIRCLE_API_BASE = "https://api.circle.com/v1/w3s";

// GET /api/circle/transactions?walletId=xxx&userToken=xxx
// Returns combined transaction history: contract executions + token transfers
export async function GET(req: NextRequest) {
  try {
    const walletId   = req.nextUrl.searchParams.get("walletId");
    const userToken  = req.nextUrl.searchParams.get("userToken");

    if (!walletId)  return NextResponse.json({ error: "walletId is required" },  { status: 400 });
    if (!userToken) return NextResponse.json({ error: "userToken is required" }, { status: 400 });

    // Circle's developer-level transaction list endpoint (requires only API key)
    // Covers ALL transaction types including contract executions and transfers
    const res = await fetch(
      `${CIRCLE_API_BASE}/transactions?walletIds[]=${walletId}&pageSize=20`,
      {
        headers: {
          Authorization:  `Bearer ${CIRCLE_API_KEY}`,
          "X-User-Token": userToken,
        },
      }
    );

    const data = await res.json();

    console.log("[Circle Tx] status:", res.status, "message:", data?.message || "ok");
    console.log("[Circle Tx] transaction count:", data?.data?.transactions?.length ?? "none");

    if (!res.ok) {
      // Fallback: try the user-scoped endpoint
      const userRes = await fetch(
        `${CIRCLE_API_BASE}/user/transactions?walletIds[]=${walletId}&pageSize=20`,
        {
          headers: {
            Authorization:  `Bearer ${CIRCLE_API_KEY}`,
            "X-User-Token": userToken,
          },
        }
      );
      const userData = await userRes.json();
      console.log("[Circle Tx] user fallback status:", userRes.status, "data:", JSON.stringify(userData).slice(0, 300));
      const transactions = userData?.data?.transactions || [];
      return NextResponse.json({ transactions, _debug: { source: "user_fallback", count: transactions.length } });
    }

    const allTxs = (data?.data?.transactions || []).map((tx: any) => ({
      ...tx,
      transactionType: tx.transactionType || (tx.sourceAddress?.toLowerCase() === walletId.toLowerCase() ? "OUTBOUND" : "INBOUND"),
      amounts: tx.amounts || (tx.amount ? [tx.amount] : ["0"]),
    }));

    // Only show real token transfers (INBOUND/OUTBOUND) with a meaningful amount.
    // CONTRACT_EXECUTION entries are budget updates / counter-offer calls — exclude them.
    const transactions = allTxs.filter((tx: any) => {
      const operation = (tx.operation || "").toUpperCase();
      const type = (tx.transactionType || "").toUpperCase();
      // Keep only true transfers, not contract calls
      if (operation === "CONTRACT_EXECUTION") return false;
      // Filter out near-zero amounts (gas-only transactions)
      const firstAmount = parseFloat(tx.amounts?.[0] || "0");
      if (firstAmount < 0.000001) return false;
      return true;
    });

    return NextResponse.json({ transactions, _debug: { total: allTxs.length, filtered: transactions.length } });

  } catch (err: any) {
    console.error("[Circle /api/circle/transactions] Error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
