import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

type Tx = { symbol: string; side: string; quantity: number; price: number; total: number; created_at: string };

export async function GET() {
  const { data: portfolio } = await supabaseAdmin.from("portfolios").select("id").limit(1).single();
  if (!portfolio) return NextResponse.json({ operations: [], daily: [], totalRealizedPl: 0 });

  const { data: txs } = await supabaseAdmin.from("transactions").select("*")
    .eq("portfolio_id", portfolio.id).order("created_at", { ascending: true });

  const cost: Record<string, { qty: number; avg: number }> = {};
  const ops: Array<{ date: string; symbol: string; side: string; quantity: number; price: number; total: number; realizedPl: number | null }> = [];
  let totalRealizedPl = 0;

  for (const tx of (txs ?? []) as Tx[]) {
    let realizedPl: number | null = null;
    const c = cost[tx.symbol] || { qty: 0, avg: 0 };
    if (tx.side === "buy") {
      const newQty = c.qty + tx.quantity;
      cost[tx.symbol] = { qty: newQty, avg: newQty > 0 ? (c.qty * c.avg + tx.quantity * tx.price) / newQty : tx.price };
    } else {
      const avg = c.qty > 0 ? c.avg : tx.price;
      realizedPl = (tx.price - avg) * tx.quantity;
      totalRealizedPl += realizedPl;
      cost[tx.symbol] = { qty: c.qty - tx.quantity, avg };
    }
    ops.push({ date: tx.created_at, symbol: tx.symbol, side: tx.side, quantity: tx.quantity, price: tx.price, total: tx.total, realizedPl });
  }

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
