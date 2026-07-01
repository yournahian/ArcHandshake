import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

const CIRCLE_API_KEY  = process.env.CIRCLE_API_KEY?.trim() || "";
const CIRCLE_API_BASE = "https://api.circle.com/v1/w3s";

// POST /api/circle/execute
// Body: { userToken, walletId, contractAddress, abiFunctionSignature, abiParameters, feeLevel? }
// Supports a special abiParameters entry: { type: "callData", value: "0x..." } to pass raw calldata.
export async function POST(req: NextRequest) {
  try {
    const {
      userToken,
      walletId,
      contractAddress,
      abiFunctionSignature,
      abiParameters = [],
      amount = "0",
      feeLevel = "MEDIUM",
    } = await req.json();

    if (!userToken || !walletId || !contractAddress) {
      return NextResponse.json({ error: "Missing required fields: userToken, walletId, contractAddress" }, { status: 400 });
    }
    if (!CIRCLE_API_KEY) {
      return NextResponse.json({ error: "Circle API key not configured on server" }, { status: 500 });
    }

    const idempotencyKey = uuidv4();

    // Check if caller passed raw calldata (e.g., viem encodeFunctionData output)
    const callDataEntry = abiParameters.find((p: any) => p.type === "callData");

    const requestBody: Record<string, any> = {
      idempotencyKey,
      walletId,
      contractAddress,
      amount,
      feeLevel,
    };

    if (callDataEntry) {
      // Raw calldata path: bypass abiFunctionSignature entirely
      requestBody.callData = callDataEntry.value;
    } else {
      // Standard ABI path
      if (!abiFunctionSignature) {
        return NextResponse.json({ error: "Missing abiFunctionSignature" }, { status: 400 });
      }
      requestBody.abiFunctionSignature = abiFunctionSignature;
      requestBody.abiParameters = abiParameters;
    }

    const res = await fetch(`${CIRCLE_API_BASE}/user/transactions/contractExecution`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        Authorization:   `Bearer ${CIRCLE_API_KEY}`,
        "X-User-Token":  userToken,
      },
      body: JSON.stringify(requestBody),
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
