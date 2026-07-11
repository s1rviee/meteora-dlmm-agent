/**
 * evaluate_exit.js
 * Evaluasi exit signal untuk posisi yang sudah terbuka: bounce % dari local low + GMGN buy/sell ratio kuat.
 * Lihat references/strategy.md Bagian 3.
 *
 * PENTING: GMGN API HANYA diakses lewat gmgn-cli, bukan curl/axios langsung.
 *
 * Usage (mode 1, direkomendasikan): node evaluate_exit.js <POSITION_ADDRESS>
 *   -> auto-lookup tokenMint, poolAddress, openTimestamp dari config/position_history.json
 * Usage (mode 2, manual):           node evaluate_exit.js <TOKEN_MINT> <POOL_ADDRESS> <POSITION_ADDRESS_OR_OPEN_TIMESTAMP>
 * Output: { exitSignal: boolean, bouncePct, buySellRatio, details }
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);

/**
 * Ambil local low & harga current dari kline 15m sejak posisi dibuka.
 */
async function getLocalLowAndCurrentPrice(tokenMint, sinceTimestamp) {
  const now = Math.floor(Date.now() / 1000);

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
      String(sinceTimestamp),
      "--to",
      String(now),
      "--raw",
    ],
    { maxBuffer: 1024 * 1024 * 10 }
  );

  const parsed = JSON.parse(stdout);
  const candles = parsed.list || [];
  if (candles.length === 0) {
    throw new Error(`Tidak ada data kline untuk ${tokenMint} sejak ${sinceTimestamp}`);
  }

  const localLow = Math.min(...candles.map((c) => Number(c.low)));
  const currentPrice = Number(candles[candles.length - 1].close);

  return { localLow, currentPrice };
}

/**
 * Ambil buy/sell volume ratio — window lebih pendek (5m) untuk exit, supaya lebih sensitif
 * terhadap momentum bounce, tapi tetap dicek "strongAndConsistent" bukan cuma single spike.
 */
async function getBuySellRatio(tokenMint) {
  const { stdout } = await execFileAsync(
    "gmgn-cli",
    ["token", "info", "--chain", "sol", "--address", tokenMint, "--raw"],
    { maxBuffer: 1024 * 1024 * 10 }
  );

  const parsed = JSON.parse(stdout);
  const buyVolume5m = Number(parsed.price?.buy_volume_5m || 0);
  const sellVolume5m = Number(parsed.price?.sell_volume_5m || 0);
  const buyVolume1h = Number(parsed.price?.buy_volume_1h || 0);
  const sellVolume1h = Number(parsed.price?.sell_volume_1h || 0);

  const ratio5m = sellVolume5m > 0 ? buyVolume5m / sellVolume5m : buyVolume5m > 0 ? Infinity : 0;
  const ratio1h = sellVolume1h > 0 ? buyVolume1h / sellVolume1h : buyVolume1h > 0 ? Infinity : 0;

  // "Strong and consistent" = ratio 5m DAN 1h sama-sama menunjukkan buy dominan (>1.2),
  // supaya tidak salah baca single spike sesaat sebagai bounce beneran.
  const strongAndConsistent = ratio5m >= 1.2 && ratio1h >= 1.2;

  return { ratio5m, ratio1h, buyVolume5m, sellVolume5m, buyVolume1h, sellVolume1h, strongAndConsistent };
}

function loadOpenPositionEntry(positionAddress) {
  const historyPath = path.join(__dirname, "..", "config", "position_history.json");
  const history = fs.existsSync(historyPath)
    ? JSON.parse(fs.readFileSync(historyPath, "utf-8"))
    : [];
  return history.find((p) => p.positionAddress === positionAddress && p.status === "open");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error(
      "Usage: node evaluate_exit.js <POSITION_ADDRESS>\n" +
        "   atau: node evaluate_exit.js <TOKEN_MINT> <POOL_ADDRESS> <POSITION_ADDRESS_OR_OPEN_TIMESTAMP>"
    );
    process.exit(1);
  }

  let tokenMint, poolAddress, positionOpenTimestamp;

  if (args.length === 1) {
    // Mode 1: full auto-lookup by positionAddress
    const positionAddress = args[0];
    const entry = loadOpenPositionEntry(positionAddress);
    if (!entry) {
      throw new Error(
        `Tidak ketemu posisi terbuka untuk "${positionAddress}" di position_history.json.`
      );
    }
    tokenMint = entry.tokenMint;
    poolAddress = entry.poolAddress;
    positionOpenTimestamp = entry.openTimestamp;
  } else {
    // Mode 2: manual/legacy
    [tokenMint, poolAddress] = args;
    const positionAddressOrTimestamp = args[2];
    positionOpenTimestamp = Number(positionAddressOrTimestamp);
    if (!positionOpenTimestamp || Number.isNaN(positionOpenTimestamp)) {
      const entry = loadOpenPositionEntry(positionAddressOrTimestamp);
      if (!entry) {
        throw new Error(
          `Tidak ketemu posisi terbuka untuk "${positionAddressOrTimestamp}" di position_history.json. ` +
            `Pastikan posisi dibuat lewat create_position.js, atau kasih openTimestamp manual (angka unix).`
        );
      }
      positionOpenTimestamp = entry.openTimestamp;
    }
  }

  const riskLimitsPath = path.join(__dirname, "..", "config", "risk_limits.json");
  const riskLimits = JSON.parse(fs.readFileSync(riskLimitsPath, "utf-8"));

  const { localLow, currentPrice } = await getLocalLowAndCurrentPrice(
    tokenMint,
    Number(positionOpenTimestamp)
  );
  const bouncePct = ((currentPrice - localLow) / localLow) * 100;

  const buySellRatio = await getBuySellRatio(tokenMint);

  const bounceTriggered =
    bouncePct >= riskLimits.exit_bounce_pct_min && bouncePct <= riskLimits.exit_bounce_pct_max;
  const buyPressureStrong = buySellRatio.strongAndConsistent === true;

  const exitSignal = bounceTriggered && buyPressureStrong;

  console.log(
    JSON.stringify(
      {
        tokenMint,
        poolAddress,
        bouncePct: bouncePct.toFixed(2),
        bounceTriggered,
        buySellRatio,
        buyPressureStrong,
        exitSignal,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error("Evaluasi exit gagal:", err.message);
  process.exit(1);
});

