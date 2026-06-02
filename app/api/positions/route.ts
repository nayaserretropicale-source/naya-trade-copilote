import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const { data: portfolio } = await supabaseAdmin.from("portfolios").select("*").limit(1).single();
  if (!portfolio) return NextResponse.json({ positions: [], cash_balance: 0, starting_capital: 0 });
  const { data: holdings } = await supabaseAdmin.from("holdings").select("*").eq("portfolio_id", portfolio.id);

  const token = process.env.FINNHUB_API_KEY;
  const positions = [];
  for (const h of holdings ?? []) {
    let price = h.avg_price;
    try {
      const q = await fetch(`https://finnhub.io/api/v1/quote?symbol=${h.symbol}&token=${token}`, { cache: "no-store" });
      const d = await q.json();
      if (d.c) price = d.c;
    } catch {}
    const currentValueUsd = h.quantity * price;
    const costUsd = h.quantity * h.avg_price;
    const plUsd = currentValueUsd - costUsd;
    positions.push({
      symbol: h.symbol, name: h.name ?? h.symbol,
      quantity: h.quantity, avgPrice: h.avg_price, price,
      currentValueUsd, costUsd, plUsd,
      plPct: Number((costUsd > 0 ? (plUsd / costUsd) * 100 : 0).toFixed(1)),
    });
  }
  return NextResponse.json({ positions, cash_balance: portfolio.cash_balance, starting_capital: portfolio.starting_capital });
}
