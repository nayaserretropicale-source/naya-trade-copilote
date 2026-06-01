import { NextRequest, NextResponse } from "next/server";

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

    if (!res.ok) {
      return NextResponse.json({ error: "Erreur côté Finnhub" }, { status: 502 });
    }

    const data = await res.json();

    // Finnhub renvoie 0 quand le symbole est inconnu
    if (!data.c) {
      return NextResponse.json({ error: "Symbole introuvable" }, { status: 404 });
    }

    return NextResponse.json({
      symbol,
      price: data.c,        // prix actuel
      change: data.d,       // variation (USD)
      changePct: data.dp,   // variation (%)
      prevClose: data.pc,   // clôture de la veille
      high: data.h,         // plus haut du jour
      low: data.l,          // plus bas du jour
    });
  } catch {
    return NextResponse.json({ error: "Connexion impossible" }, { status: 500 });
  }
}
