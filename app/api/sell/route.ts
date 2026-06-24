import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getUserPortfolio, unauthorized } from "@/lib/auth";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";

export async function POST(req: NextRequest) {
  try {
    const auth = await getUserPortfolio(req);
    if (!auth) return unauthorized();
    const { portfolio } = auth;
    const body = await req.json();
    const sym = String(body.symbol ?? "").toUpperCase().trim();
    let fraction = Number(body.fraction);
    if (!Number.isFinite(fraction) || fraction <= 0 || fraction > 1) fraction = 1;
    if (!sym) return NextResponse.json({ error: "Symbole invalide" }, { status: 400 });
    const cleanReason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 300) : null;
    const token = process.env.FINNHUB_API_KEY;
    const q = await fetchWithTimeout(`https://finnhub.io/api/v1/quote?symbol=${sym}&token=${token}`, { cache: "no-store" });
    const quote = await q.json();
    const price = quote.c;
    if (!price) return NextResponse.json({ error: "Prix indisponible" }, { status: 404 });

    const { data, error } = await supabaseAdmin.rpc("execute_sell", {
      p_portfolio_id: portfolio.id,
      p_symbol: sym,
      p_fraction: fraction,
      p_price: price,
      p_source: "manual",
      p_reason: cleanReason,
    });
    if (error) {
      if (error.message?.includes("position_not_found")) return NextResponse.json({ error: "Position introuvable" }, { status: 404 });
      throw new Error(error.message);
    }
    const row = data?.[0];
    return NextResponse.json({
      ok: true, symbol: sym, price,
      proceeds: Number(row?.proceeds), realizedPl: Number(row?.realized_pl),
      soldQty: Number(row?.sold_qty), remaining: Number(row?.remaining), newCash: Number(row?.new_cash),
      partial: fraction < 1,
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
