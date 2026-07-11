/**
 * run_daily_review.js
 * Cron harian gabungan (jalankan 1x sehari, misal 00:05):
 *   1. Hitung & kirim Daily Summary (deterministic, angka mentah) -> topic `daily_summary`
 *   2. Siapkan data terstruktur per-posisi kemarin -> dicetak ke stdout sebagai JSON
 *
 * PENTING: Script ini TIDAK melakukan analisis kualitatif ("kenapa profit/loss").
 * Bagian itu diserahkan ke reasoning Hermes — prompt cron yang manggil script ini harus:
 *   a) jalankan script ini, baca `positionsForLessons` dari stdout
 *   b) analisis pola profit/loss dari data itu (reasoning oleh LLM/Hermes)
 *   c) kirim hasil analisis ke topic `lessons` via: node scripts/notify_telegram.js lessons "<analisis>"
 *
 * Usage: node run_daily_review.js [--hours 24]
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);

const SCRIPTS_DIR = __dirname;

function runScript(scriptName, args = []) {
  return execFileAsync("node", [path.join(SCRIPTS_DIR, scriptName), ...args], {
    maxBuffer: 1024 * 1024 * 20,
  }).then(({ stdout }) => JSON.parse(stdout));
}

async function notify(topicKey, message) {
  try {
    await runScript("notify_telegram.js", [topicKey, message]);
    return true;
  } catch (err) {
    console.error(`Gagal notify ke topic "${topicKey}":`, err.message);
    return false;
  }
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}j ${m}m`;
}

async function main() {
  const hoursArgIdx = process.argv.indexOf("--hours");
  const windowHours = hoursArgIdx !== -1 ? Number(process.argv[hoursArgIdx + 1]) : 24;

  const historyPath = path.join(SCRIPTS_DIR, "..", "config", "position_history.json");
  const history = fs.existsSync(historyPath)
    ? JSON.parse(fs.readFileSync(historyPath, "utf-8"))
    : [];

  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - windowHours * 3600;

  const closedInWindow = history.filter(
    (p) => p.status === "closed" && p.closeTimestamp && p.closeTimestamp >= windowStart
  );

  // ── 1. Daily Summary (deterministic) ──────────────────────────────
  if (closedInWindow.length === 0) {
    await notify(
      "daily_summary",
      `📊 Daily Summary (${windowHours}h terakhir): tidak ada posisi yang ditutup.`
    );
    console.log(
      JSON.stringify(
        { dailySummarySent: true, positionsCount: 0, positionsForLessons: [] },
        null,
        2
      )
    );
    return;
  }

  const wins = closedInWindow.filter((p) => typeof p.pnlSol === "number" && p.pnlSol > 0);
  const losses = closedInWindow.filter((p) => typeof p.pnlSol === "number" && p.pnlSol < 0);
  const netPnl = closedInWindow.reduce((sum, p) => sum + (p.pnlSol || 0), 0);
  const winRate = (wins.length / closedInWindow.length) * 100;

  const sortedByPnl = [...closedInWindow].sort((a, b) => (b.pnlSol || 0) - (a.pnlSol || 0));
  const bestPosition = sortedByPnl[0];
  const worstPosition = sortedByPnl[sortedByPnl.length - 1];

  const avgDurationSec =
    closedInWindow.reduce((sum, p) => sum + (p.closeTimestamp - p.openTimestamp), 0) /
    closedInWindow.length;

  const summaryMessage =
    `📊 Daily Summary (${windowHours}h terakhir)\n` +
    `Posisi ditutup: ${closedInWindow.length} (${wins.length} win, ${losses.length} loss)\n` +
    `Win rate: ${winRate.toFixed(1)}%\n` +
    `Net PnL: ${netPnl >= 0 ? "+" : ""}${netPnl.toFixed(4)} SOL\n` +
    `Rata-rata durasi holding: ${formatDuration(avgDurationSec)}\n` +
    `Terbaik: ${bestPosition.tokenMint} (${bestPosition.pnlSol >= 0 ? "+" : ""}${bestPosition.pnlSol?.toFixed(4)} SOL)\n` +
    `Terburuk: ${worstPosition.tokenMint} (${worstPosition.pnlSol >= 0 ? "+" : ""}${worstPosition.pnlSol?.toFixed(4)} SOL)`;

  const dailySummarySent = await notify("daily_summary", summaryMessage);

  // ── 2. Data untuk Lessons (reasoning diserahkan ke Hermes) ────────
  const positionsForLessons = closedInWindow.map((p) => ({
    tokenMint: p.tokenMint,
    poolAddress: p.poolAddress,
    result: p.pnlSol > 0 ? "win" : p.pnlSol < 0 ? "loss" : "breakeven",
    pnlSol: p.pnlSol,
    solAmount: p.solAmount,
    binCount: p.binCount,
    strategyType: p.strategyType,
    openTimestamp: p.openTimestamp,
    closeTimestamp: p.closeTimestamp,
    durationFormatted: formatDuration(p.closeTimestamp - p.openTimestamp),
  }));

  console.log(
    JSON.stringify(
      {
        dailySummarySent,
        positionsCount: closedInWindow.length,
        winRate: Number(winRate.toFixed(1)),
        netPnlSol: Number(netPnl.toFixed(4)),
        positionsForLessons,
        instructionsForAgent:
          "Analisis positionsForLessons: cari pola kenapa 'loss' terjadi (durasi terlalu pendek/panjang? " +
          "binCount tertentu lebih sering rugi? strategyType tertentu lebih baik?) dan kenapa 'win' terjadi. " +
          "Setelah dapat 1-3 insight konkret, kirim via: node scripts/notify_telegram.js lessons \"<insight>\"",
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error("Daily review gagal:", err.message);
  process.exit(1);
});
