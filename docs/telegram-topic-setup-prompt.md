# Telegram Topic Setup Prompt

Feed this prompt to Hermes **once** (in chat or via `hermes chat -q "..."`) to have it create the
Telegram Supergroup topic structure used by this skill and record the resulting `message_thread_id`
values into `config/telegram_topics.json`.

This is intentionally kept **separate from SKILL.md** — it's a one-time setup task, not something
the trading agent should ever run again automatically.

---

```
Kamu bertugas membuat struktur Telegram Supergroup untuk bot trading LP "MeteoraDLMM-Agent".

Langkah:
1. Buat/gunakan Telegram Bot (via BotFather) dan pastikan bot punya izin admin di grup.
2. Buat Telegram Supergroup baru dengan nama "MeteoraDLMM Agent" dan aktifkan fitur "Topics" (Forum mode) di pengaturan grup.
3. Buat 7 topic berikut dengan nama dan emoji persis seperti ini:
   - 💬 General
   - 🔥 Screening
   - 📢 Order Alert
   - 💰 History Trade
   - ⚠️ Risk Alert
   - 📊 Daily Summary
   - 🧠 Lessons
4. Untuk setiap topic yang dibuat, catat `message_thread_id`-nya (Telegram API mengembalikan ini saat createForumTopic, atau bisa didapat dari getUpdates/getForumTopicIconStickers setelah topic dibuat).
5. Simpan hasilnya ke file config/telegram_topics.json dengan format:
   {
     "general": null,
     "screening": <thread_id>,
     "order_alert": <thread_id>,
     "history_trade": <thread_id>,
     "risk_alert": <thread_id>,
     "daily_summary": <thread_id>,
     "lessons": <thread_id>
   }
   (general tetap null karena itu main chat, bukan topic terpisah)
6. Simpan juga chat_id grup dan bot token ke .env sebagai TELEGRAM_CHAT_ID dan TELEGRAM_BOT_TOKEN.
7. Setelah selesai, kirim 1 pesan test ke masing-masing topic (isi: "✅ Topic ini siap dipakai") untuk konfirmasi thread_id yang tersimpan benar.
8. Laporkan ke saya: nama grup, chat_id, dan daftar thread_id per topic yang berhasil disimpan.

Jangan lanjut ke langkah trading/screening apa pun di prompt ini — tugasmu hanya setup struktur grup dan topic.
```

---

## After running this

Verify the result:

```bash
cat ~/.hermes/skills/meteora-dlmm-agent/config/telegram_topics.json
```

Every key except `general` should have a non-null integer value. If any are still `null`, re-run the
prompt or set them manually — see [`../references/telegram_integration.md`](../references/telegram_integration.md).

