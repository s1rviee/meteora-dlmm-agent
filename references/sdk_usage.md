# @meteora-ag/dlmm SDK Usage

⚠️ Contoh di bawah ini adalah pola umum berdasarkan struktur SDK Meteora DLMM. Sebelum eksekusi nyata, SELALU cek versi terbaru SDK (`npm view @meteora-ag/dlmm`) dan dokumentasi resmi (docs.meteora.ag / GitHub MeteoraAg/dlmm-sdk) karena method signature bisa berubah antar versi.

## Setup Connection (via Helius RPC)

```js
const { Connection, Keypair } = require("@solana/web3.js");
const bs58 = require("bs58");
require("dotenv").config();

const connection = new Connection(process.env.HELIUS_RPC_URL, "confirmed");
const wallet = Keypair.fromSecretKey(bs58.decode(process.env.WALLET_PRIVATE_KEY));
```

## Get Pool Instance

```js
const DLMM = require("@meteora-ag/dlmm").default;
const { PublicKey } = require("@solana/web3.js");

const poolAddress = new PublicKey("<POOL_ADDRESS>");
const dlmmPool = await DLMM.create(connection, poolAddress);
```

## Create One-Sided Position

```js
const { StrategyType } = require("@meteora-ag/dlmm");

const activeBin = await dlmmPool.getActiveBin();
const totalRangeBins = 100; // sesuai config bin count 80/100/125
const minBinId = activeBin.binId - totalRangeBins; // arah -86% s/d -94%
const maxBinId = activeBin.binId; // one-sided SOL, jadi max = active bin

const createPositionTx = await dlmmPool.initializePositionAndAddLiquidityByStrategy({
  positionPubKey: newPositionKeypair.publicKey,
  user: wallet.publicKey,
  totalXAmount: new BN(0), // token lain = 0 (one-sided)
  totalYAmount: solAmountLamports, // SOL side
  strategy: {
    maxBinId,
    minBinId,
    strategyType: StrategyType.Spot, // atau BidAsk sesuai pilihan user
  },
});
```

## Get Positions (Portfolio Check)

```js
const positions = await dlmmPool.getPositionsByUserAndLbPair(wallet.publicKey);
```

## Claim Fee

```js
const claimTx = await dlmmPool.claimSwapFee({
  owner: wallet.publicKey,
  position: userPosition,
});
```

## Remove Liquidity

```js
const removeTx = await dlmmPool.removeLiquidity({
  user: wallet.publicKey,
  position: userPosition.publicKey,
  binIds: userPosition.positionData.positionBinData.map(b => b.binId),
  bps: new BN(10000), // 100% removal, sesuaikan untuk partial
  shouldClaimAndClose: true, // claim fee sekaligus saat remove
});
```

## Sign & Send

```js
const { sendAndConfirmTransaction } = require("@solana/web3.js");
const signature = await sendAndConfirmTransaction(connection, tx, [wallet, newPositionKeypair]);
```

Selalu wrap semua transaction sending dengan try/catch, dan JANGAN retry otomatis lebih dari 1x jika gagal — laporkan error ke user (lihat prinsip eksekusi di SKILL.md utama).
