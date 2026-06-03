import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const TD = "https://api.twelvedata.com";
const FINNHUB = "https://finnhub.io/api/v1";

export async function GET() {
  const fk = process.env.FINNHUB_API_KEY;
  const tk = process.env.TWELVEDATA_API_KEY;
  try {
    const { data: portfolio } = await supabaseAdmin.from("portfolios").select("id").limit(1).single();
    let list: { symbol: string; name: string; tier: string; explain: string | null }[] = [];
    if (portfolio) {
      const { data } = await supabaseAdmin.from("watchlist").select("symbol,name,tier,explain")
        .eq("portfolio_id", portfolio.id).order("created_at", { ascending: true });
      list = data ?? [];
    }

    const markets = await Promise.all(list.map(async (m) => {
      let changePct: number | null = null;
      try {
        const r = await fetch(`${FINNHUB}/quote?symbol=${m.symbol}&token=${fk}`, { cache: "no-store" });
        const d = await r.json();
        if (typeof d.dp === "number" && Number.isFinite(d.dp)) changePct = Number(d.dp.toFixed(2));
      } catch {}
      return { symbol: m.symbol, name: m.name, tier: m.tier, explain: m.explain ?? "", changePct };
    }));

    let points: { date: string; close: number }[] = [];
    try {
      const cRes = await fetch(`${TD}/time_series?symbol=SPY&interval=1day&outputsize=90&apikey=${tk}`, { cache: "no-store" });
      const cData = await cRes.json();
      if (Array.isArray(cData.values)) {
        points = cData.values.map((v: { datetime: string; close: string }) => ({ date: v.datetime, close: parseFloat(v.close) })).filter((p: { close: number }) => Number.isFinite(p.close)).reverse();
      }
    } catch {}

    return NextResponse.json({ markets, chart: { symbol: "SPY", points } });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
