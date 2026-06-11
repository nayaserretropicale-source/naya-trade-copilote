import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getUserPortfolio, unauthorized } from "@/lib/auth";
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
    let amountUsd = Number(amountXof) / rate;
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) return NextResponse.json({ error: "Montant invalide" }, { status: 400 });
    if (amountUsd > maxPerTrade) amountUsd = maxPerTrade;
    if (amountUsd > portfolio.cash_balance) return NextResponse.json({ error: "Liquidités insuffisantes" }, { status: 400 });
    const token = process.env.FINNHUB_API_KEY;
    const q = await fetch(`https://finnhub.io/api/v1/quote?symbol=${sym}&token=${token}`, { cache: "no-store" });
    const quote = await q.json();
    const price = quote.c;
    if (!price) return NextResponse.json({ error: "Prix indisponible — vérifie le symbole" }, { status: 404 });
    const quantity = amountUsd / price;
    await supabaseAdmin.from("transactions").insert({ portfolio_id: portfolio.id, symbol: sym, side: "buy", quantity, price, total: amountUsd, source: "manual", reason: cleanReason });
    const { data: existing } = await supabaseAdmin.from("holdings").select("*").eq("portfolio_id", portfolio.id).eq("symbol", sym).maybeSingle();
    if (existing) {
      const newQty = Number(existing.quantity) + quantity;
      const newAvg = (existing.quantity * existing.avg_price + quantity * price) / newQty;
      await supabaseAdmin.from("holdings").update({ quantity: newQty, avg_price: newAvg, updated_at: new Date().toISOString() }).eq("id", existing.id);
    } else {
      await supabaseAdmin.from("holdings").insert({ portfolio_id: portfolio.id, symbol: sym, name: sym, quantity, avg_price: price });
    }
    const newCash = portfolio.cash_balance - amountUsd;
    await supabaseAdmin.from("portfolios").update({ cash_balance: newCash }).eq("id", portfolio.id);
    return NextResponse.json({ ok: true, symbol: sym, quantity, price, newCash });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
