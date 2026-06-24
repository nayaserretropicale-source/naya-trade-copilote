import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getUserPortfolio, unauthorized } from "@/lib/auth";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";

export async function POST(req: NextRequest) {
  try {
    const auth = await getUserPortfolio(req);
    if (!auth) return unauthorized();
    const { portfolio, settings } = auth;
    const { symbol, amountXof, reason } = await req.json();
    const sym = String(symbol ?? "").toUpperCase().trim();
    if (!sym) return NextResponse.json({ error: "Symbole invalide" }, { status: 400 });
    const cleanReason = typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 300) : null;
    const rate = settings?.usd_to_xof ?? 600;
    const maxPerTrade = settings?.max_per_trade ?? 50;
    if (settings?.agents_paused) return NextResponse.json({ error: "Coupe-circuit actif" }, { status: 403 });
    const requestedUsd = Number(amountXof) / rate;
    if (!Number.isFinite(requestedUsd) || requestedUsd <= 0) return NextResponse.json({ error: "Montant invalide" }, { status: 400 });
    const amountUsd = Math.min(requestedUsd, maxPerTrade);
    const capped = amountUsd < requestedUsd;
    const token = process.env.FINNHUB_API_KEY;
    const q = await fetchWithTimeout(`https://finnhub.io/api/v1/quote?symbol=${sym}&token=${token}`, { cache: "no-store" });
    const quote = await q.json();
    const price = quote.c;
    if (!price) return NextResponse.json({ error: "Prix indisponible — vérifie le symbole" }, { status: 404 });
    const quantity = amountUsd / price;

    const { data, error } = await supabaseAdmin.rpc("execute_buy", {
      p_portfolio_id: portfolio.id,
      p_symbol: sym,
      p_name: sym,
      p_quantity: quantity,
      p_price: price,
      p_amount: amountUsd,
      p_source: "manual",
      p_reason: cleanReason,
    });
    if (error) {
      if (error.message?.includes("insufficient_cash")) return NextResponse.json({ error: "Liquidités insuffisantes" }, { status: 400 });
      throw new Error(error.message);
    }
    const newCash = Number(data?.[0]?.new_cash);
    return NextResponse.json({ ok: true, symbol: sym, quantity, price, newCash, capped, requestedUsd: capped ? requestedUsd : undefined, cappedAtUsd: capped ? maxPerTrade : undefined });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
