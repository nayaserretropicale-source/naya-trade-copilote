export async function sendTelegram(message: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.error("Telegram non configure");
    return false;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message }),
    });
    return res.ok;
  } catch (e) {
    console.error("Erreur Telegram:", e);
    return false;
  }
}

export function formatReport(r: { title: string; summary: string; risk_level: string }) {
  return `🌙 Rapport du soir — Naya Copilote\n\n${r.title}\n\n${r.summary}\n\n⚠️ Niveau de risque : ${r.risk_level}`;
}
