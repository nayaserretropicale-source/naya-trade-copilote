import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { generateReport } from "@/lib/generateReport";
import { sendTelegramTo, formatReport } from "@/lib/sendTelegram";
import { buildDailyRecap } from "@/lib/dailyRecap";
import { recordSnapshot } from "@/lib/snapshot";
import { generateWeeklyReview } from "@/lib/weeklyReview";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Non autorise" }, { status: 401 });

  // Courbe pour TOUS
  try {
    const { data: all } = await supabaseAdmin.from("portfolios").select("id");
    for (const p of all ?? []) { try { await recordSnapshot(p.id); } catch {} }
  } catch {}

  // Rapport + recap (+ bilan le dimanche) pour chaque utilisateur connecte a Telegram
  const sunday = new Date().getUTCDay() === 0;
  const { data: rows } = await supabaseAdmin.from("settings").select("portfolio_id,telegram_chat_id").not("telegram_chat_id", "is", null);
  let sent = 0;
  for (const r of rows ?? []) {
    try { const report = await generateReport(r.portfolio_id); await sendTelegramTo(r.telegram_chat_id, formatReport(report)); } catch {}
    try { const recap = await buildDailyRecap(r.portfolio_id); await sendTelegramTo(r.telegram_chat_id, recap.text); sent++; } catch {}
    if (sunday) { try { const w = await generateWeeklyReview(r.portfolio_id); await sendTelegramTo(r.telegram_chat_id, "📅 Bilan de la semaine — Naya\n\n" + w.summary); } catch {} }
  }

  return NextResponse.json({ ok: true, sent });
}
