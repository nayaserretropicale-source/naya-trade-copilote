import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase";
import { getUserPortfolio, unauthorized } from "@/lib/auth";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { callClaudeWithRetry, isClaudeOverloaded } from "@/lib/anthropicRetry";

const FINNHUB = "https://finnhub.io/api/v1";
const TIERS = ["Prudent", "Équilibré", "Dynamique"];
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "Cle Anthropic manquante" }, { status: 500 });
  const auth = await getUserPortfolio(req);
  if (!auth) return unauthorized();
  try {
    const { data: wl } = await supabaseAdmin.from("watchlist").select("symbol,name,tier").eq("portfolio_id", auth.portfolio.id);
    const current = (wl ?? []).map((m) => ({ symbol: m.symbol, nom: m.name, categorie: m.tier }));
    const have = new Set((wl ?? []).map((m) => String(m.symbol).toUpperCase()));

    const system = `Tu es le guide de diversification de "Naya Copilote Marche", une app de simulation pour un debutant en Cote d'Ivoire. Tu proposes des marches a AJOUTER a sa liste de suivi, pour ameliorer sa DIVERSIFICATION.
Regles NON negociables:
- Propose UNIQUEMENT des instruments cotes aux Etats-Unis (NYSE/Nasdaq), de preference des ETF (un panier = des centaines d'entreprises). Exemples de symboles US valides: BND, AGG, GLD, SPY, VOO, VTI, VXUS, VEA, VWO, QQQ, SCHD, IBIT, EWQ, EWG, EWJ, EZA, AFK.
- Vise les TROUS de sa liste: s'il manque du Prudent (obligations/or), de l'Equilibre (large/monde), ou s'il est trop concentre, comble-le.
- Tu ne predis JAMAIS les prix, tu ne promets aucun gain. Tu raisonnes diversification et reduction du risque, point.
- Ne propose PAS un symbole deja present dans sa liste.
- categorie vaut exactement "Prudent", "Équilibré" ou "Dynamique".
Repond UNIQUEMENT avec un tableau JSON valide (2 a 4 elements), sans texte ni Markdown:
[{"symbol":"VXUS","name":"Monde hors US","tier":"Équilibré","reason":"..."}]
reason: 1-2 phrases en francais simple, chaleureux, tutoiement, expliquant POURQUOI c'est utile pour diversifier.`;

    const anthropic = new Anthropic();
    const msg = await callClaudeWithRetry(anthropic, { model: "claude-sonnet-4-6", max_tokens: 900, system, messages: [{ role: "user", content: `Sa liste actuelle:\n${JSON.stringify(current, null, 2)}\n\nPropose des marches a ajouter.` }] });
    const raw = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim().replace(/```json|```/g, "").trim();
    let parsed: Array<Record<string, unknown>> = [];
    try { const p = JSON.parse(raw); if (Array.isArray(p)) parsed = p; } catch {}

    const token = process.env.FINNHUB_API_KEY;
    const out: { symbol: string; name: string; tier: string; reason: string }[] = [];
    for (const s of parsed) {
      const symbol = String(s.symbol || "").toUpperCase().trim().slice(0, 10);
      if (!symbol || have.has(symbol) || out.some((o) => o.symbol === symbol)) continue;
      const tier = TIERS.includes(String(s.tier)) ? String(s.tier) : "Dynamique";
      const name = s.name ? String(s.name).slice(0, 80) : symbol;
      const reason = String(s.reason || "").slice(0, 400);
      let ok = false;
      try { const q = await fetchWithTimeout(`${FINNHUB}/quote?symbol=${symbol}&token=${token}`, { cache: "no-store" }); const d = await q.json(); if (d && typeof d.c === "number" && d.c > 0) ok = true; } catch {}
      if (ok) out.push({ symbol, name, tier, reason });
      if (out.length >= 4) break;
    }

    return NextResponse.json({ suggestions: out });
  } catch (e) {
    if (isClaudeOverloaded(e)) return NextResponse.json({ error: "L'IA est très sollicitée. Réessaie dans quelques secondes 🙂" }, { status: 503 });
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
