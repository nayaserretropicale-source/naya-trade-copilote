import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getUserPortfolio, unauthorized } from "@/lib/auth";

const BOT = "Naya_trade_copilote_bot";

function genCode() {
  return (Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6)).toLowerCase();
}

export async function GET(req: NextRequest) {
  const auth = await getUserPortfolio(req);
  if (!auth) return unauthorized();
  const { portfolio, settings } = auth;
  let code: string | null = (settings?.telegram_link_code as string | null) ?? null;
  if (!code) {
    code = genCode();
    await supabaseAdmin.from("settings").update({ telegram_link_code: code }).eq("portfolio_id", portfolio.id);
  }
  return NextResponse.json({ connected: !!settings?.telegram_chat_id, botUrl: `https://t.me/${BOT}?start=${code}` });
}

export async function DELETE(req: NextRequest) {
  const auth = await getUserPortfolio(req);
  if (!auth) return unauthorized();
  await supabaseAdmin.from("settings").update({ telegram_chat_id: null }).eq("portfolio_id", auth.portfolio.id);
  return NextResponse.json({ ok: true });
}
