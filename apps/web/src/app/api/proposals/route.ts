import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address");

  if (!address) {
    return NextResponse.json({ error: "Missing address parameter" }, { status: 400 });
  }

  const hasSupabase = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!hasSupabase) {
    return NextResponse.json({ proposals: [] });
  }

  try {
    const cleanAddr = address.toLowerCase();
    const { data, error } = await supabase
      .from("escrow_proposals")
      .select("*")
      .or(`buyer_address.eq.${cleanAddr},seller_address.eq.${cleanAddr}`)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ proposals: data || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const hasSupabase = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!hasSupabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  try {
    const { buyerAddress, sellerAddress, description, budget, hours, escrowType, qrCodeWord } = await req.json();

    if (!buyerAddress || !sellerAddress || !description || !budget) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("escrow_proposals")
      .insert({
        buyer_address: buyerAddress.toLowerCase(),
        seller_address: sellerAddress.toLowerCase(),
        description,
        budget: parseFloat(budget),
        hours: hours ? parseInt(hours) : 24,
        escrow_type: escrowType || "digital",
        qr_code_word: qrCodeWord || "",
        status: "pending"
      })
      .select()
      .single();

    if (error) throw error;

    // Send a notification to the buyer that a seller has proposed an escrow contract!
    try {
      await supabase.from("notifications").insert({
        recipient_address: buyerAddress.toLowerCase(),
        type: "COUNTER_OFFER",
        message: `Seller ${sellerAddress.slice(0, 8)}...${sellerAddress.slice(-4)} has proposed a new ${escrowType || "digital"} escrow contract for you! Budget: ${budget} USDC. Click to confirm.`,
        read: false,
        metadata: { proposal_id: data.id, seller: sellerAddress, budget, type: escrowType }
      });
    } catch (notifErr) {
      console.error("Failed to send proposal notification:", notifErr);
    }

    return NextResponse.json({ proposal: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const hasSupabase = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!hasSupabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  try {
    const { proposalId, status } = await req.json();

    if (!proposalId || !status) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("escrow_proposals")
      .update({ status })
      .eq("id", proposalId)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ proposal: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
