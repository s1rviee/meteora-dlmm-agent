# 🌙 Meteora DLMM Agent

> Autonomous liquidity-providing agent for **Meteora DLMM** pools on Solana — runs on [Hermes Agent](https://github.com/NousResearch/hermes-agent), screens tokens via GMGN, executes one-sided SOL positions through the Meteora SDK, and reports everything to a structured Telegram Supergroup.

[![License: PolyForm-Noncommercial-1.0.0](https://img.shields.io/badge/License-PolyForm--Noncommercial--1.0.0-blue.svg)](./LICENSE)
[![Built for Hermes Agent](https://img.shields.io/badge/Built%20for-Hermes%20Agent-8657e5)](https://github.com/NousResearch/hermes-agent)
[![Chain](https://img.shields.io/badge/Chain-Solana-14F195)](https://solana.com)

---

## 📖 About

**Meteora DLMM Agent** is a [Hermes Agent](https://github.com/NousResearch/hermes-agent) skill that automates liquidity provisioning on [Meteora's DLMM](https://www.meteora.ag/) pools using a **dump-and-bounce fee-capture strategy** — adapted from the "Evil Panda Strat" (Advanced Bootcamp #7): open a wide one-sided SOL position while a token is dumping to capture trading fees, then close the position on the first confirmed bounce.

The agent's data-flow architecture (screening → SDK-built transactions → RPC broadcast → on-chain execution) was inspired by [**Meridian**](https://github.com/yunus-0x/meridian), another open-source Meteora DLMM LP agent — this project adapts that separation-of-concerns pattern but swaps its data sources (GMGN instead of Jupiter) and its entry/exit logic for the dump-and-bounce strategy described below.

Instead of relying on chart indicators (Supertrend, RSI, MACD, Bollinger Bands), this agent uses **price drawdown/bounce percentages combined with on-chain buy/sell pressure ratios** (via GMGN) as entry/exit triggers — no candle-pattern calculation required.

The agent runs unattended via Hermes' built-in cron scheduler, with full risk management (position limits, kill-switch on consecutive losses, trading-hour cutoff) and reports every action to a dedicated Telegram Supergroup with topics.

---

## ✨ Features

- 🔍 **Pool screening** — combines GMGN security filters (fee, phishing/bundling/insider ratio, top-10 holder concentration) with Meteora DLMM pool metrics (fee/TVL, volume, APR)
- 📊 **Portfolio & position tracking** — persistent local state (`position_history.json`), no reliance on volatile agent memory
- 🎯 **Deterministic entry/exit signals** — drawdown % + GMGN buy/sell ratio for entry, bounce % + buy pressure confirmation for exit
- 💧 **Full position lifecycle** — create one-sided SOL positions, claim fees, remove liquidity, all via the official `@meteora-ag/dlmm` SDK
- 🛡️ **Built-in risk management** — max concurrent positions, no-new-position trading-hour cutoff, consecutive-loss kill-switch with cooldown
- 📱 **Structured Telegram reporting** — separate topics for screening, order alerts, trade history, risk alerts, daily summaries, and AI-generated lessons-learned
- ⏱️ **Cron-ready** — two deterministic cycle scripts (`run_screening_cycle.js`, `run_position_cycle.js`) designed to be called directly by Hermes cron, no multi-step LLM reasoning required per tick

---

## 🏗️ Architecture

```
┌─────────────┐     ┌──────────────────────┐     ┌─────────────┐     ┌──────────────┐
│    GMGN     │────▶│  Screening & Signal   │────▶│ @meteora-ag/ │────▶│   Helius     │
│ (gmgn-cli)  │     │  Evaluation (drawdown │     │ dlmm SDK     │     │   RPC        │
│             │     │  / bounce / ratio)    │     │ (build tx)   │     │ (sign+send)  │
└─────────────┘     └──────────────────────┘     └─────────────┘     └──────┬───────┘
                                                                              │
                                                                              ▼
                                                                     ┌─────────────────┐
                                                                     │  Meteora DLMM    │
                                                                     │  Program (Solana)│
                                                                     └─────────────────┘
```

- **GMGN** — pure off-chain data source (screening, security score, kline, buy/sell ratio). Never touches your wallet.
- **@meteora-ag/dlmm SDK** — builds the on-chain instructions (create/claim/remove).
- **Helius RPC** — signs and broadcasts transactions to the Solana network; also reads on-chain state (balances, positions).
- **Meteora DLMM program** — where the actual liquidity position lives on-chain.

---

## 📋 Prerequisites

| Requirement | Notes |
|---|---|
| [Hermes Agent](https://github.com/NousResearch/hermes-agent) | Self-hosted agent runtime — see install below |
| Node.js ≥ 18 | For skill scripts |
| [gmgn-cli](https://github.com/GMGNAI/gmgn-skills) | Token screening & market data — **all GMGN access goes through this CLI, never direct HTTP calls** |
| Helius account | RPC provider — [dashboard.helius.dev](https://dashboard.helius.dev) |
| Dedicated Solana hot wallet | **Do not use your main wallet.** This agent auto-signs and submits transactions. |
| Telegram Bot + Supergroup with Topics enabled | For structured reporting |

---

## 🚀 Installation

### 1. Install Hermes Agent

```bash
# Linux / macOS / WSL2 / Termux
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash

# Windows (PowerShell)
iex (irm https://hermes-agent.nousresearch.com/install.ps1)
```

Reload your shell and run the setup wizard:

```bash
source ~/.bashrc      # or ~/.zshrc
hermes setup          # configures your LLM provider, model, etc.
```

Full Hermes docs: [hermes-agent.nousresearch.com/docs](https://hermes-agent.nousresearch.com/docs/)

### 2. Install gmgn-cli

```bash
npm install -g gmgn-cli
gmgn-cli auth setup   # follow the prompts to register your API key at gmgn.ai/ai
```

> ⚠️ Do this step yourself. Do not let any AI agent auto-generate keypairs or write credentials to disk on your behalf without reviewing what it's doing first.

### 3. Install this skill

```bash
# Clone this repo
git clone https://github.com/S1rvie/meteora-dlmm-agent.git

# Copy into Hermes' skills directory
cp -r meteora-dlmm-agent ~/.hermes/skills/meteora-dlmm-agent

cd ~/.hermes/skills/meteora-dlmm-agent
npm install
```

### 4. Configure environment

```bash
cp assets/.env.example .env
nano .env
```

Fill in:
- `HELIUS_RPC_URL` — [dashboard.helius.dev](https://dashboard.helius.dev) (API key is already embedded in the URL)
- `WALLET_PRIVATE_KEY` — **dedicated hot wallet only**, base58 format
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` — from [@BotFather](https://t.me/BotFather) and your supergroup

> `GMGN_API_KEY` is **not** set here — `gmgn-cli` reads its own auth from `~/.config/gmgn/.env` (global CLI config, set up in step 2), separate from this skill's `.env`.

### 5. Configure risk limits

```bash
mkdir -p config
cp assets/risk_limits.example.json config/risk_limits.json
cp assets/position_history.example.json config/position_history.json
cp assets/telegram_topics.example.json config/telegram_topics.json
```

Edit `config/risk_limits.json` to match your portfolio size — see [`references/risk_management.md`](./references/risk_management.md) for what each field does.

### 6. Set up Telegram Supergroup Topics

This skill reports to a Telegram Supergroup with 7 dedicated topics: `General`, `Screening`, `Order Alert`, `History Trade`, `Risk Alert`, `Daily Summary`, `Lessons`.

Use the setup prompt in [`docs/telegram-topic-setup-prompt.md`](./docs/telegram-topic-setup-prompt.md) — feed it to Hermes once to create the group structure and record each topic's `message_thread_id` into `config/telegram_topics.json`.

### 7. Register the skill & set up cron jobs

Restart Hermes so it picks up the new skill:

```bash
hermes restart
```

Verify it's detected:

```bash
hermes chat -q "What skills do you have?"
# should list "meteora-dlmm-agent"
```

Create the three scheduled jobs:

```bash
# Screening cycle — every 30 minutes
hermes cron create "every 30m" \
  "Run: node scripts/run_screening_cycle.js" \
  --workdir ~/.hermes/skills/meteora-dlmm-agent \
  --skill meteora-dlmm-agent \
  --deliver local \
  --name "Meteora Screening Cycle"

# Position management cycle — every 10 minutes
hermes cron create "every 10m" \
  "Run: node scripts/run_position_cycle.js" \
  --workdir ~/.hermes/skills/meteora-dlmm-agent \
  --skill meteora-dlmm-agent \
  --deliver local \
  --name "Meteora Position Cycle"

# Daily review — once a day at 00:05
hermes cron create "5 0 * * *" \
  "Run: node scripts/run_daily_review.js. Read the positionsForLessons field from its output, follow instructionsForAgent to analyze win/loss patterns, then send the insight via: node scripts/notify_telegram.js lessons \"<insight>\"" \
  --workdir ~/.hermes/skills/meteora-dlmm-agent \
  --skill meteora-dlmm-agent \
  --deliver local \
  --name "Meteora Daily Review"
```

> `--deliver local` is used because this skill sends its own Telegram notifications per-topic via `notify_telegram.js` — it doesn't rely on Hermes' cron delivery wrapper for the actual trading alerts.

Manage jobs any time with `hermes cron list`, `hermes cron pause <name>`, `hermes cron edit <name> ...`, or `hermes cron remove <name>`.

---

## 🧪 Verify installation

```bash
cd ~/.hermes/skills/meteora-dlmm-agent

node scripts/check_portfolio.js      # should print wallet balance + 0 open positions
node scripts/screen_pools.js         # should print an array of candidate pools (or [])
node scripts/notify_telegram.js general "✅ Meteora DLMM Agent is online"
```

---

## 📂 Repository Structure

```
meteora-dlmm-agent/
├── SKILL.md                     # Main skill instructions (Hermes entry point)
├── scripts/
│   ├── run_screening_cycle.js   # Cron A — screening → entry → create position
│   ├── run_position_cycle.js    # Cron B — check positions → exit → close position
│   ├── run_daily_review.js      # Cron C — daily summary + lessons data prep
│   ├── screen_pools.js
│   ├── check_portfolio.js
│   ├── get_pool_detail.js
│   ├── evaluate_entry.js
│   ├── evaluate_exit.js
│   ├── create_position.js
│   ├── close_position.js
│   └── notify_telegram.js
├── references/                  # Strategy, risk, API, SDK, Telegram docs
├── assets/                      # .env / config templates
└── docs/
    └── telegram-topic-setup-prompt.md
```

---

## ⚠️ Risk Disclaimer

This is experimental software that **automatically signs and submits on-chain transactions** with real funds. Memecoin liquidity provisioning carries substantial risk of total capital loss (rug pulls, impermanent loss, smart contract risk).

- Use a **dedicated wallet with only capital you can afford to lose**.
- The strategy implemented here is a heuristic proxy, not a guarantee of profitability.
- This project is provided as-is, for educational and research purposes. Not financial advice.

---

## 🙏 Credits

- Strategy adapted from **"Evil Panda Strat"** — Advanced Bootcamp #7
- [Meteora](https://www.meteora.ag/) — DLMM protocol & SDK
- [GMGN](https://gmgn.ai/) — token screening & market data (`gmgn-cli`)
- [Helius](https://helius.dev) — Solana RPC infrastructure
- [Nous Research](https://nousresearch.com) — [Hermes Agent](https://github.com/NousResearch/hermes-agent) runtime
- [**Meridian**](https://github.com/yunus-0x/meridian) by yunus-0x — architectural inspiration for the screening → SDK → RPC → on-chain execution flow

---

## 📄 License

**[PolyForm Noncommercial License 1.0.0](./LICENSE)**

You're free to use, modify, and share this project for any **noncommercial purpose** — personal use, research, learning, hobby projects, or use by educational/nonprofit organizations. **Commercial use — including selling, reselling, or offering this software (or a derivative of it) as part of a paid product or service — is not permitted** under this license.

If you want to use this commercially, reach out first.

---

## 👤 Author

Built by **[S1rvie](https://github.com/s1rviee)**

💬 Discord: [Meteora Indonesia](https://discord.gg/meteoraidn)
