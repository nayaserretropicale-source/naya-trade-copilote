import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase";

const TD = "https://api.twelvedata.com";
const FINNHUB = "https://finnhub.io/api/v1";
const MARKETS = [
  { symbol: "BND",  name: "Obligations US", tier: "Prudent" },
  { symbol: "GLD",  name: "Or",             tier: "Prudent" },
  { symbol: "SPY",  name: "S&P 500",        tier: "Equilibre" },
  { symbol: "VXUS", name: "Monde hors US",  tier: "Equilibre" },
  { symbol: "QQQ",  name: "Nasdaq (tech)",  tier: "Dynamique" },
  { symbol: "IBIT", name: "Bitcoin (ETF)",  tier: "Dynamique" },
];

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

export async function generateSuggestions() {
  const { data: portfolio } = await supabaseAdmin.from("portfolios").select("*").limit(1).single();
  if (!portfolio) throw new Error("Portefeuille introuvable");
  const { data: settings } = await supabaseAdmin.from("settings").select("*").eq("portfolio_id", portfolio.id).single();
  const { data: holdings } = await supabaseAdmin.from("holdings").select("*").eq("portfolio_id", portfolio.id);

  const rate = settings?.usd_to_xof ?? 600;
  const maxPerTrade = settings?.max_per_trade ?? 50;
  const token = process.env.FINNHUB_API_KEY;

  // Positions enrichies (prix du jour via Finnhub)
  let holdingsValue = 0;
  const posDetail: { symbol: string; value: number; plPct: number }[] = [];
  for (const h of holdings ?? []) {
    let price = h.avg_price;
    try { const q = await fetch(`${FINNHUB}/quote?symbol=${h.symbol}&token=${token}`, { cache: "no-store" }); const d = await q.json(); if (d.c) price = d.c; } catch {}
    const value = h.quantity * price;
    const cost = h.quantity * h.avg_price;
    holdingsValue += value;
    posDetail.push({ symbol: h.symbol, value, plPct: cost > 0 ? (value - cost) / cost * 100 : 0 });
  }
  const total = portfolio.cash_balance + holdingsValue;

  // Marche (candidats a l'achat) via Twelve Data
  const key = process.env.TWELVEDATA_API_KEY;
  const symbols = MARKETS.map((m) => m.symbol).join(",");
  let marketInfo = MARKETS.map((m) => ({ ...m, changePct: null as number | null }));
  try {
    const r = await fetch(`${TD}/quote?symbol=${symbols}&apikey=${key}`, { cache: "no-store" });
    const q = await r.json();
    marketInfo = MARKETS.map((m) => {
      const d = q[m.symbol] ?? (q.symbol === m.symbol ? q : null);
      const pct = d ? parseFloat(d.percent_change) : NaN;
      return { ...m, changePct: Number.isFinite(pct) ? Number(pct.toFixed(2)) : null };
    });
  } catch {}

  const context = {
    liquidites_fcfa: Math.round(portfolio.cash_balance * rate),
    valeur_totale_fcfa: Math.round(total * rate),
    plafond_par_achat_fcfa: Math.round(maxPerTrade * rate),
    mes_positions: posDetail.map((p) => ({
      symbol: p.symbol,
      part_du_portefeuille_pct: total > 0 ? Number((p.value / total * 100).toFixed(0)) : 0,
      gain_perte_pct: Number(p.plPct.toFixed(0)),
      valeur_fcfa: Math.round(p.value * rate),
    })),
    marches_disponibles: marketInfo.map((m) => ({ symbol: m.symbol, nom: m.name, categorie: m.tier, variation_jour_pct: m.changePct })),
  };

  const system = `Tu es l'agent de strategie de "Naya Copilote Marche", une app de paper trading (simulation, aucun argent reel) pour Bema, debutant en Cote d'Ivoire. Tu proposes 1 a 2 suggestions PRUDENTES qu'il validera ou refusera lui-meme.

Principes NON negociables:
- Tu n'es pas devin: tu ne predis JAMAIS les prix. Tu ne suggeres JAMAIS de vendre ni d'acheter en pretendant savoir si ca va monter ou descendre.
- Priorite absolue: reduire le risque par la diversification.

Pour les ACHATS:
- Privilegie les marches diversifies (Prudent, Equilibre) plutot que les paris Dynamiques.
- Respecte le plafond: amountXof <= plafond_par_achat_fcfa.

Pour les VENTES (action "sell"), tu peux en proposer UNIQUEMENT pour des raisons de prudence, jamais de prediction:
- Si une position depasse ~35% du portefeuille (part_du_portefeuille_pct), suggere d'ALLEGER pour reequilibrer (reduire la concentration).
- Si une position Dynamique/volatile (Bitcoin, action seule) a beaucoup monte (gain_perte_pct eleve) ET pese lourd, suggere de prendre une PARTIE des gains pour reduire le risque.
- Pour une vente, donne "fraction": 0.5 (alleger de moitie) ou 1 (tout vendre). Prefere 0.5, sauf concentration extreme.
- Ne suggere JAMAIS de vendre une position raisonnable et bien diversifiee juste pour "profiter du moment". Si rien n'est concentre ni demesure, ne propose pas de vente.

Si le portefeuille est deja equilibre et qu'il n'y a rien d'utile a faire, propose une seule suggestion "watch" ou explique qu'il vaut mieux ne rien faire. Ne force jamais.
Chaque raison: 1-2 phrases en francais simple, chaleureux, tutoiement, sans jargon, en expliquant POURQUOI c'est prudent.

Repond UNIQUEMENT avec un tableau JSON valide (max 2 elements), sans texte ni Markdown autour:
[{"symbol":"IBIT","name":"Bitcoin (ETF)","action":"sell","fraction":0.5,"reason":"...","confidence":"moderee"}]
Pour un achat: {"symbol":"SPY","name":"S&P 500","action":"buy","amountXof":15000,"reason":"...","confidence":"moderee"}
action vaut "buy", "sell" ou "watch". confidence vaut "faible","moderee" ou "elevee".`;

  const anthropic = new Anthropic();
  const msg = await callClaudeWithRetry(anthropic, {
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system,
    messages: [{ role: "user", content: `Contexte:\n${JSON.stringify(context, null, 2)}\n\nPropose les suggestions.` }],
  });

  const raw = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim().replace(/```json|```/g, "").trim();
  let parsed: Array<Record<string, unknown>> = [];
  try { const p = JSON.parse(raw); if (Array.isArray(p)) parsed = p; } catch {}

  await supabaseAdmin.from("suggestions")
    .update({ status: "expired", resolved_at: new Date().toISOString() })
    .eq("portfolio_id", portfolio.id).eq("status", "pending");

  const heldSymbols = new Set((holdings ?? []).map((h) => h.symbol));
  const rows = parsed.slice(0, 2).map((s) => {
    const action = ["buy", "watch", "sell"].includes(String(s.action)) ? String(s.action) : "watch";
    const confidence = ["faible", "moderee", "elevee"].includes(String(s.confidence)) ? String(s.confidence) : "moderee";
    const symbol = String(s.symbol || "").toUpperCase().slice(0, 10);
    let amount: number | null = null;
    let fraction: number | null = null;
    if (action === "buy") amount = Math.min((Number(s.amountXof) || 0) / rate, maxPerTrade);
    if (action === "sell") { const f = Number(s.fraction); fraction = f > 0 && f <= 1 ? f : 0.5; }
    return {
      portfolio_id: portfolio.id,
      symbol,
      name: s.name ? String(s.name).slice(0, 80) : null,
      action, amount, fraction,
      reason: String(s.reason || "").slice(0, 500),
      confidence, status: "pending",
    };
  }).filter((r) => r.symbol && r.reason && (r.action !== "sell" || heldSymbols.has(r.symbol)));

  if (rows.length) await supabaseAdmin.from("suggestions").insert(rows);

  const { data: pending } = await supabaseAdmin.from("suggestions").select("*")
    .eq("portfolio_id", portfolio.id).eq("status", "pending").order("created_at", { ascending: false });
  return pending ?? [];
}
