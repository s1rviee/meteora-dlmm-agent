# Strategi Entry/Exit — Dump-and-Bounce Fee Capture

Diadaptasi dari "Evil Panda Strat" (Advanced Bootcamp #7): tangkap fee dari dump memakai wide-range one-sided LP, lalu keluar di bounce pertama. Trigger teknikal asli (Supertrend/RSI2/MACD/BB) diganti proxy price-action + on-chain data karena GMGN/Meteora API tidak menyediakan kalkulasi indikator candle secara langsung.

## Bagian 1 — Coin/Pool Selection

Lihat `screening_criteria.md` untuk kriteria lengkap. Ringkas:
- MC sekitar 250k, volume 24h ≥ 1,000,000
- Sort by age (coin yang lebih baru diprioritaskan untuk volatilitas dump)
- Skip token tanpa gambar profil / centang GMGN yang belum lengkap
- GMGN filter: fee > 30, phishing < 30%, bundling < 60%, insider < 10%, top10 holder < 30%

## Bagian 2 — Entry Criteria (Create Position)

**Trigger utama: Drawdown %**
- Hitung local high dari harga pool dalam window tertentu (default 24h, bisa disesuaikan)
- Trigger saat harga sudah turun X% dari local high (default range -40% s/d -60%, dapat di-tune per pool volatility)
- Ini adalah pengganti "break Supertrend" — filosofinya sama: masuk setelah ada tanda dump sudah signifikan, bukan di awal dump

**Konfirmasi: GMGN Buy/Sell Ratio**
- Ambil netflow / buy-sell ratio dari GMGN untuk pool tersebut
- Trigger konfirmasi saat sell pressure mulai melandai (ratio buy/sell naik dari titik terendahnya, atau netflow mulai positif meski kecil)
- Ini pengganti filter "harga sudah stabil sebelum masuk" — mencegah masuk saat dump masih berlanjut tajam

**Kondisi entry terpenuhi jika KEDUA hal di atas confluence** (drawdown trigger AND buy/sell ratio membaik).

**Aksi:**
- Buka one-sided SOL DLMM position
- Bin count: 80, 100, atau 125 (default 100 kalau tidak ditentukan user)
- Range: -86% s/d -94% dari harga current (menutup potensi dump lanjutan sambil tetap efisien)
- SPOT distribution (default) — Bid/Ask opsional jika user minta

## Bagian 3 — Exit Criteria (Claim Fee + Remove Liquidity)

**Trigger utama: Bounce %**
- Hitung local low sejak posisi dibuka
- Trigger saat harga sudah bounce Y% dari local low (default range +15% s/d +25%)
- Pengganti "RSI(2) close above 90 + BB upper line"

**Konfirmasi: GMGN Buy/Sell Ratio**
- Trigger saat buy pressure kuat dan konsisten (bukan single spike) — cegah bounce palsu
- Pengganti "RSI(2)>90 + MACD histogram hijau"

**Kondisi exit terpenuhi jika KEDUA hal di atas confluence** (bounce trigger AND buy pressure kuat).

**Aksi:**
- Claim accumulated fee
- Remove liquidity (partial atau full sesuai config)
- Convert token hasil fee ke SOL (lewat swap, bukan bagian skill ini — laporkan ke user untuk instruksi swap route jika belum ada auto-swap)

## Bagian 4 — Prinsip Eksekusi (dari filosofi Evil Panda, tetap berlaku)

- Dump itu bagus untuk strategi ini — jangan treat drawdown sebagai sinyal darurat, itu adalah kondisi yang dicari
- Kalau market sepi (tidak ada pool yang lolos screening), JANGAN paksa buka posisi — laporkan "tidak ada kandidat" ke user
- Tidak ada override manual "tunggu harga lebih tinggi" saat exit signal sudah confluence — begitu 2 kondisi terpenuhi, eksekusi exit
- Kalau posisi salah (pool ternyata rug/red flag baru muncul), tutup posisi meski rugi — jangan tunggu
- Distribusikan modal ke maksimal 6 posisi aktif (lihat risk_management.md)
- Tidak ada posisi baru dibuka setelah jam 18:00 waktu lokal user
- Tidak ada revenge-trade: kalau ada loss beruntun (lihat threshold di risk_management.md), stop buka posisi baru sampai keesokan hari
