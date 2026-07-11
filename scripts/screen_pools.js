/**
 * screen_pools.js
 * Screening kandidat token/pool: GMGN (security + fee + holder) via gmgn-cli + Meteora DLMM Data API (fee/TVL, volume).
 * Lihat references/screening_criteria.md untuk detail threshold.
 *
 * PENTING: GMGN API HANYA diakses lewat gmgn-cli (bukan curl/axios langsung) —
 * situs gmgn.ai butuh login dan tidak return data terstruktur. Lihat references/api_reference.md.
 *
 * Usage: node screen_pools.js
 * Output: JSON array kandidat pool yang lolos semua filter, ke stdout.
 */
require("dotenv").config();
const axios = require("axios");
const { execFile } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);

const CRITERIA = {
  minMarketCap: 200_000,
  maxMarketCap: 300_000, // sekitar 250k
  minVolume24h: 1_000_000,
  minTotalFee: 30, // --min-total-fee
  maxEntrapmentRatio: 0.3, // phishing < 30%
  maxBundlerRate: 0.6, // bundling < 60%
  maxInsiderRatio: 0.1, // insider < 10%
  maxTopHolderRate: 0.3, // top10 < 30%
};

/**
 * Screening via `gmgn-cli market trenches` — token yang sudah graduated ke DEX (--type completed),
 * karena kita butuh pool DLMM yang sudah aktif di Meteora, bukan token yang masih di bonding curve.
 */
async function fetchGmgnCandidates() {
  const args = [
    "market",
    "trenches",
    "--chain",
    "sol",
    "--type",
    "completed",
    "--min-marketcap",
    String(CRITERIA.minMarketCap),
    "--max-marketcap",
    String(CRITERIA.maxMarketCap),
    "--min-volume-24h",
    String(CRITERIA.minVolume24h),
    "--min-total-fee",
    String(CRITERIA.minTotalFee),
    "--max-entrapment-ratio",
    String(CRITERIA.maxEntrapmentRatio),
    "--max-bundler-rate",
    String(CRITERIA.maxBundlerRate),
    "--max-insider-ratio",
    String(CRITERIA.maxInsiderRatio),
    "--max-top-holder-rate",
    String(CRITERIA.maxTopHolderRate),
    "--sort-by",
    "smart_degen_count",
    "--raw",
  ];

  const { stdout } = await execFileAsync("gmgn-cli", args, { maxBuffer: 1024 * 1024 * 10 });
  const parsed = JSON.parse(stdout);
  // Response: data.completed adalah array RankItem (lihat references/api_reference.md)
  return (parsed.data && parsed.data.completed) || [];
}

async function fetchMeteoraPoolDetail(tokenMint) {
  const res = await axios.get(`https://dlmm.datapi.meteora.ag/pools`, {
    params: { search: tokenMint },
  });
  return res.data;
}

function passesGmgnFilter(token) {
  // has_at_least_one_social menggantikan cek "profile picture" — token tanpa social link sering tanpa gambar juga
  return token.has_at_least_one_social === true || token.has_at_least_one_social === undefined;
}

async function main() {
  const gmgnCandidates = await fetchGmgnCandidates();
  const filtered = gmgnCandidates.filter(passesGmgnFilter);

  const results = [];
  for (const token of filtered) {
    try {
      const poolDetail = await fetchMeteoraPoolDetail(token.address);
      if (poolDetail && poolDetail.feeToTvlRatio) {
        results.push({ token, poolDetail });
      }
    } catch (err) {
      console.error(`Gagal ambil detail pool untuk ${token.address}:`, err.message);
    }
  }

  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error("Screening gagal:", err.message);
  process.exit(1);
});

