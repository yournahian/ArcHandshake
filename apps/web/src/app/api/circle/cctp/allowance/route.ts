import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const response = await fetch("https://iris-api-sandbox.circle.com/v2/fastBurn/USDC/allowance", {
      headers: { "Accept": "application/json" },
      next: { revalidate: 15 } // Cache for 15 seconds to avoid over-calling the API
    });
    
    if (!response.ok) {
      throw new Error(`Circle API returned status ${response.status}`);
    }
    
    const data = await response.json();
    return NextResponse.json({
      allowance: data.allowance ?? 0,
      lastUpdated: data.lastUpdated ?? new Date().toISOString()
    });
  } catch (error: any) {
    console.error("[CCTP Allowance API Proxy] Error:", error);
    return NextResponse.json({ allowance: 0, error: error.message });
  }
}
