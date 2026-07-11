/**
 * notify_telegram.js
 * Kirim pesan ke topic tertentu di Telegram Supergroup (pakai message_thread_id).
 * Dipanggil oleh script lain / Hermes cron prompt setelah aksi selesai (create/close position, screening result, dll).
 *
 * Setup: isi TELEGRAM_BOT_TOKEN & TELEGRAM_CHAT_ID di .env, dan config/telegram_topics.json
 * (mapping nama topic -> message_thread_id, lihat assets/telegram_topics.example.json).
 *
 * Usage: node notify_telegram.js <TOPIC_KEY> "<message text>"
 * TOPIC_KEY: general | screening | order_alert | history_trade | risk_alert | daily_summary | lessons
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const axios = require("axios");

async function main() {
  const [topicKey, message] = process.argv.slice(2);
  if (!topicKey || !message) {
    console.error('Usage: node notify_telegram.js <TOPIC_KEY> "<message text>"');
    process.exit(1);
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) {
    throw new Error("TELEGRAM_BOT_TOKEN atau TELEGRAM_CHAT_ID belum diisi di .env");
  }

  const topicsPath = path.join(__dirname, "..", "config", "telegram_topics.json");
  if (!fs.existsSync(topicsPath)) {
    throw new Error(
      "config/telegram_topics.json belum ada. Copy dari assets/telegram_topics.example.json " +
        "dan isi thread_id tiap topic (lihat references/telegram_integration.md)."
    );
  }
  const topics = JSON.parse(fs.readFileSync(topicsPath, "utf-8"));
  const threadId = topics[topicKey];

  if (threadId === undefined) {
    throw new Error(
      `Topic key "${topicKey}" tidak dikenal. Pilihan: ${Object.keys(topics).join(", ")}`
    );
  }

  const payload = {
    chat_id: chatId,
    text: message,
    parse_mode: "HTML",
  };
  // threadId null = kirim ke General/main chat (bukan topic spesifik)
  if (threadId !== null) {
    payload.message_thread_id = threadId;
  }

  const res = await axios.post(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    payload
  );

  console.log(JSON.stringify({ success: true, topicKey, messageId: res.data.result.message_id }, null, 2));
}

main().catch((err) => {
  console.error("Gagal kirim notifikasi Telegram:", err.message);
  process.exit(1);
});
