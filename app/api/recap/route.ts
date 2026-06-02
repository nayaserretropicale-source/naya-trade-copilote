import { NextResponse } from "next/server";
import { buildDailyRecap } from "@/lib/dailyRecap";
import { sendTelegram } from "@/lib/sendTelegram";

export const maxDuration = 60;

export async function POST() {
  try {
    const recap = await buildDailyRecap();
    await sendTelegram(recap.text);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("Erreur recap:", e);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
