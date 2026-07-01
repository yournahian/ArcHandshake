import { NextRequest, NextResponse } from "next/server";

const CIRCLE_API_KEY  = process.env.CIRCLE_API_KEY?.trim() || "";
const CIRCLE_API_BASE = "https://api.circle.com/v1/w3s";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userToken = req.nextUrl.searchParams.get("userToken");
    const id = params.id;

    if (!userToken) return NextResponse.json({ error: "userToken is required" }, { status: 400 });

    const res = await fetch(`${CIRCLE_API_BASE}/user/transactions/${id}`, {
      headers: {
        Authorization:  `Bearer ${CIRCLE_API_KEY}`,
        "X-User-Token": userToken,
      },
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { error: data?.message || "Failed to fetch transaction details" },
        { status: res.status }
      );
    }

    return NextResponse.json({ transaction: data?.data?.transaction });
  } catch (err: any) {
    console.error("[Circle /api/circle/transactions/[id]] Error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
