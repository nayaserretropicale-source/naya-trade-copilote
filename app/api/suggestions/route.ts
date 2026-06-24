import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { generateSuggestions } from "@/lib/suggestions";
import { getUserPortfolio, unauthorized } from "@/lib/auth";
import { isClaudeOverloaded } from "@/lib/anthropicRetry";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = await getUserPortfolio(req);
  if (!auth) return unauthorized();
  const { data } = await supabaseAdmin.from("suggestions").select("*").eq("portfolio_id", auth.portfolio.id).eq("status", "pending").order("created_at", { ascending: false });
  return NextResponse.json({ suggestions: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "Cle Anthropic manquante" }, { status: 500 });
  const auth = await getUserPortfolio(req);
  if (!auth) return unauthorized();
  try { const suggestions = await generateSuggestions(auth.portfolio.id); return NextResponse.json({ ok: true, suggestions }); }
  catch (e) {
    if (isClaudeOverloaded(e)) return NextResponse.json({ error: "L'IA est très sollicitée en ce moment. Réessaie dans quelques secondes 🙂" }, { status: 503 });
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
