import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

const CIRCLE_API_KEY  = process.env.CIRCLE_API_KEY!;
const CIRCLE_API_BASE = CIRCLE_API_KEY?.startsWith("TEST_API_KEY")
  ? "https://api-sandbox.circle.com/v1/w3s"
  : "https://api.circle.com/v1/w3s";

// POST /api/circle/wallet
// Body: { userToken: string }
// Initiates EVM-TESTNET wallet creation, returning a challengeId the frontend SDK executes.
export async function POST(req: NextRequest) {
  try {
    const { userToken } = await req.json();
    if (!userToken) return NextResponse.json({ error: "userToken is required" }, { status: 400 });
    if (!CIRCLE_API_KEY) return NextResponse.json({ error: "Circle API key not configured on server" }, { status: 500 });

    const idempotencyKey = uuidv4();

    const res = await fetch(`${CIRCLE_API_BASE}/user/initialize`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        Authorization:   `Bearer ${CIRCLE_API_KEY}`,
        "X-User-Token":  userToken,
      },
      body: JSON.stringify({
        idempotencyKey,
        blockchains: ["ARC-TESTNET"],
        // Wallet type: EOA (compatible with generic EVM chains like Arc Testnet)
        accountType: "EOA",
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("[Circle /api/circle/wallet] Wallet setup failed:", data);
      return NextResponse.json(
        { error: data?.message || "Failed to initiate wallet creation" },
        { status: res.status }
      );
    }

    const challengeId = data?.data?.challengeId;
    return NextResponse.json({ challengeId });

  } catch (err: any) {
    console.error("[Circle /api/circle/wallet] Error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

// GET /api/circle/wallet?userToken=xxx
// Returns the user's wallets from Circle.
// Fetch wallets specifically bound to ARC-TESTNET.
export async function GET(req: NextRequest) {
  try {
    const userToken = req.nextUrl.searchParams.get("userToken");
    if (!userToken) return NextResponse.json({ error: "userToken is required" }, { status: 400 });

    const res = await fetch(`${CIRCLE_API_BASE}/wallets?blockchain=ARC-TESTNET`, {
      method: "GET",
      headers: {
        Authorization:  `Bearer ${CIRCLE_API_KEY}`,
        "X-User-Token": userToken,
      },
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("[Circle /api/circle/wallet GET] Fetch wallets failed:", data);
      return NextResponse.json(
        { error: data?.message || "Failed to fetch wallets" },
        { status: res.status }
      );
    }

    const wallets = data?.data?.wallets || [];
    return NextResponse.json({ wallets });

  } catch (err: any) {
    console.error("[Circle /api/circle/wallet GET] Error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
