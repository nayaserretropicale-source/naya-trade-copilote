import { NextRequest, NextResponse } from "next/server";
import { generateReport } from "@/lib/generateReport";
import { sendTelegram, formatReport } from "@/lib/sendTelegram";
import { buildDailyRecap } from "@/lib/dailyRecap";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorise" }, { status: 401 });
  }

  const results: Record<string, string> = {};

  // 1. Rapport du soir (analyse IA)
  try {
    const report = await generateReport();
    await sendTelegram(formatReport(report));
    results.report = "ok";
  } catch (e) {
    results.report = e instanceof Error ? e.message : String(e);
  }

  // 2. Recap du jour (gains/pertes)
  try {
    const recap = await buildDailyRecap();
    await sendTelegram(recap.text);
    results.recap = "ok";
  } catch (e) {
    results.recap = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json({ ok: true, results });
}
