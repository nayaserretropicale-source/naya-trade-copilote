import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { buildDailyRecap } from "@/lib/dailyRecap";
import { sendTelegramTo } from "@/lib/sendTelegram";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Non autorise" }, { status: 401 });
  const { data: rows } = await supabaseAdmin.from("settings").select("portfolio_id,telegram_chat_id").not("telegram_chat_id", "is", null);
  let sent = 0;
  for (const r of rows ?? []) {
    try { const recap = await buildDailyRecap(r.portfolio_id); await sendTelegramTo(r.telegram_chat_id, "🌅 Bonjour ! Voici ton portefeuille ce matin.\n\n" + recap.text); sent++; } catch {}
  }
  return NextResponse.json({ ok: true, sent });
}
