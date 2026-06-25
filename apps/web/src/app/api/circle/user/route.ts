import { NextRequest, NextResponse } from "next/server";

const CIRCLE_API_KEY  = process.env.CIRCLE_API_KEY?.trim() || "";
const CIRCLE_API_BASE = CIRCLE_API_KEY.startsWith("TEST_API_KEY")
  ? "https://api-sandbox.circle.com/v1/w3s"
  : "https://api.circle.com/v1/w3s";

// POST /api/circle/user
// Body: { userId: string }
// Creates a Circle user if not yet registered and returns a fresh userToken + encryptionKey.
export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json();
    if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });
    if (!CIRCLE_API_KEY) return NextResponse.json({ error: "Circle API key not configured on server" }, { status: 500 });

    // 1. Try to create the user (idempotent — Circle will silently accept if already exists).
    await fetch(`${CIRCLE_API_BASE}/users`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        Authorization:   `Bearer ${CIRCLE_API_KEY}`,
      },
      body: JSON.stringify({ userId }),
    });

    // 2. Acquire a short-lived user session token + encryption key.
    const tokenRes = await fetch(`${CIRCLE_API_BASE}/users/token`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        Authorization:   `Bearer ${CIRCLE_API_KEY}`,
      },
      body: JSON.stringify({ userId }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok) {
      console.error("[Circle /api/circle/user] Token creation failed:", tokenData);
      console.error(`Diagnostics: keyLength=${CIRCLE_API_KEY.length}, startsWithTEST=${CIRCLE_API_KEY.startsWith("TEST_API_KEY")}, baseUrl=${CIRCLE_API_BASE}`);
      return NextResponse.json(
        { error: tokenData?.message || "Failed to create user token" },
        { status: tokenRes.status }
      );
    }

    const { userToken, encryptionKey } = tokenData.data;
    return NextResponse.json({ userToken, encryptionKey });

  } catch (err: any) {
    console.error("[Circle /api/circle/user] Error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
