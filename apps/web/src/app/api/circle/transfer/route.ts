import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

const CIRCLE_API_BASE = "https://api.circle.com/v1/w3s";
const CIRCLE_API_KEY  = process.env.CIRCLE_API_KEY!;

// POST /api/circle/transfer
// Body: { userToken, walletId, destinationAddress, tokenId, amount }
// Prepares a token transfer challenge for the user to withdraw funds to MetaMask or any external wallet.
export async function POST(req: NextRequest) {
  try {
    const {
      userToken,
      walletId,
      destinationAddress,
      tokenId,             // Circle token ID for USDC on ARC-TESTNET
      amount,              // Amount in smallest unit (e.g., "1000000" for 1 USDC with 6 decimals)
      feeLevel = "MEDIUM",
    } = await req.json();

    if (!userToken || !walletId || !destinationAddress || !amount) {
      return NextResponse.json(
        { error: "Missing required fields: userToken, walletId, destinationAddress, amount" },
        { status: 400 }
      );
    }
    if (!CIRCLE_API_KEY) {
      return NextResponse.json({ error: "Circle API key not configured on server" }, { status: 500 });
    }

    const idempotencyKey = uuidv4();

    const body: any = {
      idempotencyKey,
      walletId,
      destinationAddress,
      amounts: [amount],
      feeLevel,
    };

    // If a tokenId is supplied, it's a token transfer; otherwise native token send.
    if (tokenId) body.tokenId = tokenId;

    const res = await fetch(`${CIRCLE_API_BASE}/user/transactions/transfer`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        Authorization:   `Bearer ${CIRCLE_API_KEY}`,
        "X-User-Token":  userToken,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { error: data?.message || "Failed to prepare transfer" },
        { status: res.status }
      );
    }

    const challengeId = data?.data?.challengeId;
    return NextResponse.json({ challengeId });

  } catch (err: any) {
    console.error("[Circle /api/circle/transfer] Error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
