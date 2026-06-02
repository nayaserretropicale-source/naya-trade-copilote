import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase";

const TD = "https://api.twelvedata.com";
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

// Reessaie si Anthropic est surcharge, mais borne dans le temps (limite Vercel)
async function callClaudeWithRetry(anthropic: Anthropic, params: Anthropic.MessageCreateParams, tries = 4): Promise<Anthropic.Message> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await anthropic.messages.create(params) as Anthropic.Message;
    } catch (e) {
      lastErr = e;
      if (isOverloaded(e) && i < tries - 1) {
        await new Promise((r) => setTimeout(r, 600 * (i + 1))); // 0,6s puis 1,2s puis 1,8s
        continue;
      }
      throw e;
    }
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
  const holdingsValue = (holdings ?? []).reduce((s, h) => s + h.quantity * h.avg_price, 0);
  const total = portfolio.cash_balance + holdingsValue;

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
    positions: (holdings ?? []).map((h) => ({
      symbol: h.symbol,
      valeur_fcfa: Math.round(h.quantity * h.avg_price * rate),
      part_pct: total > 0 ? Number(((h.quantity * h.avg_price) / total * 100).toFixed(0)) : 0,
    })),
    marches_disponibles: marketInfo.map((m) => ({ symbol: m.symbol, nom: m.name, categorie: m.tier, variation_jour_pct: m.changePct })),
  };

  const system = `Tu es l'agent de strategie de "Naya Copilote Marche", une app de paper trading (simulation, aucun argent reel) pour Bema, debutant en Cote d'Ivoire. Tu proposes 1 a 2 suggestions PRUDENTES qu'il validera ou refusera lui-meme.
Principes NON negociables:
- Tu n'es pas devin: tu ne predis JAMAIS les prix, tu ne promets aucun gain.
- Priorite absolue: reduire le risque par la diversification. Si une position depasse 35% du portefeuille, suggere d'equilibrer plutot que d'en rajouter.
- Privilegie les marches diversifies (Prudent, Equilibre) plutot que les paris Dynamiques. Une petite dose de Dynamique seulement si le reste est deja bien reparti.
- Respecte le plafond: amountXof <= plafond_par_achat_fcfa.
- Si le portefeuille est deja equilibre et qu'il n'y a rien d'utile, propose une seule suggestion "watch" ou explique qu'il vaut mieux ne rien faire. Ne force jamais des achats.
- Chaque raison: 1-2 phrases en francais simple, chaleureux, tutoiement, sans jargon, en expliquant POURQUOI c'est prudent.
Repond UNIQUEMENT avec un tableau JSON valide (max 2 elements), sans texte ni Markdown autour:
[{"symbol":"SPY","name":"S&P 500","action":"buy","amountXof":15000,"reason":"...","confidence":"moderee"}]
action vaut "buy" ou "watch". confidence vaut "faible","moderee" ou "elevee".`;

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

  const rows = parsed.slice(0, 2).map((s) => {
    const amountXof = Number(s.amountXof) || 0;
    const amountUsd = amountXof / rate;
    const action = ["buy", "watch"].includes(String(s.action)) ? String(s.action) : "watch";
    const confidence = ["faible", "moderee", "elevee"].includes(String(s.confidence)) ? String(s.confidence) : "moderee";
    return {
      portfolio_id: portfolio.id,
      symbol: String(s.symbol || "").toUpperCase().slice(0, 10),
      name: s.name ? String(s.name).slice(0, 80) : null,
      action,
      amount: action === "buy" ? Math.min(amountUsd, maxPerTrade) : null,
      reason: String(s.reason || "").slice(0, 500),
      confidence,
      status: "pending",
    };
  }).filter((r) => r.symbol && r.reason);

  if (rows.length) await supabaseAdmin.from("suggestions").insert(rows);

  const { data: pending } = await supabaseAdmin.from("suggestions").select("*")
    .eq("portfolio_id", portfolio.id).eq("status", "pending").order("created_at", { ascending: false });
  return pending ?? [];
}
