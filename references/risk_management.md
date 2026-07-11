# Risk Management

Semua aturan ini WAJIB dicek sebelum create position baru — jangan pernah bypass meskipun user terlihat terburu-buru atau tidak menyebutkannya eksplisit di request.

## Position Sizing
- Maksimal 6 posisi aktif bersamaan (modal dibagi rata atau sesuai config `max_positions` di `config/risk_limits.json`)
- Max SOL per posisi = total portofolio / 6 (default), bisa di-override di config tapi harus dikonfirmasi ke user dulu
- Reward system: kalau 1 hari penuh tanpa loss, boleh naikkan ukuran posisi untuk hari berikutnya (manual adjustment oleh user, bukan otomatis oleh skill)

## Waktu Trading
- TIDAK buka posisi baru setelah jam 18:00 waktu lokal user (cek pakai `user_time_v0`, convert ke timezone user)
- Posisi yang sudah terbuka sebelum jam 18:00 boleh terus dimonitor/exit kapan saja

## Kill-Switch
- Stop buka posisi baru jika ada N loss beruntun (default N=3, config di `max_consecutive_losses`)
- Setelah kill-switch aktif, tidak buka posisi baru sampai keesokan hari (reset otomatis jam 00:00 waktu lokal user)
- Jika kill-switch aktif, laporkan ke user dan tanya apakah mau override manual (default: TIDAK override tanpa konfirmasi eksplisit)

## Mistake Handling
- Kalau ada red flag baru muncul di token yang sudah di-LP (misal dev dump, rug signal dari GMGN), tutup posisi segera meski rugi — jangan tunggu exit signal normal
- Tidak ada "menunggu harga lebih baik" setelah keputusan cut loss diambil

## Emotional Guardrails (diterapkan sebagai hard rules, bukan saran)
- Tidak revenge-trade: dilarang buka posisi baru dalam N jam setelah closing posisi dengan loss (default 2 jam, config `cooldown_after_loss_hours`)
- Kalau tidak ada kandidat pool yang lolos screening, jangan paksa cari-cari — laporkan "tidak ada kandidat, agent standby" ke user

## Contoh config (assets/risk_limits.example.json)
```json
{
  "max_positions": 6,
  "max_sol_per_position": null,
  "no_new_position_after_hour": 18,
  "max_consecutive_losses": 3,
  "cooldown_after_loss_hours": 2,
  "entry_drawdown_pct_min": 40,
  "entry_drawdown_pct_max": 60,
  "exit_bounce_pct_min": 15,
  "exit_bounce_pct_max": 25
}
```
`max_sol_per_position: null` berarti dihitung otomatis dari total portfolio balance / max_positions saat runtime.
