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

// Quotes en parallèle + filet de sécurité price_cache (prix + variation du jour)
async function getQuotes(symbols: string[]): Promise<Map<string, { price: number; dayPct: number | null }>> {
  const out = new Map<string, { price: number; dayPct: number | null }>();
  if (symbols.length === 0) return out;
  const token = process.env.FINNHUB_API_KEY;

  const { data: cached } = await supabaseAdmin
    .from("price_cache").select("symbol,price,prev_close").in("symbol", symbols);
  const cacheMap = new Map((cached ?? []).map((c) => [c.symbol, c]));

  const now = new Date().toISOString();
  const upserts: { symbol: string; price: number; prev_close: number | null; fetched_at: string }[] = [];

  await Promise.all(symbols.map(async (symbol) => {
    try {
      const q = await fetch(`${FINNHUB}/quote?symbol=${symbol}&token=${token}`, { cache: "no-store" });
      const d = await q.json();
      if (d && typeof d.c === "number" && d.c > 0) {
        const dayPct = typeof d.dp === "number" ? Number(d.dp.toFixed(2)) : null;
        out.set(symbol, { price: d.c, dayPct });
        upserts.push({ symbol, price: d.c, prev_close: typeof d.pc === "number" && d.pc > 0 ? d.pc : null, fetched_at: now });
        return;
      }
    } catch {}
    const c = cacheMap.get(symbol);
    if (c) {
      const price = Number(c.price);
      const pc = c.prev_close !== null ? Number(c.prev_close) : null;
      out.set(symbol, { price, dayPct: pc && pc > 0 ? Number((((price - pc) / pc) * 100).toFixed(2)) : null });
    }
  }));

  if (upserts.length) {
    try { await supabaseAdmin.from("price_cache").upsert(upserts, { onConflict: "symbol" }); } catch {}
  }
  return out;
}

