import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getUserPortfolio, unauthorized } from "@/lib/auth";

type Quote = { price: number; prevClose: number | null; stale: boolean; fetchedAt: string | null };

export async function GET(req: NextRequest) {
  const auth = await getUserPortfolio(req);
  if (!auth) return unauthorized();
  const { portfolio } = auth;

  const { data: holdings } = await supabaseAdmin
    .from("holdings")
    .select("*")
    .eq("portfolio_id", portfolio.id);
  const list = holdings ?? [];

  if (list.length === 0) {
    return NextResponse.json({
      positions: [],
      cash_balance: portfolio.cash_balance,
      starting_capital: portfolio.starting_capital,
    });
  }

  const token = process.env.FINNHUB_API_KEY;
  const symbols = Array.from(new Set(list.map((h) => h.symbol)));

  // 1. Filet de sécurité : derniers prix connus en cache
  const { data: cached } = await supabaseAdmin
    .from("price_cache")
    .select("symbol,price,prev_close,fetched_at")
    .in("symbol", symbols);
  const cacheMap = new Map((cached ?? []).map((c) => [c.symbol, c]));

  // 2. Quotes live en parallèle
  const results = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const q = await fetch(
          `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${token}`,
          { cache: "no-store" }
        );
        const d = await q.json();
        if (d && typeof d.c === "number" && d.c > 0) {
          return { symbol, price: d.c as number, prevClose: typeof d.pc === "number" && d.pc > 0 ? d.pc : null };
        }
      } catch {}
      return { symbol, price: null as number | null, prevClose: null as number | null };
    })
  );

  const now = new Date().toISOString();
  const quotes = new Map<string, Quote>();
  const upserts: { symbol: string; price: number; prev_close: number | null; fetched_at: string }[] = [];

  for (const r of results) {
    if (r.price !== null) {
      quotes.set(r.symbol, { price: r.price, prevClose: r.prevClose, stale: false, fetchedAt: now });
      upserts.push({ symbol: r.symbol, price: r.price, prev_close: r.prevClose, fetched_at: now });
    } else {
      const c = cacheMap.get(r.symbol);
      quotes.set(
        r.symbol,
        c
          ? { price: Number(c.price), prevClose: c.prev_close !== null ? Number(c.prev_close) : null, stale: true, fetchedAt: c.fetched_at }
          : { price: NaN, prevClose: null, stale: true, fetchedAt: null }
      );
    }
  }

  // 3. Entretien du cache
  if (upserts.length) {
    try {
      await supabaseAdmin.from("price_cache").upsert(upserts, { onConflict: "symbol" });
    } catch {}
  }

  const positions = list.map((h) => {
    const q = quotes.get(h.symbol)!;
    const hasPrice = Number.isFinite(q.price);
    const price = hasPrice ? q.price : h.avg_price;
    const priceSource: "live" | "cache" | "achat" = !q.stale ? "live" : hasPrice ? "cache" : "achat";
    const currentValueUsd = h.quantity * price;
    const costUsd = h.quantity * h.avg_price;
    const plUsd = currentValueUsd - costUsd;

    // Variation du jour (vs clôture de la veille)
    const dayPlUsd = q.prevClose !== null && hasPrice ? h.quantity * (price - q.prevClose) : null;
    const dayPlPct = q.prevClose !== null && hasPrice && q.prevClose > 0
      ? Number((((price - q.prevClose) / q.prevClose) * 100).toFixed(2))
      : null;

    return {
      symbol: h.symbol,
      name: h.name ?? h.symbol,
      quantity: h.quantity,
      avgPrice: h.avg_price,
      price,
      prevClose: q.prevClose,
      currentValueUsd,
      costUsd,
      plUsd,
      plPct: Number((costUsd > 0 ? (plUsd / costUsd) * 100 : 0).toFixed(1)),
      dayPlUsd,
      dayPlPct,
      stale: q.stale,
      priceSource,
      priceAt: q.fetchedAt,
    };
  });

  return NextResponse.json({
    positions,
    cash_balance: portfolio.cash_balance,
    starting_capital: portfolio.starting_capital,
  });
}
