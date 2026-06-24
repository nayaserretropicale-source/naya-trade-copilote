import { supabaseAdmin } from "@/lib/supabase";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { replayCostBasis } from "@/lib/costBasis";

export async function buildDailyRecap(portfolioId: string) {
  const { data: portfolio } = await supabaseAdmin.from("portfolios").select("*").eq("id", portfolioId).single();
  if (!portfolio) throw new Error("Portefeuille introuvable");
  const { data: settings } = await supabaseAdmin.from("settings").select("*").eq("portfolio_id", portfolio.id).maybeSingle();
  const { data: holdings } = await supabaseAdmin.from("holdings").select("*").eq("portfolio_id", portfolio.id);
  const { data: txs } = await supabaseAdmin.from("transactions").select("*").eq("portfolio_id", portfolio.id).order("created_at", { ascending: true });

  const rate = settings?.usd_to_xof ?? 600;
  const token = process.env.FINNHUB_API_KEY;

  let holdingsValue = 0;
  for (const h of holdings ?? []) {
    let price = h.avg_price;
    try { const q = await fetchWithTimeout(`https://finnhub.io/api/v1/quote?symbol=${h.symbol}&token=${token}`, { cache: "no-store" }); const d = await q.json(); if (d.c) price = d.c; } catch {}
    holdingsValue += h.quantity * price;
  }
  const totalValue = portfolio.cash_balance + holdingsValue;
  const overallPl = totalValue - portfolio.starting_capital;

  const today = new Date().toISOString().slice(0, 10);
  const events = replayCostBasis(txs ?? []);
  let todayRealized = 0, todaySells = 0, todayBuys = 0;
  for (const { tx, realizedPl } of events) {
    const isToday = String((tx as { created_at: string }).created_at).slice(0, 10) === today;
    if (!isToday) continue;
    if (tx.side === "buy") todayBuys++;
    else { todayRealized += realizedPl ?? 0; todaySells++; }
  }

  const fcfa = (usd: number) => Math.round(usd * rate).toLocaleString("fr-FR") + " FCFA";
  const sign = (usd: number) => (usd >= 0 ? "+" : "−") + Math.round(Math.abs(usd) * rate).toLocaleString("fr-FR") + " FCFA";

  const text =
`📊 Récap du jour — Naya Copilote

💼 Portefeuille : ${fcfa(totalValue)}
${overallPl >= 0 ? "📈" : "📉"} Depuis le départ : ${sign(overallPl)}

📅 Aujourd'hui :
- ${todayBuys} achat(s), ${todaySells} vente(s)
- Gain/perte réalisé : ${todaySells > 0 ? sign(todayRealized) : "—"}

(Simulation — pour apprendre, sans argent réel)`;

  return { text, totalValue, overallPl, todayRealized, todaySells, todayBuys };
}
