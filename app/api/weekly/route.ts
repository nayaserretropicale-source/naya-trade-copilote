import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { generateWeeklyReview } from "@/lib/weeklyReview";

export const maxDuration = 60;

export async function GET() {
  const { data: portfolio } = await supabaseAdmin.from("portfolios").select("id").limit(1).single();
  if (!portfolio) return NextResponse.json({ review: null });
  const { data } = await supabaseAdmin.from("weekly_reviews").select("*")
    .eq("portfolio_id", portfolio.id).order("week_end", { ascending: false }).limit(1).maybeSingle();
  return NextResponse.json({ review: data ?? null });
}

export async function POST() {
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "Cle Anthropic manquante" }, { status: 500 });
  try {
    const r = await generateWeeklyReview();
    return NextResponse.json({ ok: true, review: { summary: r.summary, week_end: r.week_end } });
  } catch (e) {
    const status = (e as { status?: number })?.status;
    const overloaded = status === 529 || status === 503 || /overload/i.test(String((e as Error)?.message));
    if (overloaded) return NextResponse.json({ error: "L'IA est très sollicitée. Réessaie dans quelques secondes 🙂" }, { status: 503 });
    const detail = e instanceof Error ? e.message : String(e);
    console.error("Erreur weekly:", e);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
