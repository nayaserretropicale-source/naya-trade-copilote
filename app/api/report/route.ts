import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase";

type Pos = {
  symbol: string; quantity: number; avgPrice: number; price: number;
  valueXof: number; plPct: number; dayChangePct: number;
};

async function finnhub(path: string): Promise<any> {
  const token = process.env.FINNHUB_API_KEY;
  const res = await fetch(`https://finnhub.io/api/v1/${path}&token=${token}`, { cache: "no-store" });
  return res.json();
}

export async function GET() {
  const { data: portfolio } = await supabaseAdmin
    .from("portfolios").select("id").limit(1).single();
  if (!portfolio) return NextResponse.json({ report: null });
  const { data: report } = await supabaseAdmin
    .from("reports").select("*")
    .eq("portfolio_id", portfolio.id)
    .order("report_date", { ascending: false })
    .limit(1).maybeSingle();
  return NextResponse.json({ report });
}

export async function POST() {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Clé API Anthropic manquante" }, { status: 500 });
  }

  try {
    const { data: portfolio } = await supabaseAdmin
      .from("portfolios").select("*").limit(1).single();
    if (!portfolio) return NextResponse.json({ error: "Portefeuille introuvable" }, { status: 404 });

    const { data: settings } = await supabaseAdmin
      .from("settings").select("*").eq("portfolio_id", portfolio.id).single();
    const { data: holdings } = await supabaseAdmin
      .from("holdings").select("*").eq("portfolio_id", portfolio.id);

    const rate = settings?.usd_to_xof ?? 600;

    let positionsValueUsd = 0;
    const positions: Pos[] = [];
    for (const h of holdings ?? []) {
      const q = await finnhub(`quote?symbol=${h.symbol}`);
      const price = q.c || h.avg_price;
      const value = h.quantity * price;
      positionsValueUsd += value;
      positions.push({
        symbol: h.symbol,
        quantity: Number(h.quantity.toFixed(4)),
        avgPrice: h.avg_price,
        price,
        valueXof: Math.round(value * rate),
        plPct: Number((((price - h.avg_price) / h.avg_price) * 100).toFixed(2)),
        dayChangePct: q.dp ?? 0,
      });
    }

    const totalUsd = portfolio.cash_balance + positionsValueUsd;
    const overallPlPct = ((totalUsd - portfolio.starting_capital) / portfolio.starting_capital) * 100;

    const newsData = await finnhub(`news?category=general`);
    const headlines: string[] = Array.isArray(newsData)
      ? newsData.slice(0, 5).map((n: { headline?: string }) => n.headline ?? "").filter(Boolean)
      : [];

    const context = {
      date: new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }),
      portefeuille: {
        valeur_totale_fcfa: Math.round(totalUsd * rate),
        capital_depart_fcfa: Math.round(portfolio.starting_capital * rate),
        liquidites_fcfa: Math.round(portfolio.cash_balance * rate),
        performance_globale_pct: Number(overallPlPct.toFixed(2)),
      },
      positions,
      actualite_marche: headlines,
    };

    const system = `Tu es l'agent d'analyse de "Naya Copilote Marche", une app de paper trading (simulation, aucun argent reel) pour Bema, un utilisateur debutant en Cote d'Ivoire. Tu ecris son rapport du soir.
Regles:
- Tutoie Bema, ton chaleureux et pose.
- Francais clair, lisible en 30 secondes, sans jargon.
- Tu n'es PAS conseiller financier: tu informes et expliques, tu ne promets aucun gain, tu ne donnes pas d'ordre garanti.
- Sois honnete: si la journee est calme, dis-le. N'invente JAMAIS de chiffres, utilise uniquement les donnees fournies.
- Termine en evaluant le niveau de risque du jour.
Reponds UNIQUEMENT avec un objet JSON valide, sans texte autour ni balises Markdown, de la forme:
{"title": "...", "summary": "...", "risk_level": "faible|modere|eleve"}
Le champ summary fait 3 a 5 phrases.`;

    const anthropic = new Anthropic();
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system,
      messages: [{
        role: "user",
        content: `Donnees du jour:\n${JSON.stringify(context, null, 2)}\n\nRedige le rapport du soir.`,
      }],
    });

    const raw = msg.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("").trim().replace(/```json|```/g, "").trim();

    let report: { title: string; summary: string; risk_level: string };
    try {
      report = JSON.parse(raw);
    } catch {
      report = { title: "Rapport du soir", summary: raw, risk_level: "faible" };
    }

    const validRisk = ["faible", "modere", "eleve"].includes(report.risk_level)
      ? report.risk_level : "faible";

    const today = new Date().toISOString().slice(0, 10);
    await supabaseAdmin.from("reports").upsert({
      portfolio_id: portfolio.id,
      report_date: today,
      title: report.title,
      summary: report.summary,
      risk_level: validRisk,
      portfolio_value: totalUsd,
      day_change_pct: Number(overallPlPct.toFixed(2)),
    }, { onConflict: "portfolio_id,report_date" });

    return NextResponse.json({
      ok: true,
      report: { ...report, risk_level: validRisk, date: context.date },
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("Erreur rapport:", e);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
