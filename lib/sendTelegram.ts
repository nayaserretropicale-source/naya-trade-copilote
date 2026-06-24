import { fetchWithTimeout } from "@/lib/fetchWithTimeout";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export async function sendTelegramTo(chatId: string, text: string) {
  if (!TOKEN || !chatId) return;
  try {
    await fetchWithTimeout(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch {}
}

export async function sendTelegram(text: string) {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) return;
  await sendTelegramTo(chatId, text);
}

export function formatReport(report: { title: string; summary: string; risk_level: string }) {
  return `🌙 ${report.title}\n\n${report.summary}\n\nRisque : ${report.risk_level}\n(Simulation — sans argent réel)`;
}
