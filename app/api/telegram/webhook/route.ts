import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";

async function reply(chatId: number, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  try { await fetchWithTimeout(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text }) }); } catch {}
}

export async function POST(req: NextRequest) {
  if (req.headers.get("x-telegram-bot-api-secret-token") !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: true });
  }
  let update: { message?: { chat?: { id?: number }; text?: string } } | null = null;
  try { update = await req.json(); } catch { return NextResponse.json({ ok: true }); }

  const chatId = update?.message?.chat?.id;
  const text = update?.message?.text || "";

  if (chatId && text.startsWith("/start")) {
    const code = text.split(/\s+/)[1];
    if (code) {
      const { data: setting } = await supabaseAdmin.from("settings").select("portfolio_id").eq("telegram_link_code", code).maybeSingle();
      if (setting) {
        await supabaseAdmin.from("settings").update({ telegram_chat_id: String(chatId) }).eq("portfolio_id", setting.portfolio_id);
        await reply(chatId, "✅ C'est connecté ! Tu recevras ton récap quotidien ici.\n(Naya — simulation, sans argent réel)");
      } else {
        await reply(chatId, "Code non reconnu. Reviens dans l'app et clique « Connecter mon Telegram ».");
      }
    } else {
      await reply(chatId, "Bonjour ! Pour recevoir tes récaps, ouvre l'app Naya et clique « Connecter mon Telegram ».");
    }
  }
  return NextResponse.json({ ok: true });
}
