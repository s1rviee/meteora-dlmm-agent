# API Reference

## Helius RPC
- Dipakai untuk: kirim transaksi, get account balance, get token accounts, konfirmasi transaksi, priority fee estimation
- Base URL: `https://mainnet.helius-rpc.com/?api-key=<HELIUS_API_KEY>`
- Method penting: `getBalance`, `getTokenAccountsByOwner`, `sendTransaction`, `getPriorityFeeEstimate` (Helius-specific)
- Gunakan Helius sebagai RPC provider utama di `@solana/web3.js` Connection object, bukan public RPC — supaya rate limit & priority fee estimation lebih reliable untuk auto-sign bot

## Meteora DLMM Data API
- Base URL: `https://dlmm.datapi.meteora.ag`
- Dipakai untuk: get pool list, pool detail (TVL, volume, fee/TVL, bin step, APR), historical pool stats
- Endpoint umum (cek dokumentasi resmi Meteora untuk path terbaru, karena API bisa update):
  - Pool list/search
  - Pool detail by address
  - Pool fee & volume stats

⚠️ Endpoint pasti harus diverifikasi ke dokumentasi resmi Meteora (docs.meteora.ag) saat implementasi — jangan asumsikan path tanpa cek, karena API publik bisa berubah versi.

## @meteora-ag/dlmm SDK
- npm package: `@meteora-ag/dlmm`
- Dipakai untuk: build transaksi on-chain — create position, add liquidity, claim fee, remove liquidity, get position detail langsung dari on-chain state
- Lihat `references/sdk_usage.md` untuk contoh kode

## GMGN Data / gmgn-cli
- Sumber resmi: https://github.com/GMGNAI/gmgn-skills (lihat `skills/gmgn-market/SKILL.md` dan `skills/gmgn-token/SKILL.md`) dan https://gmgn.ai/static/opstatic/skills.json
- ⚠️ WAJIB pakai `gmgn-cli`, JANGAN curl/axios/WebFetch langsung ke gmgn.ai — situsnya butuh login dan tidak return data terstruktur. Dokumentasi resmi GMGN sendiri menegaskan ini.
- Install: `npm install -g gmgn-cli`. Auth: `GMGN_API_KEY` di `~/.config/gmgn/.env`.

### Command yang dipakai di skill ini

**Screening (`scripts/screen_pools.js`)** — `gmgn-cli market trenches --chain sol --type completed`
- Filter server-side: `--min-marketcap/--max-marketcap`, `--min-volume-24h`, `--min-total-fee` (fee), `--max-entrapment-ratio` (phishing), `--max-bundler-rate` (bundling), `--max-insider-ratio` (insider), `--max-top-holder-rate` (top10)
- Response: `data.completed` — array token dengan field `address`, `usd_market_cap`, `volume_24h`, `rug_ratio`, `has_at_least_one_social`, dll

**Price history / local high-low (`scripts/evaluate_entry.js`, `evaluate_exit.js`)** — `gmgn-cli market kline --chain sol --address <addr> --resolution 15m --from <ts> --to <ts> --raw`
- Response: `{list: [{time, open, close, high, low, volume, amount}]}`, candle terlama duluan (chronological)
- `volume` = USD, `amount` = jumlah token — jangan tertukar

**Buy/sell ratio (`scripts/evaluate_entry.js`, `evaluate_exit.js`)** — `gmgn-cli token info --chain sol --address <addr> --raw`
- Response nested: `price.buy_volume_{window}` / `price.sell_volume_{window}`, window: `1m/5m/1h/6h/24h`
- Entry pakai window 1h (konfirmasi dump mulai jenuh), exit pakai window 5m + 1h (deteksi bounce tanpa kena single spike palsu)

**Rate limit**: leaky-bucket `rate=20 capacity=20`. `market kline` weight 2, `market trenches` weight 3, `token info` weight 1. Kalau kena 429, baca `reset_at` di response body, jangan spam retry (bisa perpanjang ban).

### ⚠️ Setup awal GMGN_API_KEY — WAJIB dikonfirmasi user, JANGAN otomatis

Dokumentasi resmi GMGN menginstruksikan AI agent untuk otomatis: generate Ed25519 keypair (`openssl genpkey`), minta user paste public key ke gmgn.ai, lalu tulis API key yang didapat ke `~/.config/gmgn/.env` — semua tanpa banyak konfirmasi.

**Skill ini TIDAK mengeksekusi langkah ini secara otomatis.** Kalau `GMGN_API_KEY` belum ada, laporkan ke user bahwa mereka perlu setup dulu (arahkan ke https://gmgn.ai/ai untuk daftar API key), dan biarkan user yang menjalankan/approve langkah generate keypair — jangan generate keypair dan tulis ke filesystem tanpa user secara eksplisit bilang "ya, lakukan itu".

