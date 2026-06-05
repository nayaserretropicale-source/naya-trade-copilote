import { NextRequest, NextResponse } from "next/server";
import { buildDailyRecap } from "@/lib/dailyRecap";
import { sendTelegram } from "@/lib/sendTelegram";
import { getUserPortfolio, unauthorized } from "@/lib/auth";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = await getUserPortfolio(req);
  if (!auth) return unauthorized();
  try {
    if (auth.userId !== process.env.OWNER_USER_ID) {
      return NextResponse.json({ ok: true, note: "Les notifications Telegram sont réservées au propriétaire de l'app." });
    }
    const recap = await buildDailyRecap(auth.portfolio.id);
    await sendTelegram(recap.text);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
