/**
 * run_screening_cycle.js
 * Satu siklus penuh: screening -> evaluate entry -> create position (kalau signal & slot tersedia) -> notify.
 * Didesain dipanggil 1x per trigger cron (misal tiap 30 menit), logic-nya fixed (bukan LLM decide urutan).
 *
 * Cara kerja: shell-out ke script lain, parse JSON stdout masing-masing — konsisten dengan arsitektur
 * skill ini (tiap script self-contained & bisa dites satu-satu).
 *
 * Usage: node run_screening_cycle.js
 */
require("dotenv").config();
const path = require("path");
const fs = require("fs");
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
  const log = { startedAt: new Date().toISOString(), candidatesFound: 0, entriesOpened: 0, errors: [] };

  // 1. Screening
  let candidates = [];
  try {
    candidates = await runScript("screen_pools.js");
    log.candidatesFound = candidates.length;
  } catch (err) {
    log.errors.push(`screening: ${err.message}`);
    await notify("risk_alert", `⚠️ Screening cycle gagal: ${err.message}`);
    console.log(JSON.stringify(log, null, 2));
    return;
  }

  if (candidates.length === 0) {
    await notify("screening", "🔍 Screening cycle selesai — tidak ada kandidat yang lolos filter kali ini.");
    console.log(JSON.stringify(log, null, 2));
    return;
  }

  await notify(
    "screening",
    `🔍 Screening cycle: ${candidates.length} kandidat lolos filter awal.\n` +
      candidates
        .slice(0, 10)
        .map((c) => `• ${c.token?.address || c.token?.symbol || "unknown"}`)
        .join("\n")
  );

  // 2. Cek slot tersedia sebelum evaluasi entry lebih lanjut
  let portfolio;
  try {
    portfolio = await runScript("check_portfolio.js");
  } catch (err) {
    log.errors.push(`check_portfolio: ${err.message}`);
    await notify("risk_alert", `⚠️ Gagal cek portfolio, screening cycle dihentikan: ${err.message}`);
    console.log(JSON.stringify(log, null, 2));
    return;
  }

  if (portfolio.slotsAvailable <= 0) {
    await notify(
      "screening",
      `⏸️ Slot posisi penuh (${portfolio.activePositionsCount}/${portfolio.maxPositions}), skip entry cycle ini.`
    );
    console.log(JSON.stringify({ ...log, skippedReason: "no_slots" }, null, 2));
    return;
  }

  const riskLimitsPath = path.join(SCRIPTS_DIR, "..", "config", "risk_limits.json");
  const riskLimits = JSON.parse(fs.readFileSync(riskLimitsPath, "utf-8"));
  const solPerPosition =
    riskLimits.max_sol_per_position || portfolio.solBalance / riskLimits.max_positions;

  // 3. Evaluate entry untuk tiap kandidat, sampai slot habis
  let slotsLeft = portfolio.slotsAvailable;
  for (const candidate of candidates) {
    if (slotsLeft <= 0) break;
    const tokenMint = candidate.token?.address;
    const poolAddress = candidate.poolDetail?.address || candidate.poolDetail?.pool_address;
    if (!tokenMint || !poolAddress) continue;

    try {
      const entryEval = await runScript("evaluate_entry.js", [tokenMint, poolAddress]);
      if (!entryEval.entrySignal) continue;

      const createResult = await runScript("create_position.js", [
        poolAddress,
        tokenMint,
        String(solPerPosition),
      ]);

      slotsLeft--;
      log.entriesOpened++;
      await notify(
        "order_alert",
        `📢 Posisi baru dibuka!\nToken: ${tokenMint}\nPool: ${poolAddress}\n` +
          `SOL: ${solPerPosition.toFixed(4)}\nDrawdown: ${entryEval.drawdownPct}%\n` +
          `Tx: ${createResult.signature}`
      );
    } catch (err) {
      log.errors.push(`${tokenMint}: ${err.message}`);
      // Kill-switch / risk-limit block dianggap risk_alert, bukan error biasa
      if (err.message.includes("Blocked oleh")) {
        await notify("risk_alert", `⚠️ ${err.message}`);
        break; // stop loop, risk limit berlaku global bukan per-token
      }
    }
  }

  console.log(JSON.stringify(log, null, 2));
}

main().catch((err) => {
  console.error("Screening cycle gagal total:", err.message);
  process.exit(1);
});
