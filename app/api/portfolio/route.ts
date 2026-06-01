import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  try {
    const { data: portfolio, error: pErr } = await supabaseAdmin
      .from("portfolios")
      .select("*")
      .limit(1)
      .single();

    if (pErr || !portfolio) {
      return NextResponse.json({ error: "Portefeuille introuvable" }, { status: 404 });
    }

    const { data: settings } = await supabaseAdmin
      .from("settings")
      .select("*")
      .eq("portfolio_id", portfolio.id)
      .single();

    const { data: holdings } = await supabaseAdmin
      .from("holdings")
      .select("*")
      .eq("portfolio_id", portfolio.id);

    return NextResponse.json({ portfolio, settings, holdings: holdings ?? [] });
  } catch {
    return NextResponse.json({ error: "Connexion Supabase impossible" }, { status: 500 });
  }
}
