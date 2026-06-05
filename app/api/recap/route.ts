import { NextRequest, NextResponse } from "next/server";
import { buildDailyRecap } from "@/lib/dailyRecap";
import { sendTelegramTo } from "@/lib/sendTelegram";
import { getUserPortfolio, unauthorized } from "@/lib/auth";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = await getUserPortfolio(req);
  if (!auth) return unauthorized();
  try {
    const chatId = auth.settings?.telegram_chat_id as string | undefined;
    if (!chatId) return NextResponse.json({ ok: true, note: "Connecte d'abord ton Telegram (page /telegram) pour recevoir le récap." });
    const recap = await buildDailyRecap(auth.portfolio.id);
    await sendTelegramTo(chatId, recap.text);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
