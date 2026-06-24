import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { callClaudeWithRetry } from "@/lib/anthropicRetry";

export async function generateReport(portfolioId: string) {
  const { data: portfolio } = await supabaseAdmin.from("portfolios").select("*").eq("id", portfolioId).single();
  if (!portfolio) throw new Error("Portefeuille introuvable");
  const { data: settings } = await supabaseAdmin.from("settings").select("*").eq("portfolio_id", portfolio.id).maybeSingle();
  const { data: holdings } = await supabaseAdmin.from("holdings").select("*").eq("portfolio_id", portfolio.id);

  const rate = settings?.usd_to_xof ?? 600;
  const token = process.env.FINNHUB_API_KEY;

  let holdingsValue = 0;
  let dayChangeUsd = 0, dayBaseUsd = 0;
  const posVals: { symbol: string; value: number; plPct: number }[] = [];
  for (const h of holdings ?? []) {
    let price = h.avg_price;
    try {
      const q = await fetchWithTimeout(`https://finnhub.io/api/v1/quote?symbol=${h.symbol}&token=${token}`, { cache: "no-store" });
      const d = await q.json();
      if (d.c) price = d.c;
      if (typeof d.pc === "number" && d.pc > 0) { dayChangeUsd += h.quantity * (price - d.pc); dayBaseUsd += h.quantity * d.pc; }
    } catch {}
    const value = h.quantity * price; const cost = h.quantity * h.avg_price;
    holdingsValue += value;
    posVals.push({ symbol: h.symbol, value, plPct: cost > 0 ? (value - cost) / cost * 100 : 0 });
  }
  const totalValue = portfolio.cash_balance + holdingsValue;
  const overallPl = totalValue - portfolio.starting_capital;
  const dayChangePct = dayBaseUsd > 0 ? (dayChangeUsd / dayBaseUsd) * 100 : 0;
  const positions = posVals.map((p) => ({ symbol: p.symbol, part_pct: totalValue > 0 ? Number((p.value / totalValue * 100).toFixed(0)) : 0, gain_perte_pct: Number(p.plPct.toFixed(0)) }));

  const context = {
    valeur_totale_fcfa: Math.round(totalValue * rate),
    liquidites_fcfa: Math.round(portfolio.cash_balance * rate),
    gain_perte_total_fcfa: Math.round(overallPl * rate),
    positions,
  };

  const system = `Tu es l'analyste du soir de "Naya Copilote Marche", une app de paper trading (simulation) pour un debutant en Cote d'Ivoire. Tu rediges un court rapport du soir, bienveillant et honnete.
- Tutoiement, francais simple, sans jargon.
- Tu ne predis JAMAIS les prix et ne promets aucun gain. Tu commentes l'etat du portefeuille et les bonnes habitudes (diversification, prudence, patience).
- Evalue le risque global: "faible", "modere" ou "eleve" (concentration elevee ou paris volatils = plus eleve).
Repond UNIQUEMENT avec un JSON valide, sans texte ni Markdown autour:
{"title":"...","summary":"...","risk_level":"faible"}
summary: 3 a 5 phrases.`;

  const anthropic = new Anthropic();
  const msg = await callClaudeWithRetry(anthropic, { model: "claude-sonnet-4-6", max_tokens: 700, system, messages: [{ role: "user", content: `Contexte:\n${JSON.stringify(context, null, 2)}\n\nRedige le rapport.` }] });
  const raw = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim().replace(/```json|```/g, "").trim();
  let parsed: { title?: string; summary?: string; risk_level?: string } = {};
  try { parsed = JSON.parse(raw); } catch {}
  const title = String(parsed.title || "Rapport du soir").slice(0, 120);
  const summary = String(parsed.summary || "").slice(0, 1200);
  const risk_level = ["faible", "modere", "eleve"].includes(String(parsed.risk_level)) ? String(parsed.risk_level) : "faible";

  const report_date = new Date().toISOString().slice(0, 10);
  await supabaseAdmin.from("reports").upsert({ portfolio_id: portfolio.id, report_date, title, summary, risk_level, portfolio_value: totalValue, day_change_pct: Number(dayChangePct.toFixed(2)) }, { onConflict: "portfolio_id,report_date" });

  return { title, summary, risk_level };
}
