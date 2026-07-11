/**
 * run_position_cycle.js
 * Satu siklus penuh: cek portfolio -> evaluate exit tiap posisi -> close position (kalau signal) -> notify.
 * Didesain dipanggil 1x per trigger cron (misal tiap 10 menit), logic-nya fixed.
 *
 * Usage: node run_position_cycle.js
 */
require("dotenv").config();
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
  } catch (err) {
    console.error(`Gagal notify ke topic "${topicKey}":`, err.message);
  }
}

async function main() {
  const log = { startedAt: new Date().toISOString(), positionsChecked: 0, positionsClosed: 0, errors: [] };

  let portfolio;
  try {
    portfolio = await runScript("check_portfolio.js");
  } catch (err) {
    log.errors.push(`check_portfolio: ${err.message}`);
    await notify("risk_alert", `⚠️ Position cycle gagal cek portfolio: ${err.message}`);
    console.log(JSON.stringify(log, null, 2));
    return;
  }

  const openPositions = portfolio.openPositions || [];
  log.positionsChecked = openPositions.length;

  if (openPositions.length === 0) {
    console.log(JSON.stringify(log, null, 2)); // tidak perlu notify kalau memang tidak ada posisi
    return;
  }

  for (const entry of openPositions) {
    const { positionAddress, poolAddress, tokenMint } = entry;
    try {
      const exitEval = await runScript("evaluate_exit.js", [positionAddress]);

      if (!exitEval.exitSignal) continue; // masih dipantau, belum exit — tidak spam notif

      const closeResult = await runScript("close_position.js", [poolAddress, positionAddress]);

      log.positionsClosed++;
      const pnl = closeResult.pnlSol;
      const pnlEmoji = pnl > 0 ? "✅" : pnl < 0 ? "🔴" : "➖";
      await notify(
        "history_trade",
        `${pnlEmoji} Posisi ditutup!\nToken: ${tokenMint}\nPool: ${poolAddress}\n` +
          `Bounce: ${exitEval.bouncePct}%\nPnL: ${pnl !== null ? pnl.toFixed(4) + " SOL" : "N/A"}\n` +
          `Tx: ${closeResult.signatures?.join(", ")}`
      );

      if (pnl !== null && pnl < 0) {
        // Cek apakah kill-switch baru saja aktif (informasional, enforcement sebenarnya ada di create_position.js)
        await notify("risk_alert", `📉 Posisi ${tokenMint} ditutup dengan loss: ${pnl.toFixed(4)} SOL.`);
      }
    } catch (err) {
      log.errors.push(`${positionAddress}: ${err.message}`);
      await notify("risk_alert", `⚠️ Gagal proses posisi ${positionAddress}: ${err.message}`);
    }
  }

  console.log(JSON.stringify(log, null, 2));
}

main().catch((err) => {
  console.error("Position cycle gagal total:", err.message);
  process.exit(1);
});
