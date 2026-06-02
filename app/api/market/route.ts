import { NextResponse } from "next/server";

const TD = "https://api.twelvedata.com";

const MARKETS = [
  { symbol: "BND",  name: "Obligations US", tier: "Prudent",   explain: "Prêts aux États et grandes entreprises. Bouge peu — le coussin stable." },
  { symbol: "GLD",  name: "Or",             tier: "Prudent",   explain: "Valeur refuge. Monte souvent quand les actions baissent — ça équilibre." },
  { symbol: "UUP",  name: "Dollar US",      tier: "Prudent",   explain: "Suit la force du dollar US face aux autres devises. Pour le surveiller ; bouge peu et ne « rapporte » pas comme une action." },
  { symbol: "FXE",  name: "Euro",           tier: "Prudent",   explain: "Suit l'euro face au dollar. Pour garder un œil sur la monnaie européenne." },
  { symbol: "SPY",  name: "S&P 500",        tier: "Équilibré", explain: "Les 500 plus grandes entreprises américaines en un achat. La base diversifiée." },
  { symbol: "VXUS", name: "Monde hors US",  tier: "Équilibré", explain: "Europe, Asie, etc. Pour ne pas dépendre uniquement des États-Unis." },
  { symbol: "QQQ",  name: "Nasdaq (tech)",  tier: "Dynamique", explain: "100 grandes entreprises tech. Plus de potentiel, mais ça secoue plus." },
  { symbol: "NKE",  name: "Nike",           tier: "Dynamique", explain: "Action d'une seule entreprise (Nike). Plus risqué qu'un indice : tout repose sur une société." },
  { symbol: "IBIT", name: "Bitcoin (ETF)",  tier: "Dynamique", explain: "Exposition au Bitcoin. Très volatil : fortes hausses ET fortes baisses. À petite dose." },
];

export async function GET() {
  const key = process.env.TWELVEDATA_API_KEY;
  if (!key) return NextResponse.json({ error: "Cle Twelve Data manquante" }, { status: 500 });

  try {
    const symbols = MARKETS.map((m) => m.symbol).join(",");
    const qRes = await fetch(`${TD}/quote?symbol=${symbols}&apikey=${key}`, { cache: "no-store" });
    const qData = await qRes.json();

    const markets = MARKETS.map((m) => {
      const d = qData[m.symbol] ?? (qData.symbol === m.symbol ? qData : null);
      const pct = d ? parseFloat(d.percent_change) : NaN;
      return {
        symbol: m.symbol, name: m.name, tier: m.tier, explain: m.explain,
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

    return NextResponse.json({ markets, chart: { symbol: "SPY", points } });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
