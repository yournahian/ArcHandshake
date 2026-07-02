import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const hasSupabase = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!hasSupabase) {
    return NextResponse.json({ listings: [] });
  }

  try {
    const { data, error } = await supabase
      .from("open_listings")
      .select("*")
      .eq("status", "open")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ listings: data || [] });
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
    const { title, description, budget, creatorAddress, contactInfo, creatorRole, listingType } = await req.json();

    if (!title || !description || !budget || !creatorAddress) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("open_listings")
      .insert({
        title,
        description,
        budget: parseFloat(budget),
        creator_address: creatorAddress.toLowerCase(),
        contact_info: contactInfo || "",
        status: "open",
        creator_role: creatorRole || "buyer",
        listing_type: listingType || "digital"
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ listing: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
