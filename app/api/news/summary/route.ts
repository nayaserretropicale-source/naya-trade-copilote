import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getUserPortfolio, unauthorized } from "@/lib/auth";

const FINNHUB = "https://finnhub.io/api/v1";
export const maxDuration = 60;

function isOverloaded(e: unknown): boolean {
  const s = (e as { status?: number })?.status;
  return s === 529 || s === 503 || s === 500 || /overload/i.test(String((e as Error)?.message));
}
async function callClaudeWithRetry(a: Anthropic, p: Anthropic.MessageCreateParams, tries = 4): Promise<Anthropic.Message> {
  let last: unknown;
  for (let i = 0; i < tries; i++) { try { return await a.messages.create(p) as Anthropic.Message; } catch (e) { last = e; if (isOverloaded(e) && i < tries - 1) { await new Promise((r) => setTimeout(r, 600 * (i + 1))); continue; } throw e; } }
  throw last;
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "Cle Anthropic manquante" }, { status: 500 });
  const auth = await getUserPortfolio(req);
  if (!auth) return unauthorized();
  try {
    const token = process.env.FINNHUB_API_KEY;
    let headlines: string[] = [];
    try {
      const r = await fetch(`${FINNHUB}/news?category=general&token=${token}`, { cache: "no-store" });
      const data = await r.json();
      const list = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
      headlines = list.filter((n) => n && n.headline).slice(0, 12).map((n) => `- ${String(n.headline)}`);
    } catch {}
    if (headlines.length === 0) return NextResponse.json({ summary: "Pas d'actualité disponible pour le moment. Réessaie plus tard." });

    const system = `Tu es le veilleur marche de "Naya Copilote Marche", une app de simulation pour un debutant en Cote d'Ivoire. A partir de titres d'actualite financiere, tu rediges un point neutre et pedagogique.
Regles:
- Tutoiement, francais simple, sans jargon.
- Tu NE predis JAMAIS les prix et ne donnes AUCUN conseil d'achat/vente. Tu expliques ce qui se passe et pourquoi, point.
- Rappelle au besoin que pour un debutant, la prudence (diversifier, peu trader, horizon long) compte plus que de reagir a l'actu.
- 4 a 6 phrases. Texte simple, pas de Markdown, pas de listes.`;

    const anthropic = new Anthropic();
    const msg = await callClaudeWithRetry(anthropic, { model: "claude-sonnet-4-6", max_tokens: 500, system, messages: [{ role: "user", content: `Titres du jour:\n${headlines.join("\n")}\n\nRedige le point marche.` }] });
    const summary = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    return NextResponse.json({ summary });
  } catch (e) {
    const status = (e as { status?: number })?.status;
    if (status === 529 || status === 503 || /overload/i.test(String((e as Error)?.message))) return NextResponse.json({ error: "L'IA est très sollicitée. Réessaie dans quelques secondes 🙂" }, { status: 503 });
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
