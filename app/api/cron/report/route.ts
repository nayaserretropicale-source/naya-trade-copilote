import { NextRequest, NextResponse } from "next/server";
import { generateReport } from "@/lib/generateReport";
import { sendTelegram, formatReport } from "@/lib/sendTelegram";
import { buildDailyRecap } from "@/lib/dailyRecap";
import { recordSnapshot } from "@/lib/snapshot";
import { generateWeeklyReview } from "@/lib/weeklyReview";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Non autorise" }, { status: 401 });

  const results: Record<string, string> = {};

  try { await recordSnapshot(); results.snapshot = "ok"; }
  catch (e) { results.snapshot = e instanceof Error ? e.message : String(e); }

  try { const report = await generateReport(); await sendTelegram(formatReport(report)); results.report = "ok"; }
  catch (e) { results.report = e instanceof Error ? e.message : String(e); }

  try { const recap = await buildDailyRecap(); await sendTelegram(recap.text); results.recap = "ok"; }
  catch (e) { results.recap = e instanceof Error ? e.message : String(e); }

  if (new Date().getUTCDay() === 0) {
    try { const w = await generateWeeklyReview(); await sendTelegram("📅 Bilan de la semaine — Naya Copilote\n\n" + w.summary); results.weekly = "ok"; }
    catch (e) { results.weekly = e instanceof Error ? e.message : String(e); }
  }

  return NextResponse.json({ ok: true, results });
}
