import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase";

function isOverloaded(e: unknown): boolean {
  const status = (e as { status?: number })?.status;
  return status === 529 || status === 503 || status === 500 || /overload/i.test(String((e as Error)?.message));
}
async function callClaudeWithRetry(anthropic: Anthropic, params: Anthropic.MessageCreateParams, tries = 4): Promise<Anthropic.Message> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await anthropic.messages.create(params) as Anthropic.Message; }
    catch (e) { lastErr = e; if (isOverloaded(e) && i < tries - 1) { await new Promise((r) => setTimeout(r, 600 * (i + 1))); continue; } throw e; }
  }
  throw lastErr;
}

export async function generateWeeklyReview(portfolioId: string) {
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
    try { const q = await fetch(`https://finnhub.io/api/v1/quote?symbol=${h.symbol}&token=${token}`, { cache: "no-store" }); const d = await q.json(); if (d.c) price = d.c; } catch {}
    holdingsValue += h.quantity * price;
  }
  const totalValue = portfolio.cash_balance + holdingsValue;
  const overallPl = totalValue - portfolio.starting_capital;

  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const cost: Record<string, { qty: number; avg: number }> = {};
  let weekRealized = 0, weekBuys = 0, weekSells = 0;
  for (const tx of txs ?? []) {
    const inWeek = new Date(tx.created_at).getTime() >= weekAgo;
    const c = cost[tx.symbol] || { qty: 0, avg: 0 };
    if (tx.side === "buy") {
      const nq = c.qty + tx.quantity;
      cost[tx.symbol] = { qty: nq, avg: nq > 0 ? (c.qty * c.avg + tx.quantity * tx.price) / nq : tx.price };
      if (inWeek) weekBuys++;
    } else {
      const avg = c.qty > 0 ? c.avg : tx.price;
      if (inWeek) { weekRealized += (tx.price - avg) * tx.quantity; weekSells++; }
      cost[tx.symbol] = { qty: c.qty - tx.quantity, avg };
    }
  }

  const concentration = (holdings ?? []).length && totalValue > 0
    ? Math.max(...(holdings ?? []).map((h) => (h.quantity * h.avg_price) / totalValue * 100)) : 0;

  const context = {
    valeur_totale_fcfa: Math.round(totalValue * rate),
    gain_perte_total_fcfa: Math.round(overallPl * rate),
    cette_semaine: { achats: weekBuys, ventes: weekSells, gain_perte_realise_fcfa: Math.round(weekRealized * rate) },
    positions: (holdings ?? []).map((h) => ({ symbol: h.symbol, part_pct: totalValue > 0 ? Number(((h.quantity * h.avg_price) / totalValue * 100).toFixed(0)) : 0 })),
    concentration_max_pct: Number(concentration.toFixed(0)),
  };

  const system = `Tu es le coach de "Naya Copilote Marche", une app de paper trading (simulation) pour un debutant en Cote d'Ivoire. Tu rediges un BILAN HEBDOMADAIRE court et bienveillant.
- Tutoiement, francais simple, sans jargon.
- Sois honnete: souligne ce qui a ete bien joue (diversification, prudence, patience) ET ce qui etait risque (trop de transactions, concentration elevee, paris dynamiques).
- Tu ne predis JAMAIS les prix et ne promets aucun gain. Tu parles du comportement et des habitudes, pas de l'avenir des marches.
- 4 a 6 phrases maximum. Texte simple, PAS de Markdown, pas de listes, pas de titres.`;

  const anthropic = new Anthropic();
  const msg = await callClaudeWithRetry(anthropic, { model: "claude-sonnet-4-6", max_tokens: 600, system, messages: [{ role: "user", content: `Voici les chiffres de la semaine:\n${JSON.stringify(context, null, 2)}\n\nRedige le bilan.` }] });

  const summary = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
  const week_end = new Date().toISOString().slice(0, 10);
  await supabaseAdmin.from("weekly_reviews").upsert({ portfolio_id: portfolio.id, week_end, summary }, { onConflict: "portfolio_id,week_end" });

  return { summary, week_end };
}
