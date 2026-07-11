/**
 * create_position.js
 * Buka one-sided SOL DLMM position. WAJIB cek risk limits (max positions, jam trading) sebelum jalan.
 * Lihat references/risk_management.md dan references/sdk_usage.md.
 *
 * Usage: node create_position.js <POOL_ADDRESS> <TOKEN_MINT> <SOL_AMOUNT> [BIN_COUNT] [STRATEGY]
 * STRATEGY: "spot" (default) atau "bidask"
 * TOKEN_MINT disimpan di position_history.json supaya evaluate_exit.js bisa lookup tanpa input manual.
 */
require("dotenv").config();
const { Connection, Keypair, PublicKey, sendAndConfirmTransaction } = require("@solana/web3.js");
const bs58 = require("bs58");
const BN = require("bn.js");
const DLMM = require("@meteora-ag/dlmm").default;
const { StrategyType } = require("@meteora-ag/dlmm");
const fs = require("fs");
const path = require("path");

/**
 * Ambil jam saat ini di timezone yang dikonfigurasi (config/risk_limits.json -> "timezone"),
 * BUKAN jam lokal server/VPS. Ini penting karena VPS bisa di-host di region mana pun —
 * aturan "no trade after jam X" harus konsisten terhadap timezone yang kamu tentukan, bukan tempat VPS berada.
 */
function getHourInTimezone(timezone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    hour12: false,
  });
  const hourStr = formatter.format(new Date());
  return Number(hourStr === "24" ? "0" : hourStr);
}

async function checkRiskLimits(connection, wallet) {
  const riskLimitsPath = path.join(__dirname, "..", "config", "risk_limits.json");
  const riskLimits = JSON.parse(fs.readFileSync(riskLimitsPath, "utf-8"));

  const timezone = riskLimits.timezone || "Asia/Jakarta";
  const hour = getHourInTimezone(timezone);
  if (hour >= riskLimits.no_new_position_after_hour) {
    throw new Error(
      `Blocked oleh risk limit: sudah jam ${hour}:00 di ${timezone} (cutoff jam ${riskLimits.no_new_position_after_hour}:00), tidak boleh buka posisi baru.`
    );
  }

  const now = new Date();

  const historyPath = path.join(__dirname, "..", "config", "position_history.json");
  const history = fs.existsSync(historyPath)
    ? JSON.parse(fs.readFileSync(historyPath, "utf-8"))
    : [];

  const openPositions = history.filter((p) => p.status === "open");
  if (openPositions.length >= riskLimits.max_positions) {
    throw new Error(
      `Blocked oleh risk limit: sudah ${openPositions.length}/${riskLimits.max_positions} posisi aktif.`
    );
  }

  const closedSorted = history
    .filter((p) => p.status === "closed")
    .sort((a, b) => b.closeTimestamp - a.closeTimestamp);

  let consecutiveLosses = 0;
  for (const p of closedSorted) {
    if (typeof p.pnlSol === "number" && p.pnlSol < 0) consecutiveLosses++;
    else break;
  }
  if (consecutiveLosses >= riskLimits.max_consecutive_losses) {
    const lastCloseTs = closedSorted[0]?.closeTimestamp || 0;
    const cooldownUntil = lastCloseTs + riskLimits.cooldown_after_loss_hours * 3600;
    if (Math.floor(now.getTime() / 1000) < cooldownUntil) {
      throw new Error(
        `Blocked oleh kill-switch: ${consecutiveLosses} loss beruntun, cooldown sampai ${new Date(
          cooldownUntil * 1000
        ).toISOString()}.`
      );
    }
  }

  return { riskLimits, historyPath, history };
}

function appendPositionHistory(historyPath, history, entry) {
  history.push(entry);
  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
}

async function main() {
  const [poolAddress, tokenMint, solAmountStr, binCountStr, strategyArg] = process.argv.slice(2);
  if (!poolAddress || !tokenMint || !solAmountStr) {
    console.error(
      "Usage: node create_position.js <POOL_ADDRESS> <TOKEN_MINT> <SOL_AMOUNT> [BIN_COUNT] [STRATEGY]"
    );
    process.exit(1);
  }

  const connection = new Connection(process.env.HELIUS_RPC_URL, "confirmed");
  const wallet = Keypair.fromSecretKey(bs58.decode(process.env.WALLET_PRIVATE_KEY));

  const { riskLimits, historyPath, history } = await checkRiskLimits(connection, wallet);

  const solAmountLamports = new BN(Number(solAmountStr) * 1e9);
  const binCount = Number(binCountStr) || riskLimits.default_bin_count || 100;
  const strategyType =
    (strategyArg || "spot").toLowerCase() === "bidask" ? StrategyType.BidAsk : StrategyType.Spot;

  const dlmmPool = await DLMM.create(connection, new PublicKey(poolAddress));
  const activeBin = await dlmmPool.getActiveBin();

  const minBinId = activeBin.binId - binCount; // range -86% s/d -94% tergantung bin step
  const maxBinId = activeBin.binId;

  const newPositionKeypair = Keypair.generate();

  const createPositionTx = await dlmmPool.initializePositionAndAddLiquidityByStrategy({
    positionPubKey: newPositionKeypair.publicKey,
    user: wallet.publicKey,
    totalXAmount: new BN(0),
    totalYAmount: solAmountLamports,
    strategy: { maxBinId, minBinId, strategyType },
  });

  const signature = await sendAndConfirmTransaction(connection, createPositionTx, [
    wallet,
    newPositionKeypair,
  ]);

  // Simpan entry ke position_history.json — ini yang dibaca evaluate_exit.js (openTimestamp)
  // dan checkRiskLimits (consecutive losses, max positions) di run berikutnya.
  appendPositionHistory(historyPath, history, {
    positionAddress: newPositionKeypair.publicKey.toBase58(),
    poolAddress,
    tokenMint,
    solAmount: Number(solAmountStr),
    binCount,
    strategyType: strategyArg || "spot",
    openTimestamp: Math.floor(Date.now() / 1000),
    status: "open",
    closeTimestamp: null,
    pnlSol: null,
    createTxSignature: signature,
  });

  console.log(
    JSON.stringify(
      {
        success: true,
        signature,
        positionAddress: newPositionKeypair.publicKey.toBase58(),
        poolAddress,
        tokenMint,
        solAmount: Number(solAmountStr),
        binCount,
        strategyType: strategyArg || "spot",
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error("Create position gagal:", err.message);
  process.exit(1);
});
