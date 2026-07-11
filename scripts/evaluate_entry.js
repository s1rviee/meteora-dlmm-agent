/**
 * evaluate_entry.js
 * Evaluasi entry signal untuk satu pool: drawdown % dari local high + GMGN buy/sell ratio.
 * Lihat references/strategy.md Bagian 2.
 *
 * PENTING: GMGN API HANYA diakses lewat gmgn-cli, bukan curl/axios langsung.
 *
 * Usage: node evaluate_entry.js <TOKEN_MINT> <POOL_ADDRESS>
 * Output: { entrySignal: boolean, drawdownPct, buySellRatio, details }
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);

/**
 * Ambil local high & harga current dari kline 15m selama window tertentu.
 * gmgn-cli market kline --chain sol --address <addr> --resolution 15m --from <ts> --to <ts>
 */
async function getLocalHighAndCurrentPrice(tokenMint, windowHours = 24) {
  const now = Math.floor(Date.now() / 1000);
  const from = now - windowHours * 3600;

  const { stdout } = await execFileAsync(
    "gmgn-cli",
    [
      "market",
      "kline",
      "--chain",
      "sol",
      "--address",
      tokenMint,
      "--resolution",
      "15m",
      "--from",
      String(from),
      "--to",
      String(now),
      "--raw",
    ],
    { maxBuffer: 1024 * 1024 * 10 }
  );

  const parsed = JSON.parse(stdout);
  const candles = parsed.list || [];
  if (candles.length === 0) {
    throw new Error(`Tidak ada data kline untuk ${tokenMint} dalam window ${windowHours}h`);
  }

  const localHigh = Math.max(...candles.map((c) => Number(c.high)));
  const currentPrice = Number(candles[candles.length - 1].close); // candle terakhir = paling baru

  return { localHigh, currentPrice };
}

/**
 * Ambil buy/sell volume ratio dari `gmgn-cli token info` — field price.buy_volume_{window} / price.sell_volume_{window}.
 * Window default 1h untuk konfirmasi entry (dump sudah mulai jenuh, bukan spike sesaat).
 */
async function getBuySellRatio(tokenMint, window = "1h") {
  const { stdout } = await execFileAsync(
    "gmgn-cli",
    ["token", "info", "--chain", "sol", "--address", tokenMint, "--raw"],
    { maxBuffer: 1024 * 1024 * 10 }
  );

  const parsed = JSON.parse(stdout);
  const buyVolume = Number(parsed.price?.[`buy_volume_${window}`] || 0);
  const sellVolume = Number(parsed.price?.[`sell_volume_${window}`] || 0);
  const ratio = sellVolume > 0 ? buyVolume / sellVolume : buyVolume > 0 ? Infinity : 0;

  // "Improving" untuk entry = sell pressure mulai melandai relatif terhadap buy (ratio > 0.5, bukan harus > 1)
  // karena saat dump masih ada sell dominan, kita cari tanda pelunakan, bukan reversal penuh.
  const improving = ratio >= 0.5;

  return { window, buyVolume, sellVolume, ratio, improving };
}

async function main() {
  const [tokenMint, poolAddress] = process.argv.slice(2);
  if (!tokenMint || !poolAddress) {
    console.error("Usage: node evaluate_entry.js <TOKEN_MINT> <POOL_ADDRESS>");
    process.exit(1);
  }

  const riskLimitsPath = path.join(__dirname, "..", "config", "risk_limits.json");
  const riskLimits = JSON.parse(fs.readFileSync(riskLimitsPath, "utf-8"));

  const { localHigh, currentPrice } = await getLocalHighAndCurrentPrice(tokenMint);
  const drawdownPct = ((localHigh - currentPrice) / localHigh) * 100;

  const buySellRatio = await getBuySellRatio(tokenMint);

  const drawdownTriggered =
    drawdownPct >= riskLimits.entry_drawdown_pct_min &&
    drawdownPct <= riskLimits.entry_drawdown_pct_max;
  const ratioImproving = buySellRatio.improving === true;

  const entrySignal = drawdownTriggered && ratioImproving;

  console.log(
    JSON.stringify(
      {
        tokenMint,
        poolAddress,
        drawdownPct: drawdownPct.toFixed(2),
        drawdownTriggered,
        buySellRatio,
        ratioImproving,
        entrySignal,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error("Evaluasi entry gagal:", err.message);
  process.exit(1);
});

