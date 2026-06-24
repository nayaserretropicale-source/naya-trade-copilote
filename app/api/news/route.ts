import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getUserPortfolio, unauthorized } from "@/lib/auth";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";

const FINNHUB = "https://finnhub.io/api/v1";
type NewsItem = { headline: string; source: string; url: string; datetime: number };

function cleanNews(arr: unknown, limit: number): NewsItem[] {
  const list = Array.isArray(arr) ? (arr as Array<Record<string, unknown>>) : [];
  return list
    .filter((n) => n && n.headline && n.url)
    .slice(0, limit)
    .map((n) => ({ headline: String(n.headline), source: String(n.source ?? ""), url: String(n.url), datetime: Number(n.datetime) || 0 }));
}

export async function GET(req: NextRequest) {
  const auth = await getUserPortfolio(req);
  if (!auth) return unauthorized();
  const token = process.env.FINNHUB_API_KEY;
  const symbol = (req.nextUrl.searchParams.get("symbol") || "").toUpperCase().trim();

  if (symbol) {
    const t = new Date().toISOString().slice(0, 10);
    const f = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    try {
      const r = await fetchWithTimeout(`${FINNHUB}/company-news?symbol=${symbol}&from=${f}&to=${t}&token=${token}`, { cache: "no-store" });
      return NextResponse.json({ symbol, news: cleanNews(await r.json(), 8) });
    } catch { return NextResponse.json({ symbol, news: [] }); }
  }

  let general: NewsItem[] = [];
  try { const r = await fetchWithTimeout(`${FINNHUB}/news?category=general&token=${token}`, { cache: "no-store" }); general = cleanNews(await r.json(), 10); } catch {}

  const { data: wl } = await supabaseAdmin.from("watchlist").select("symbol,name").eq("portfolio_id", auth.portfolio.id);
  const movers = await Promise.all((wl ?? []).map(async (m) => {
    let dp: number | null = null;
    try { const q = await fetchWithTimeout(`${FINNHUB}/quote?symbol=${m.symbol}&token=${token}`, { cache: "no-store" }); const d = await q.json(); if (typeof d.dp === "number" && Number.isFinite(d.dp)) dp = Number(d.dp.toFixed(2)); } catch {}
    return { symbol: m.symbol, name: m.name, changePct: dp };
  }));
  const valid = movers.filter((m) => m.changePct !== null) as { symbol: string; name: string; changePct: number }[];
  const up = valid.filter((m) => m.changePct >= 0).sort((a, b) => b.changePct - a.changePct);
  const down = valid.filter((m) => m.changePct < 0).sort((a, b) => a.changePct - b.changePct);

  return NextResponse.json({ general, up, down, watchlist: (wl ?? []).map((m) => ({ symbol: m.symbol, name: m.name })) });
}
