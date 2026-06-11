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

// Quotes en parallèle avec filet de sécurité price_cache
async function getPrices(symbols: string[]): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  if (symbols.length === 0) return prices;
  const token = process.env.FINNHUB_API_KEY;

  const { data: cached } = await supabaseAdmin
    .from("price_cache").select("symbol,price").in("symbol", symbols);
  const cacheMap = new Map((cached ?? []).map((c) => [c.symbol, Number(c.price)]));

  const now = new Date().toISOString();
  const upserts: { symbol: string; price: number; fetched_at: string }[] = [];

  await Promise.all(symbols.map(async (symbol) => {
    try {
      const q = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${token}`, { cache: "no-store" });
      const d = await q.json();
      if (d && typeof d.c === "number" && d.c > 0) {
        prices.set(symbol, d.c);
        upserts.push({ symbol, price: d.c, fetched_at: now });
        return;
      }
    } catch {}
    const c = cacheMap.get(symbol);
    if (c) prices.set(symbol, c);
  }));

  if (upserts.length) {
    try { await supabaseAdmin.from("price_cache").upsert(upserts, { onConflict: "symbol" }); } catch {}
  }
  return prices;
}

export async function generateWeeklyReview(portfolioId: string) {
  const { data: portfolio } = await supabaseAdmin.from("portfolios").select("*").eq("id", portfolioId).single();
  if (!portfolio) throw new Error("Portefeuille introuvable");
  const { data: settings } = await supabaseAdmin.from("settings").select("*").eq("portfolio_id", portfolio.id).maybeSingle();
  const { data: holdings } = await supabaseAdmin.from("holdings").select("*").eq("portfolio_id", portfolio.id);
  const { data: txs } = await supabaseAdmin.from("transactions").select("*").eq("portfolio_id", portfolio.id).order("created_at", { ascending: true });

  const rate = settings?.usd_to_xof ?? 600;

  // Prix actuels : positions + symboles tradés sur 14 jours (pour juger les ventes aussi)
  const twoWeeksAgo = Date.now() - 14 * 24 * 3600 * 1000;
  const recentTxs = (txs ?? []).filter((t) => new Date(t.created_at).getTime() >= twoWeeksAgo);
  const symbols = Array.from(new Set([
    ...(holdings ?? []).map((h) => h.symbol),
    ...recentTxs.map((t) => t.symbol),
  ]));
  const prices = await getPrices(symbols);

  let holdingsValue = 0;
  for (const h of holdings ?? []) {
    const price = prices.get(h.symbol) ?? h.avg_price;
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

  // Journal de décision : chaque trade récent + raison déclarée + évolution réelle depuis
  const decisions = recentTxs.map((t) => {
    const px = prices.get(t.symbol);
    const evolution = px && t.price > 0 ? Number((((px - t.price) / t.price) * 100).toFixed(1)) : null;
    return {
      date: String(t.created_at).slice(0, 10),
      action: t.side === "buy" ? "achat" : "vente",
      symbol: t.symbol,
      prix_au_moment_du_trade: Number(Number(t.price).toFixed(2)),
      prix_actuel: px ? Number(px.toFixed(2)) : null,
      evolution_du_titre_depuis_pct: evolution,
      raison_declaree: t.reason ?? null,
    };
  });

  const context = {
    valeur_totale_fcfa: Math.round(totalValue * rate),
    gain_perte_total_fcfa: Math.round(overallPl * rate),
    cette_semaine: { achats: weekBuys, ventes: weekSells, gain_perte_realise_fcfa: Math.round(weekRealized * rate) },
    positions: (holdings ?? []).map((h) => ({ symbol: h.symbol, part_pct: totalValue > 0 ? Number(((h.quantity * h.avg_price) / totalValue * 100).toFixed(0)) : 0 })),
    concentration_max_pct: Number(concentration.toFixed(0)),
    journal_de_decisions_14_jours: decisions,
  };

  const system = `Tu es le coach de "Naya Copilote Marche", une app de paper trading (simulation) pour un debutant en Cote d'Ivoire. Tu rediges un BILAN HEBDOMADAIRE court et bienveillant.
- Tutoiement, francais simple, sans jargon.
- Sois honnete: souligne ce qui a ete bien joue (diversification, prudence, patience) ET ce qui etait risque (trop de transactions, concentration elevee, paris dynamiques).
- JOURNAL DE DECISIONS: si des trades ont une "raison_declaree", c'est ta matiere la plus precieuse. Compare la raison declaree a "evolution_du_titre_depuis_pct" (ce que le titre a reellement fait depuis). Exemples: une vente "par peur" suivie d'un rebond = la peur a coute de l'argent; un achat "le marche baisse, j'achete" suivi d'une hausse = sang-froid recompense. Nomme gentiment le biais en jeu (peur, impatience, FOMO) quand il y en a un. Une ou deux decisions commentees maximum, les plus instructives.
- Si aucune raison n'est declaree sur les trades recents, encourage en une phrase a noter le "pourquoi" de chaque trade pour progresser.
- Tu ne predis JAMAIS les prix et ne promets aucun gain. Tu parles du comportement et des habitudes, pas de l'avenir des marches.
- 5 a 7 phrases maximum. Texte simple, PAS de Markdown, pas de listes, pas de titres.`;

  const anthropic = new Anthropic();
  const msg = await callClaudeWithRetry(anthropic, { model: "claude-sonnet-4-6", max_tokens: 600, system, messages: [{ role: "user", content: `Voici les chiffres de la semaine:\n${JSON.stringify(context, null, 2)}\n\nRedige le bilan.` }] });

  const summary = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
  const week_end = new Date().toISOString().slice(0, 10);
  await supabaseAdmin.from("weekly_reviews").upsert({ portfolio_id: portfolio.id, week_end, summary }, { onConflict: "portfolio_id,week_end" });

  return { summary, week_end };
}
