import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getUserPortfolio, unauthorized } from "@/lib/auth";
import { replayCostBasis } from "@/lib/costBasis";

type Tx = { symbol: string; side: string; quantity: number; price: number; total: number; created_at: string };

export async function GET(req: NextRequest) {
  const auth = await getUserPortfolio(req);
  if (!auth) return unauthorized();
  const { portfolio } = auth;

  const { data: txs } = await supabaseAdmin.from("transactions").select("*").eq("portfolio_id", portfolio.id).order("created_at", { ascending: true });

  const events = replayCostBasis((txs ?? []) as Tx[]);
  let totalRealizedPl = 0;
  const ops = events.map(({ tx, realizedPl }) => {
    if (realizedPl !== null) totalRealizedPl += realizedPl;
    return { date: tx.created_at, symbol: tx.symbol, side: tx.side, quantity: tx.quantity, price: tx.price, total: tx.total, realizedPl };
  });

  const dayMap: Record<string, { realizedPl: number; buys: number; sells: number }> = {};
  for (const o of ops) {
    const day = o.date.slice(0, 10);
    const d = dayMap[day] || { realizedPl: 0, buys: 0, sells: 0 };
    if (o.side === "buy") d.buys += 1;
    else { d.sells += 1; d.realizedPl += o.realizedPl || 0; }
    dayMap[day] = d;
  }
  const daily = Object.entries(dayMap).map(([date, v]) => ({ date, ...v })).sort((a, b) => b.date.localeCompare(a.date));
  const operations = ops.slice().reverse();

  return NextResponse.json({ operations, daily, totalRealizedPl });
}
