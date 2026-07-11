/**
 * close_position.js
 * Claim fee + remove liquidity dari posisi yang sudah ada. Default full removal + claim sekaligus.
 * Lihat references/sdk_usage.md.
 *
 * Usage: node close_position.js <POOL_ADDRESS> <POSITION_ADDRESS> [BPS_TO_REMOVE]
 * BPS_TO_REMOVE: 10000 = 100% (default), misal 5000 = 50% partial removal
 */
require("dotenv").config();
const { Connection, Keypair, PublicKey, sendAndConfirmTransaction } = require("@solana/web3.js");
const bs58 = require("bs58");
const BN = require("bn.js");
const DLMM = require("@meteora-ag/dlmm").default;
const fs = require("fs");
const path = require("path");

async function main() {
  const [poolAddress, positionAddress, bpsStr] = process.argv.slice(2);
  if (!poolAddress || !positionAddress) {
    console.error("Usage: node close_position.js <POOL_ADDRESS> <POSITION_ADDRESS> [BPS_TO_REMOVE]");
    process.exit(1);
  }

  const connection = new Connection(process.env.HELIUS_RPC_URL, "confirmed");
  const wallet = Keypair.fromSecretKey(bs58.decode(process.env.WALLET_PRIVATE_KEY));
  const bps = new BN(bpsStr || 10000);

  const balanceBeforeLamports = await connection.getBalance(wallet.publicKey);

  const dlmmPool = await DLMM.create(connection, new PublicKey(poolAddress));
  const { userPositions } = await dlmmPool.getPositionsByUserAndLbPair(wallet.publicKey);
  const position = userPositions.find(
    (p) => p.publicKey.toBase58() === positionAddress
  );

  if (!position) {
    throw new Error(`Posisi ${positionAddress} tidak ditemukan di pool ${poolAddress}`);
  }

  const binIds = position.positionData.positionBinData.map((b) => b.binId);

  const removeTx = await dlmmPool.removeLiquidity({
    user: wallet.publicKey,
    position: position.publicKey,
    binIds,
    bps,
    shouldClaimAndClose: true, // claim fee sekaligus
  });

  const txs = Array.isArray(removeTx) ? removeTx : [removeTx];
  const signatures = [];
  for (const tx of txs) {
    const sig = await sendAndConfirmTransaction(connection, tx, [wallet]);
    signatures.push(sig);
  }

  const balanceAfterLamports = await connection.getBalance(wallet.publicKey);
  const netSolChange = (balanceAfterLamports - balanceBeforeLamports) / 1e9;

  // Update position_history.json — cari entry yang masih "open" untuk positionAddress ini,
  // tandai closed + isi pnlSol. pnlSol di sini = net SOL change saat close (fee tx dikurangi),
  // BUKAN pnl murni terhadap modal awal (itu perlu solAmount yang tercatat saat create_position.js).
  const historyPath = path.join(__dirname, "..", "config", "position_history.json");
  const history = fs.existsSync(historyPath)
    ? JSON.parse(fs.readFileSync(historyPath, "utf-8"))
    : [];

  const entry = history.find(
    (p) => p.positionAddress === positionAddress && p.status === "open"
  );
  const bpsIsFullClose = bps.toString() === "10000";

  if (entry) {
    const pnlSol = bpsIsFullClose ? Number((netSolChange - entry.solAmount).toFixed(6)) : null;
    entry.status = bpsIsFullClose ? "closed" : "partial";
    entry.closeTimestamp = Math.floor(Date.now() / 1000);
    entry.pnlSol = pnlSol;
    entry.closeTxSignatures = signatures;
    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
  }

  console.log(
    JSON.stringify(
      {
        success: true,
        signatures,
        poolAddress,
        positionAddress,
        bpsRemoved: bps.toString(),
        fullClose: bpsIsFullClose,
        netSolChange: Number(netSolChange.toFixed(6)),
        pnlSol: entry ? entry.pnlSol : null,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error("Close position gagal:", err.message);
  process.exit(1);
});
