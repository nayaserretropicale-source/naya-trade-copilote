import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { generateReport } from "@/lib/generateReport";
import { sendTelegram, formatReport } from "@/lib/sendTelegram";
import { buildDailyRecap } from "@/lib/dailyRecap";
import { recordSnapshot } from "@/lib/snapshot";
import { generateWeeklyReview } from "@/lib/weeklyReview";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Non autorise" }, { status: 401 });

  const results: Record<string, string> = {};

  // Courbe pour TOUS les utilisateurs
  try {
    const { data: all } = await supabaseAdmin.from("portfolios").select("id");
    for (const p of all ?? []) { try { await recordSnapshot(p.id); } catch {} }
    results.snapshots = "ok";
  } catch (e) { results.snapshots = e instanceof Error ? e.message : String(e); }

  // Telegram : proprietaire uniquement
  const { data: owner } = await supabaseAdmin.from("portfolios").select("id").eq("user_id", process.env.OWNER_USER_ID).limit(1).maybeSingle();
  if (owner) {
    try { const report = await generateReport(owner.id); await sendTelegram(formatReport(report)); results.report = "ok"; }
    catch (e) { results.report = e instanceof Error ? e.message : String(e); }
    try { const recap = await buildDailyRecap(owner.id); await sendTelegram(recap.text); results.recap = "ok"; }
    catch (e) { results.recap = e instanceof Error ? e.message : String(e); }
    if (new Date().getUTCDay() === 0) {
      try { const w = await generateWeeklyReview(owner.id); await sendTelegram("📅 Bilan de la semaine — Naya Copilote\n\n" + w.summary); results.weekly = "ok"; }
      catch (e) { results.weekly = e instanceof Error ? e.message : String(e); }
    }
  }

  return NextResponse.json({ ok: true, results });
}