export async function generateSuggestions(portfolioId: string) {
  const { data: portfolio } = await supabaseAdmin.from("portfolios").select("*").eq("id", portfolioId).single();
  if (!portfolio) throw new Error("Portefeuille introuvable");
  const { data: settings } = await supabaseAdmin.from("settings").select("*").eq("portfolio_id", portfolio.id).maybeSingle();
  const { data: holdings } = await supabaseAdmin.from("holdings").select("*").eq("portfolio_id", portfolio.id);

  const rate = settings?.usd_to_xof ?? 600;
  const maxPerTrade = settings?.max_per_trade ?? 50;
  const stopLossPct = settings?.stop_loss_pct ?? 10;

  // Raisons d'achat récentes (14 jours) pour les positions détenues
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
  const { data: recentBuys } = await supabaseAdmin
    .from("transactions").select("symbol,reason,created_at")
    .eq("portfolio_id", portfolio.id).eq("side", "buy")
    .gte("created_at", twoWeeksAgo).order("created_at", { ascending: false });
  const reasonBySymbol = new Map<string, { reason: string; date: string }>();
  for (const t of recentBuys ?? []) {
    if (t.reason && !reasonBySymbol.has(t.symbol)) {
      reasonBySymbol.set(t.symbol, { reason: t.reason, date: String(t.created_at).slice(0, 10) });
    }
  }

  // Prix réels en parallèle avec cache résilient
  const heldList = holdings ?? [];
  const quotes = await getQuotes(heldList.map((h) => h.symbol));

  let holdingsValue = 0;
  const posDetail: { symbol: string; value: number; plPct: number; dayPct: number | null }[] = [];
  for (const h of heldList) {
    const q = quotes.get(h.symbol);
    const price = q?.price ?? h.avg_price;
    const value = h.quantity * price; const cost = h.quantity * h.avg_price;
    holdingsValue += value;
    posDetail.push({ symbol: h.symbol, value, plPct: cost > 0 ? (value - cost) / cost * 100 : 0, dayPct: q?.dayPct ?? null });
  }
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
    seuil_stop_loss_pct: Number(stopLossPct),
    mes_positions: posDetail.map((p) => {
      const r = reasonBySymbol.get(p.symbol);
      return {
        symbol: p.symbol,
        part_du_portefeuille_pct: total > 0 ? Number((p.value / total * 100).toFixed(0)) : 0,
        gain_perte_depuis_achat_pct: Number(p.plPct.toFixed(1)),
        variation_aujourdhui_pct: p.dayPct,
        valeur_fcfa: Math.round(p.value * rate),
        raison_achat_declaree: r ? `${r.reason} (le ${r.date})` : null,
      };
    }),
    marches_disponibles: marketInfo.map((m) => ({ symbol: m.symbol, nom: m.name, categorie: m.tier, variation_jour_pct: m.changePct })),
  };

  const system = `Tu es l'agent de strategie de "Naya Copilote Marche", une app de paper trading (simulation, aucun argent reel) pour un debutant en Cote d'Ivoire. Tu proposes 1 a 2 suggestions PRUDENTES qu'il validera ou refusera lui-meme.

Principes NON negociables:
- Tu n'es pas devin: tu ne predis JAMAIS les prix. Tu ne suggeres JAMAIS d'acheter ni de vendre en pretendant savoir si ca va monter ou descendre.
- Priorite absolue: reduire le risque par la diversification et la discipline.

Pour les ACHATS:
- Privilegie les marches diversifies (Prudent, Equilibre) plutot que les paris Dynamiques.
- Respecte le plafond: amountXof <= plafond_par_achat_fcfa.

Pour les VENTES (action "sell"), UNIQUEMENT pour des raisons de prudence ou de discipline, jamais de prediction:
- DISCIPLINE STOP-LOSS: si "gain_perte_depuis_achat_pct" d'une position est inferieur ou egal a -seuil_stop_loss_pct, suggere d'alleger ou de couper: c'est SA regle de risque declaree dans ses reglages, rappelle-le-lui ("ta regle de -X% est franchie").
- CONCENTRATION: si une position depasse ~35% du portefeuille, suggere d'ALLEGER pour reequilibrer.
- PRISE DE GAINS: si une position Dynamique/volatile a beaucoup monte ET pese lourd, suggere de prendre une PARTIE des gains.
- RESPECT DE SA THESE: si une position a une "raison_achat_declaree" recente et coherente (ex: achat sur repli il y a quelques jours), ne suggere PAS de la vendre juste parce qu'elle baisse un peu: vendre 3 jours apres un achat reflechi contredit sa propre logique, sauf si le stop-loss est franchi. Tu peux citer sa raison dans ta justification.
- Donne "fraction": 0.5 (alleger) ou 1 (tout vendre). Prefere 0.5, sauf concentration extreme ou stop-loss largement depasse.
- Ne suggere jamais de vendre une position raisonnable et bien diversifiee.
- "variation_aujourdhui_pct" est une information de contexte, pas un signal: une baisse du jour seule ne justifie JAMAIS une vente.

Si le portefeuille est deja equilibre et qu'aucune regle n'est franchie, propose une seule "watch" ou explique qu'il vaut mieux ne rien faire. Ne force jamais.
Chaque raison: 1-2 phrases en francais simple, chaleureux, tutoiement, sans jargon.

Repond UNIQUEMENT avec un tableau JSON valide (max 2 elements), sans texte ni Markdown:
[{"symbol":"IBIT","name":"Bitcoin (ETF)","action":"sell","fraction":0.5,"reason":"...","confidence":"moderee"}]
Pour un achat: {"symbol":"SPY","name":"S&P 500","action":"buy","amountXof":15000,"reason":"...","confidence":"moderee"}
action vaut "buy", "sell" ou "watch". confidence vaut "faible","moderee" ou "elevee".`;

  const anthropic = new Anthropic();
  const msg = await callClaudeWithRetry(anthropic, { model: "claude-sonnet-4-6", max_tokens: 1024, system, messages: [{ role: "user", content: `Contexte:\n${JSON.stringify(context, null, 2)}\n\nPropose les suggestions.` }] });

  const raw = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim().replace(/```json|```/g, "").trim();
  let parsed: Array<Record<string, unknown>> = [];
  try { const p = JSON.parse(raw); if (Array.isArray(p)) parsed = p; } catch {}

  await supabaseAdmin.from("suggestions").update({ status: "expired", resolved_at: new Date().toISOString() }).eq("portfolio_id", portfolio.id).eq("status", "pending");

  const heldSymbols = new Set(heldList.map((h) => h.symbol));
  const rows = parsed.slice(0, 2).map((s) => {
    const action = ["buy", "watch", "sell"].includes(String(s.action)) ? String(s.action) : "watch";
    const confidence = ["faible", "moderee", "elevee"].includes(String(s.confidence)) ? String(s.confidence) : "moderee";
    const symbol = String(s.symbol || "").toUpperCase().slice(0, 10);
    let amount: number | null = null; let fraction: number | null = null;
    if (action === "buy") amount = Math.min((Number(s.amountXof) || 0) / rate, maxPerTrade);
    if (action === "sell") { const f = Number(s.fraction); fraction = f > 0 && f <= 1 ? f : 0.5; }
    return { portfolio_id: portfolio.id, symbol, name: s.name ? String(s.name).slice(0, 80) : null, action, amount, fraction, reason: String(s.reason || "").slice(0, 500), confidence, status: "pending" };
  }).filter((r) => r.symbol && r.reason && (r.action !== "sell" || heldSymbols.has(r.symbol)));

  if (rows.length) await supabaseAdmin.from("suggestions").insert(rows);

  const { data: pending } = await supabaseAdmin.from("suggestions").select("*").eq("portfolio_id", portfolio.id).eq("status", "pending").order("created_at", { ascending: false });
  return pending ?? [];
}
