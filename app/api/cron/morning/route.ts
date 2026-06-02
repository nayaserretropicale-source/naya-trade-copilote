import { NextRequest, NextResponse } from "next/server";
import { buildDailyRecap } from "@/lib/dailyRecap";
import { sendTelegram } from "@/lib/sendTelegram";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Non autorise" }, { status: 401 });
  try {
    const recap = await buildDailyRecap();
    await sendTelegram("🌅 Bonjour ! Voici où en est ton portefeuille ce matin.\n\n" + recap.text);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
