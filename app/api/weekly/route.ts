import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { generateWeeklyReview } from "@/lib/weeklyReview";
import { getUserPortfolio, unauthorized } from "@/lib/auth";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = await getUserPortfolio(req);
  if (!auth) return unauthorized();
  const { data } = await supabaseAdmin.from("weekly_reviews").select("*").eq("portfolio_id", auth.portfolio.id).order("week_end", { ascending: false }).limit(1).maybeSingle();
  return NextResponse.json({ review: data ?? null });
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "Cle Anthropic manquante" }, { status: 500 });
  const auth = await getUserPortfolio(req);
  if (!auth) return unauthorized();
  try {
    const r = await generateWeeklyReview(auth.portfolio.id);
    return NextResponse.json({ ok: true, review: { summary: r.summary, week_end: r.week_end } });
  } catch (e) {
    const status = (e as { status?: number })?.status;
    const overloaded = status === 529 || status === 503 || /overload/i.test(String((e as Error)?.message));
    if (overloaded) return NextResponse.json({ error: "L'IA est très sollicitée. Réessaie dans quelques secondes 🙂" }, { status: 503 });
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
