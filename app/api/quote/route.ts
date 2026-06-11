import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol")?.toUpperCase() ?? "AAPL";
  const token = process.env.FINNHUB_API_KEY;
  if (!token) {
    return NextResponse.json({ error: "Clé API Finnhub manquante" }, { status: 500 });
  }

  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${token}`,
      { cache: "no-store" }
    );
    if (!res.ok) throw new Error("finnhub_error");

    const data = await res.json();
    // Finnhub renvoie 0 quand le symbole est inconnu
    if (!data.c) {
      return NextResponse.json({ error: "Symbole introuvable" }, { status: 404 });
    }

    // Entretien du cache partagé : chaque quote réussie est mémorisée
    try {
      await supabaseAdmin.from("price_cache").upsert(
        { symbol, price: data.c, prev_close: data.pc ?? null, fetched_at: new Date().toISOString() },
        { onConflict: "symbol" }
      );
    } catch {}

    return NextResponse.json({
      symbol,
      price: data.c,        // prix actuel
      change: data.d,       // variation (USD)
      changePct: data.dp,   // variation (%)
      prevClose: data.pc,   // clôture de la veille
      high: data.h,         // plus haut du jour
      low: data.l,          // plus bas du jour
      stale: false,
    });
  } catch {
    // Finnhub indisponible ou throttlé → dernier prix connu du cache
    const { data: c } = await supabaseAdmin
      .from("price_cache")
      .select("symbol,price,prev_close,fetched_at")
      .eq("symbol", symbol)
      .single();

    if (c) {
      const price = Number(c.price);
      const prevClose = c.prev_close !== null ? Number(c.prev_close) : null;
      return NextResponse.json({
        symbol,
        price,
        change: prevClose !== null ? Number((price - prevClose).toFixed(2)) : null,
        changePct: prevClose ? Number((((price - prevClose) / prevClose) * 100).toFixed(2)) : null,
        prevClose,
        high: null,
        low: null,
        stale: true,
        priceAt: c.fetched_at,
      });
    }

    return NextResponse.json({ error: "Connexion impossible" }, { status: 500 });
  }
}
