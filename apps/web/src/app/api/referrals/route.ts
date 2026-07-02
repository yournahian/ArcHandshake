import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

// GET /api/referrals?address=0x...  — get referral stats
export async function GET(req: NextRequest) {
  try {
    const address = req.nextUrl.searchParams.get("address")?.toLowerCase();
    if (!address) return NextResponse.json({ error: "address required" }, { status: 400 });

    const { data: referrals } = await supabaseAdmin
      .from("referrals")
      .select("*")
      .eq("referrer_address", address);

    const total = referrals?.length ?? 0;
    const completed = referrals?.filter((r: any) => r.first_escrow_completed).length ?? 0;
    const rewardPaid = referrals?.filter((r: any) => r.reward_paid).length ?? 0;
    const pendingReward = (completed - rewardPaid) * 0.5; // 0.5 USDC per referral
    const totalEarned = rewardPaid * 0.5;

    // Generate referral code (deterministic from address)
    const refCode = crypto.createHash("md5").update(address).digest("hex").slice(0, 8);

    return NextResponse.json({
      refCode,
      referralLink: `${process.env.NEXT_PUBLIC_WEB_APP_URL || ""}?ref=${refCode}`,
      total,
      completed,
      pendingReward,
      totalEarned,
      referrals: referrals || [],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/referrals — register a new referred user
export async function POST(req: NextRequest) {
  try {
    const { refCode, newAddress } = await req.json();
    if (!refCode || !newAddress) return NextResponse.json({ error: "refCode and newAddress required" }, { status: 400 });

    // Find referrer by code (reverse hash — try all known addresses)
    // We store ref code in user_profiles for lookup
    const { data: referrerProfile } = await supabaseAdmin
      .from("user_profiles")
      .select("address")
      .eq("ref_code", refCode)
      .maybeSingle();

    if (!referrerProfile) return NextResponse.json({ ok: false, msg: "Invalid ref code" });

    // Don't self-refer
    if (referrerProfile.address === newAddress.toLowerCase()) {
      return NextResponse.json({ ok: false, msg: "Cannot refer yourself" });
    }

    // Check if already referred
    const { data: existing } = await supabaseAdmin
      .from("referrals")
      .select("id")
      .eq("referred_address", newAddress.toLowerCase())
      .maybeSingle();

    if (existing) return NextResponse.json({ ok: false, msg: "Already referred" });

    await supabaseAdmin.from("referrals").insert({
      referrer_address: referrerProfile.address,
      referred_address: newAddress.toLowerCase(),
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
