import { NextRequest, NextResponse } from "next/server";

type Bar = { date: string; close: number };

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const symbol = (sp.get("symbol") ?? "AAPL").toUpperCase().trim();

  const rawShort = Number(sp.get("short"));
  const rawLong = Number(sp.get("long"));
  const shortP = Number.isFinite(rawShort) && rawShort >= 2 ? Math.floor(rawShort) : 20;
  let longP = Number.isFinite(rawLong) && rawLong > shortP ? Math.floor(rawLong) : 50;
  if (longP <= shortP) longP = shortP + 1;

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=2y&interval=1d`;
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    });
    const data = await res.json();

    const result = data?.chart?.result?.[0];
    if (!result || !Array.isArray(result.timestamp)) {
      const msg = data?.chart?.error?.description || "Symbole introuvable ou donnees indisponibles.";
      return NextResponse.json({ error: msg }, { status: 404 });
    }

    const timestamps: number[] = result.timestamp;
    const quote = result.indicators?.quote?.[0];
    const adj = result.indicators?.adjclose?.[0]?.adjclose;
    const rawCloses: (number | null)[] = adj || quote?.close || [];

    let bars: Bar[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const c = rawCloses[i];
      if (typeof c === "number" && Number.isFinite(c)) {
        bars.push({ date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10), close: c });
      }
    }

    if (bars.length < longP + 5) {
      return NextResponse.json({ error: "Pas assez de donnees pour ce symbole." }, { status: 400 });
    }
    if (bars.length > 520) bars = bars.slice(bars.length - 520);

    const closes = bars.map((b) => b.close);
    const sma = (i: number, p: number): number | null => {
      if (i + 1 < p) return null;
      let s = 0;
      for (let k = i - p + 1; k <= i; k++) s += closes[k];
      return s / p;
    };

    const startCap = 1000;
    let equity = startCap, entry = 0, trades = 0, wins = 0, peak = startCap, maxDD = 0;
    let inMarket = false;
    const holdStart = closes[0];
    const curve: { date: string; strat: number; hold: number }[] = [];

    for (let i = 0; i < bars.length; i++) {
      if (inMarket && i > 0) equity *= closes[i] / closes[i - 1];
      const sS = sma(i, shortP), sL = sma(i, longP);
      const pS = sma(i - 1, shortP), pL = sma(i - 1, longP);
      if (sS !== null && sL !== null && pS !== null && pL !== null) {
        const up = pS <= pL && sS > sL;
        const down = pS >= pL && sS < sL;
        if (!inMarket && up) { inMarket = true; entry = closes[i]; }
        else if (inMarket && down) { inMarket = false; trades++; if (closes[i] > entry) wins++; }
      }
      if (equity > peak) peak = equity;
      const dd = (peak - equity) / peak;
      if (dd > maxDD) maxDD = dd;
      curve.push({ date: bars[i].date, strat: equity, hold: startCap * (closes[i] / holdStart) });
    }
    if (inMarket) { trades++; if (closes[closes.length - 1] > entry) wins++; }

    const stratReturn = ((equity - startCap) / startCap) * 100;
    const holdReturn = ((closes[closes.length - 1] - holdStart) / holdStart) * 100;
    const winRate = trades > 0 ? (wins / trades) * 100 : 0;

    const step = Math.max(1, Math.floor(curve.length / 120));
    const slim = curve.filter((_, idx) => idx % step === 0);

    return NextResponse.json({
      symbol, shortP, longP,
      from: bars[0].date, to: bars[bars.length - 1].date,
      stratReturn: Number(stratReturn.toFixed(1)),
      holdReturn: Number(holdReturn.toFixed(1)),
      trades, winRate: Number(winRate.toFixed(0)),
      maxDrawdown: Number((maxDD * 100).toFixed(1)),
      curve: slim,
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
