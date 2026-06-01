import { NextRequest, NextResponse } from "next/server";
import { generateReport } from "@/lib/generateReport";
import { sendTelegram, formatReport } from "@/lib/sendTelegram";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  try {
    const report = await generateReport();
    await sendTelegram(formatReport(report));
    return NextResponse.json({ ok: true, report });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("Erreur cron rapport:", e);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
