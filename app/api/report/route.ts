import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { generateReport } from "@/lib/generateReport";
import { sendTelegramTo, formatReport } from "@/lib/sendTelegram";
import { getUserPortfolio, unauthorized } from "@/lib/auth";
import { isClaudeOverloaded } from "@/lib/anthropicRetry";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = await getUserPortfolio(req);
  if (!auth) return unauthorized();
  const { data } = await supabaseAdmin.from("reports").select("*").eq("portfolio_id", auth.portfolio.id).order("report_date", { ascending: false }).limit(1).maybeSingle();
  return NextResponse.json({ report: data ?? null });
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "Cle Anthropic manquante" }, { status: 500 });
  const auth = await getUserPortfolio(req);
  if (!auth) return unauthorized();
  try {
    const report = await generateReport(auth.portfolio.id);
    const chatId = auth.settings?.telegram_chat_id as string | undefined;
    if (chatId) { try { await sendTelegramTo(chatId, formatReport(report)); } catch {} }
    return NextResponse.json({ ok: true, report });
  } catch (e) {
    if (isClaudeOverloaded(e)) return NextResponse.json({ error: "L'IA est très sollicitée. Réessaie dans quelques secondes 🙂" }, { status: 503 });
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
