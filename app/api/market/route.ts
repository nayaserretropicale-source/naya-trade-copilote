import { NextResponse } from "next/server";

const TD = "https://api.twelvedata.com";

const MARKETS = [
  { symbol: "SPY", name: "S&P 500", risk: "Modéré", desc: "Les 500 plus grandes entreprises américaines. Large et diversifié." },
  { symbol: "DIA", name: "Dow Jones", risk: "Modéré", desc: "30 grandes entreprises américaines bien établies." },
  { symbol: "QQQ", name: "Nasdaq 100", risk: "Élevé", desc: "100 valeurs technologiques US. Plus de potentiel, plus de secousses." },
  { symbol: "IWM", name: "Petites caps US", risk: "Élevé", desc: "Petites entreprises américaines : plus volatiles." },
  { symbol: "EFA", name: "Actions internationales", risk: "Modéré", desc: "Grandes entreprises hors USA (Europe, Asie développée)." },
  { symbol: "EEM", name: "Marchés émergents", risk: "Élevé", desc: "Pays en développement : fort potentiel, fort risque." },
  { symbol: "BND", name: "Obligations US", risk: "Faible", desc: "Prêts aux États et entreprises. Peu de rendement, mais le coussin de sécurité." },
  { symbol: "GLD", name: "Or", risk: "Modéré", desc: "Valeur refuge : souvent en hausse quand les actions chutent." },
];

export async function GET() {
  const key = process.env.TWELVEDATA_API_KEY;
  if (!key) return NextResponse.json({ error: "Cle Twelve Data manquante" }, { status: 500 });

  try {
    const symbols = MARKETS.map((m) => m.symbol).join(",");
    const qRes = await fetch(`${TD}/quote?symbol=${symbols}&apikey=${key}`, { cache: "no-store" });
    const qData = await qRes.json();

    const indices = MARKETS.map((m) => {
      const d = qData[m.symbol] ?? (qData.symbol === m.symbol ? qData : null);
      const pct = d ? parseFloat(d.percent_change) : NaN;
      return { ...m, changePct: Number.isFinite(pct) ? Number(pct.toFixed(2)) : null };
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
