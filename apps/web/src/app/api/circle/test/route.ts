import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const CIRCLE_API_KEY = (process.env.CIRCLE_API_KEY || "").trim();
  const baseUrl = "https://api.circle.com/v1/w3s";
  
  try {
    const res = await fetch(`${baseUrl}/config/entity`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${CIRCLE_API_KEY}`,
        Accept: "application/json"
      }
    });
    
    const status = res.status;
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      data = "JSON parse failed";
    }
    
    return NextResponse.json({
      status,
      data,
      envAppId: process.env.NEXT_PUBLIC_CIRCLE_APP_ID
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message });
  }
}
