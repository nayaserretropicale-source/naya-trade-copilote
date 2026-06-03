import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const TIERS = ["Prudent", "Équilibré", "Dynamique"];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const symbol = String(body.symbol ?? "").toUpperCase().trim();
    let name = String(body.name ?? "").trim();
    const tier = TIERS.includes(body.tier) ? body.tier : "Dynamique";
    if (!symbol) return NextResponse.json({ error: "Symbole requis" }, { status: 400 });
    if (!name) name = symbol;

    const { data: portfolio } = await supabaseAdmin.from("portfolios").select("id").limit(1).single();
    if (!portfolio) return NextResponse.json({ error: "Portefeuille introuvable" }, { status: 404 });

    // Verifie que le symbole existe vraiment (prix dispo via Finnhub)
    const token = process.env.FINNHUB_API_KEY;
    const q = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${token}`, { cache: "no-store" });
    const quote = await q.json();
    if (!quote.c) return NextResponse.json({ error: `Symbole « ${symbol} » introuvable. Vérifie l'orthographe (ex: AMZN, MSFT, GOOGL).` }, { status: 404 });

    const { error } = await supabaseAdmin.from("watchlist").upsert(
      { portfolio_id: portfolio.id, symbol, name, tier }, { onConflict: "portfolio_id,symbol" }
    );
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const symbol = String(req.nextUrl.searchParams.get("symbol") ?? "").toUpperCase().trim();
    if (!symbol) return NextResponse.json({ error: "Symbole requis" }, { status: 400 });
    const { data: portfolio } = await supabaseAdmin.from("portfolios").select("id").limit(1).single();
    if (!portfolio) return NextResponse.json({ error: "Portefeuille introuvable" }, { status: 404 });
    await supabaseAdmin.from("watchlist").delete().eq("portfolio_id", portfolio.id).eq("symbol", symbol);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
