import { NextResponse } from "next/server";

const TD = "https://api.twelvedata.com";
const INDICES = [
  { name: "S&P 500", symbol: "SPY" },
  { name: "Nasdaq 100", symbol: "QQQ" },
  { name: "Dow Jones", symbol: "DIA" },
];

export async function GET() {
  const key = process.env.TWELVEDATA_API_KEY;
  if (!key) return NextResponse.json({ error: "Cle Twelve Data manquante" }, { status: 500 });

  try {
    const symbols = INDICES.map((i) => i.symbol).join(",");
    const qRes = await fetch(`${TD}/quote?symbol=${symbols}&apikey=${key}`, { cache: "no-store" });
    const qData = await qRes.json();

    const indices = INDICES.map((i) => {
      const d = qData[i.symbol] ?? (qData.symbol === i.symbol ? qData : null);
      const price = d ? parseFloat(d.close) : NaN;
      const pct = d ? parseFloat(d.percent_change) : NaN;
      return {
        name: i.name, symbol: i.symbol,
        price: Number.isFinite(price) ? price : null,
        changePct: Number.isFinite(pct) ? Number(pct.toFixed(2)) : null,
      };
    });

    const cRes = await fetch(`${TD}/time_series?symbol=SPY&interval=1day&outputsize=90&apikey=${key}`, { cache: "no-store" });
    const cData = await cRes.json();
    let points: { date: string; close: number }[] = [];
    if (Array.isArray(cData.values)) {
      points = cData.values
        .map((v: { datetime: string; close: string }) => ({ date: v.datetime, close: parseFloat(v.close) }))
        .filter((p: { close: number }) => Number.isFinite(p.close))
        .reverse();
    }

    return NextResponse.json({ indices, chart: { symbol: "SPY", points } });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
