/**
 * get_pool_detail.js
 * Ambil detail pool DLMM: TVL, volume, fee/TVL, bin step, APR (dari Meteora DLMM Data API),
 * plus active bin & current price (on-chain, via SDK).
 *
 * Usage: node get_pool_detail.js <POOL_ADDRESS>
 */
require("dotenv").config();
const axios = require("axios");
const { Connection, PublicKey } = require("@solana/web3.js");
const DLMM = require("@meteora-ag/dlmm").default;

async function main() {
  const poolAddress = process.argv[2];
  if (!poolAddress) {
    console.error("Usage: node get_pool_detail.js <POOL_ADDRESS>");
    process.exit(1);
  }

  const [offchainRes, connection] = await Promise.all([
    axios.get(`https://dlmm.datapi.meteora.ag/pools/${poolAddress}`),
    Promise.resolve(new Connection(process.env.HELIUS_RPC_URL, "confirmed")),
  ]);

  const dlmmPool = await DLMM.create(connection, new PublicKey(poolAddress));
  const activeBin = await dlmmPool.getActiveBin();

  const detail = {
    poolAddress,
    offchain: offchainRes.data,
    onchain: {
      activeBinId: activeBin.binId,
      currentPrice: activeBin.price,
      binStep: dlmmPool.lbPair.binStep,
    },
  };

  console.log(JSON.stringify(detail, null, 2));
}

main().catch((err) => {
  console.error("Gagal ambil detail pool:", err.message);
  process.exit(1);
});
