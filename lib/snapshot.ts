import { supabaseAdmin } from "@/lib/supabase";

export async function recordSnapshot() {
  const { data: portfolio } = await supabaseAdmin.from("portfolios").select("*").limit(1).single();
  if (!portfolio) return null;
  const { data: holdings } = await supabaseAdmin.from("holdings").select("*").eq("portfolio_id", portfolio.id);

  const token = process.env.FINNHUB_API_KEY;
  let holdingsValue = 0;
  for (const h of holdings ?? []) {
    let price = h.avg_price;
    try { const q = await fetch(`https://finnhub.io/api/v1/quote?symbol=${h.symbol}&token=${token}`, { cache: "no-store" }); const d = await q.json(); if (d.c) price = d.c; } catch {}
    holdingsValue += h.quantity * price;
  }
  const value = portfolio.cash_balance + holdingsValue;
  const snapshot_date = new Date().toISOString().slice(0, 10);

  await supabaseAdmin.from("portfolio_snapshots")
    .upsert({ portfolio_id: portfolio.id, snapshot_date, value }, { onConflict: "portfolio_id,snapshot_date" });

  return value;
}

export async function getSnapshots() {
  const { data: portfolio } = await supabaseAdmin.from("portfolios").select("id,starting_capital").limit(1).single();
  if (!portfolio) return { series: [], starting: 0 };
  const { data } = await supabaseAdmin.from("portfolio_snapshots").select("snapshot_date,value")
    .eq("portfolio_id", portfolio.id).order("snapshot_date", { ascending: true });
  return { series: (data ?? []).map((s) => ({ date: s.snapshot_date, value: Number(s.value) })), starting: Number(portfolio.starting_capital) };
}
