import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { generateSuggestions } from "@/lib/suggestions";

export async function GET() {
  const { data: portfolio } = await supabaseAdmin.from("portfolios").select("id").limit(1).single();
  if (!portfolio) return NextResponse.json({ suggestions: [] });
  const { data } = await supabaseAdmin.from("suggestions").select("*")
    .eq("portfolio_id", portfolio.id).eq("status", "pending").order("created_at", { ascending: false });
  return NextResponse.json({ suggestions: data ?? [] });
}

export async function POST() {
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "Cle Anthropic manquante" }, { status: 500 });
  try {
    const suggestions = await generateSuggestions();
    return NextResponse.json({ ok: true, suggestions });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("Erreur suggestions:", e);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
