# Telegram Integration

Skill ini lapor ke Telegram Supergroup yang sudah dibagi per topic, lewat `scripts/notify_telegram.js`.

## Setup
1. `.env` — isi `TELEGRAM_BOT_TOKEN` (dari BotFather) dan `TELEGRAM_CHAT_ID` (chat_id supergroup, biasanya angka negatif)
2. `config/telegram_topics.json` — copy dari `assets/telegram_topics.example.json`, isi tiap `message_thread_id` (didapat saat topic dibuat via Bot API `createForumTopic`, atau lihat panduan setup topic terpisah)

## Topic keys yang dipakai skill ini
| Key | Isi | Dipanggil dari |
|---|---|---|
| `general` | Chat utama / status manual | Ad-hoc |
| `screening` | Hasil `screen_pools.js` — kandidat yang lolos filter | `run_screening_cycle.js` |
| `order_alert` | Notifikasi `create_position.js` sukses | `run_screening_cycle.js` |
| `history_trade` | Notifikasi `close_position.js` sukses (termasuk pnlSol) | `run_position_cycle.js` |
| `risk_alert` | Kill-switch aktif, error transaksi, red-flag darurat | `run_screening_cycle.js`, `run_position_cycle.js` |
| `daily_summary` | Ringkasan harian (total posisi, win rate, net PnL) | Cron harian terpisah (belum diimplementasi di skill ini — bisa jadi prompt Hermes sendiri yang baca `position_history.json`) |
| `lessons` | Analisis kualitatif harian | Cron harian terpisah (sama seperti daily_summary) |

## Cara pakai manual
```bash
node scripts/notify_telegram.js order_alert "Posisi baru dibuka: TOKEN_X di POOL_Y, 0.5 SOL"
```

`general` selalu punya `thread_id: null` di config karena itu main chat grup (Telegram: pesan tanpa `message_thread_id` otomatis masuk ke General di forum-mode supergroup).
