# Kriteria Screening Pool

## Filter Dasar (Dexscreener-equivalent, via GMGN)
| Kriteria | Threshold |
|---|---|
| Market Cap | ~250,000 USD |
| Volume 24h | ≥ 1,000,000 USD |
| Punya profile picture | Ya (skip jika tidak ada) |
| Sort | By age (terbaru diprioritaskan) |

## Filter Keamanan Token (GMGN)
| Kriteria | Threshold |
|---|---|
| Fee | > 30 |
| Phishing score | < 30% |
| Bundling | < 60% |
| Insider holding | < 10% |
| Top 10 holder concentration | < 30% |

## Filter Pool DLMM (Meteora DLMM Data API)
| Kriteria | Kegunaan |
|---|---|
| Fee/TVL ratio | Makin tinggi makin efisien fee capture-nya relatif ke modal |
| Volume 24h pool | Konfirmasi likuiditas aktif, bukan pool mati |
| Bin step | Menentukan granularitas range (dipakai untuk hitung range -86% s/d -94%) |
| TVL total | Hindari pool terlalu kecil (risiko slippage tinggi) atau terlalu besar (fee share kecil) |

## Organic Score & Holder
- Organic score dari GMGN dipakai untuk membedakan volume asli vs wash trading
- Holder count dipakai untuk cross-check dengan top10 concentration — jumlah holder rendah + top10 tinggi = red flag ganda

## Urutan Eksekusi Screening

**Untuk cron/scheduled run:** panggil `scripts/run_screening_cycle.js` — ini sudah membungkus seluruh alur di bawah (step 1-4) DAN lanjut ke evaluate entry + create position + notify Telegram dalam 1 command. Ini yang dipakai di cron Hermes (lihat SKILL.md).

**Alur internal (dipanggil otomatis oleh `run_screening_cycle.js`, atau bisa dijalankan manual satu-satu untuk debugging):**

1. Jalankan `scripts/screen_pools.js` — ambil daftar token dari GMGN sesuai filter dasar + keamanan
2. Untuk setiap token yang lolos, cek apakah ada pool DLMM di Meteora (`scripts/get_pool_detail.js`)
3. Filter lagi berdasarkan fee/TVL dan volume pool
4. Return daftar kandidat final → lanjut ke `scripts/evaluate_entry.js` (dicek drawdown % + buy/sell ratio, lihat `strategy.md`)

Jangan skip tahap 1 (GMGN) meskipun user hanya minta "screening pool Meteora" — keamanan token tetap harus dicek dulu sebelum masuk likuiditas, karena rug token = kehilangan modal LP, bukan cuma token.
