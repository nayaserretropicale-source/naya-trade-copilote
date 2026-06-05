import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { buildDailyRecap } from "@/lib/dailyRecap";
import { sendTelegram } from "@/lib/sendTelegram";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Non autorise" }, { status: 401 });
  try {
    const { data: owner } = await supabaseAdmin.from("portfolios").select("id").eq("user_id", process.env.OWNER_USER_ID).limit(1).maybeSingle();
    if (!owner) return NextResponse.json({ ok: true, note: "Pas de proprietaire defini" });
    const recap = await buildDailyRecap(owner.id);
    await sendTelegram("🌅 Bonjour ! Voici où en est ton portefeuille ce matin.\n\n" + recap.text);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
