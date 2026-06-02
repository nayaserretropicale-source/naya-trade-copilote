import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { symbol } = await req.json();
    const sym = String(symbol ?? "").toUpperCase().trim();
    if (!sym) return NextResponse.json({ error: "Symbole invalide" }, { status: 400 });

    const { data: portfolio } = await supabaseAdmin.from("portfolios").select("*").limit(1).single();
    if (!portfolio) return NextResponse.json({ error: "Portefeuille introuvable" }, { status: 404 });

    const { data: holding } = await supabaseAdmin.from("holdings").select("*")
      .eq("portfolio_id", portfolio.id).eq("symbol", sym).maybeSingle();
    if (!holding || holding.quantity <= 0) return NextResponse.json({ error: "Position introuvable" }, { status: 404 });

    const token = process.env.FINNHUB_API_KEY;
    const q = await fetch(`https://finnhub.io/api/v1/quote?symbol=${sym}&token=${token}`, { cache: "no-store" });
    const quote = await q.json();
    const price = quote.c;
    if (!price) return NextResponse.json({ error: "Prix indisponible" }, { status: 404 });

    const quantity = Number(holding.quantity);
    const proceeds = quantity * price;
    const realizedPl = (price - holding.avg_price) * quantity;

    await supabaseAdmin.from("transactions").insert({
      portfolio_id: portfolio.id, symbol: sym, side: "sell",
      quantity, price, total: proceeds, source: "manual",
    });
    await supabaseAdmin.from("holdings").delete().eq("id", holding.id);
    const newCash = portfolio.cash_balance + proceeds;
    await supabaseAdmin.from("portfolios").update({ cash_balance: newCash }).eq("id", portfolio.id);

    return NextResponse.json({ ok: true, symbol: sym, price, proceeds, realizedPl, newCash });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
