import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getUserPortfolio, unauthorized } from "@/lib/auth";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";

const TD = "https://api.twelvedata.com";
const FINNHUB = "https://finnhub.io/api/v1";

export async function GET(req: NextRequest) {
  const auth = await getUserPortfolio(req);
  if (!auth) return unauthorized();
  const { portfolio } = auth;
  const fk = process.env.FINNHUB_API_KEY;
  const tk = process.env.TWELVEDATA_API_KEY;
  try {
    const { data } = await supabaseAdmin.from("watchlist").select("symbol,name,tier,explain").eq("portfolio_id", portfolio.id).order("created_at", { ascending: true });
    const list = data ?? [];

    const markets = await Promise.all(list.map(async (m) => {
      let changePct: number | null = null;
      try {
        const r = await fetchWithTimeout(`${FINNHUB}/quote?symbol=${m.symbol}&token=${fk}`, { cache: "no-store" });
        const d = await r.json();
        if (typeof d.dp === "number" && Number.isFinite(d.dp)) changePct = Number(d.dp.toFixed(2));
      } catch {}
      return { symbol: m.symbol, name: m.name, tier: m.tier, explain: m.explain ?? "", changePct };
    }));

    let points: { date: string; close: number }[] = [];
    try {
      const cRes = await fetchWithTimeout(`${TD}/time_series?symbol=SPY&interval=1day&outputsize=90&apikey=${tk}`, { cache: "no-store" });
      const cData = await cRes.json();
      if (Array.isArray(cData.values)) points = cData.values.map((v: { datetime: string; close: string }) => ({ date: v.datetime, close: parseFloat(v.close) })).filter((p: { close: number }) => Number.isFinite(p.close)).reverse();
    } catch {}

    return NextResponse.json({ markets, chart: { symbol: "SPY", points } });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
