/**
 * check_portfolio.js
 * Cek balance wallet dan semua open positions DLMM milik user.
 * Usage: node check_portfolio.js
 */
require("dotenv").config();
const { Connection, Keypair, PublicKey } = require("@solana/web3.js");
const bs58 = require("bs58");
const DLMM = require("@meteora-ag/dlmm").default;
const fs = require("fs");
const path = require("path");

async function main() {
  const connection = new Connection(process.env.HELIUS_RPC_URL, "confirmed");
  const wallet = Keypair.fromSecretKey(bs58.decode(process.env.WALLET_PRIVATE_KEY));

  const solBalanceLamports = await connection.getBalance(wallet.publicKey);
  const solBalance = solBalanceLamports / 1e9;

  const riskLimitsPath = path.join(__dirname, "..", "config", "risk_limits.json");
  const riskLimits = fs.existsSync(riskLimitsPath)
    ? JSON.parse(fs.readFileSync(riskLimitsPath, "utf-8"))
    : { max_positions: 6 };

  const historyPath = path.join(__dirname, "..", "config", "position_history.json");
  const history = fs.existsSync(historyPath)
    ? JSON.parse(fs.readFileSync(historyPath, "utf-8"))
    : [];
  const openFromHistory = history.filter((p) => p.status === "open");

  // Verifikasi tiap posisi "open" di history masih beneran ada on-chain (bisa saja sudah closed manual di luar skill)
  const openPositions = [];
  for (const entry of openFromHistory) {
    try {
      const dlmmPool = await DLMM.create(connection, new PublicKey(entry.poolAddress));
      const { userPositions } = await dlmmPool.getPositionsByUserAndLbPair(wallet.publicKey);
      const stillOpen = userPositions.some(
        (p) => p.publicKey.toBase58() === entry.positionAddress
      );
      if (stillOpen) {
        openPositions.push(entry);
      }
    } catch (err) {
      console.error(`Gagal verifikasi posisi ${entry.positionAddress}:`, err.message);
    }
  }

  const closed = history.filter((p) => p.status === "closed");
  const consecutiveLosses = (() => {
    const sorted = [...closed].sort((a, b) => b.closeTimestamp - a.closeTimestamp);
    let count = 0;
    for (const p of sorted) {
      if (typeof p.pnlSol === "number" && p.pnlSol < 0) count++;
      else break;
    }
    return count;
  })();

  const summary = {
    walletAddress: wallet.publicKey.toBase58(),
    solBalance,
    activePositionsCount: openPositions.length,
    maxPositions: riskLimits.max_positions,
    slotsAvailable: riskLimits.max_positions - openPositions.length,
    consecutiveLosses,
    openPositions,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error("Cek portfolio gagal:", err.message);
  process.exit(1);
});
