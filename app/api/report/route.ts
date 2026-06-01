import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { generateReport } from "@/lib/generateReport";
import { sendTelegram, formatReport } from "@/lib/sendTelegram";

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
    const report = await generateReport();
    await sendTelegram(formatReport(report));
    return NextResponse.json({ ok: true, report });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("Erreur rapport:", e);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
