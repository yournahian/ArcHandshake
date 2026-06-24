import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

const CIRCLE_API_BASE = "https://api.circle.com/v1/w3s";
const CIRCLE_API_KEY  = process.env.CIRCLE_API_KEY!;

// POST /api/circle/execute
// Body: { userToken, walletId, contractAddress, abiFunctionSignature, abiParameters, feeLevel? }
// Prepares a smart-contract-execution challenge. The frontend SDK runs the challenge (PIN popup),
// then Circle broadcasts the signed transaction to the EVM-TESTNET chain.
export async function POST(req: NextRequest) {
  try {
    const {
      userToken,
      walletId,
      contractAddress,
      abiFunctionSignature, // e.g. "deposit(uint256)"
      abiParameters,        // e.g. [{ type: "uint256", value: "1000000" }]
      amount = "0",         // native token amount (0 for ERC-20 only calls)
      feeLevel = "MEDIUM",
    } = await req.json();

    if (!userToken || !walletId || !contractAddress || !abiFunctionSignature) {
      return NextResponse.json({ error: "Missing required fields: userToken, walletId, contractAddress, abiFunctionSignature" }, { status: 400 });
    }
    if (!CIRCLE_API_KEY) {
      return NextResponse.json({ error: "Circle API key not configured on server" }, { status: 500 });
    }

    const idempotencyKey = uuidv4();

    const res = await fetch(`${CIRCLE_API_BASE}/user/transactions/contractExecution`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        Authorization:   `Bearer ${CIRCLE_API_KEY}`,
        "X-User-Token":  userToken,
      },
      body: JSON.stringify({
        idempotencyKey,
        walletId,
        contractAddress,
        abiFunctionSignature,
        abiParameters: abiParameters || [],
        amount,
        feeLevel,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { error: data?.message || "Failed to prepare contract execution" },
        { status: res.status }
      );
    }

    const challengeId = data?.data?.challengeId;
    return NextResponse.json({ challengeId });

  } catch (err: any) {
    console.error("[Circle /api/circle/execute] Error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
