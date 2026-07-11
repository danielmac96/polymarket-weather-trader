# polymarket-weather-app

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/danielmac96/polymarket-weather-trader)

Live US weather markets from Polymarket with model-vs-market edge detection and paper trading. MVP scope: WebSocket-fed prices (sub-5s), automated paper-trade execution on edge signals, live PnL/portfolio tracking. **Paper trading only — `LIVE_TRADING_ENABLED=false` is permanent for this MVP.**

## Current strategy: one highest-temp market

The system runs in **focus mode** by default: it tracks only the daily **"Highest temperature in NYC"** market — one Polymarket event made of mutually exclusive temperature buckets (`84°F or below`, `85°F`, `86-87°F`, `88°F or higher`, …).

How it trades:

1. **Forecast** — NOAA and Open-Meteo daily-max temperature forecasts for the target day are collected continuously (`daily_forecasts` table).
2. **Model** — the daily high is modeled as Normal(provider consensus, σ), with σ widening for provider disagreement and lead time, and a ±0.5°F correction because buckets resolve on rounded whole degrees. Each bucket gets a model probability.
3. **Edge** — model probability vs live market price (WebSocket midpoint). Beyond the risk profile's edge threshold with adequate volume, liquidity, and confidence, the decision is TRADE.
4. **Size for growth** — fractional Kelly on current equity, quantized to whole multiples of your unit size and clamped by the risk profile's per-position and total-exposure caps. Winners compound the bankroll; sizing scales automatically as equity grows.

The dashboard's top panel shows the focused market's full bucket ladder: market price vs model probability vs edge, plus the provider forecasts feeding it. `FOCUS_ENABLED=false` reverts to tracking all US weather markets.

## Hands-off trading: unit size + risk tolerance

You configure exactly two things on the dashboard's **Settings** page (stored in the `trading_settings` table, picked up by the analyzer on its next cycle — no restart):

- **Unit size (USD)** — your base bet. Every position is a whole number of units; the engine floors the Kelly stake to units so it never over-bets the model.
- **Risk tolerance** — LOW / MEDIUM / HIGH. Each maps to a risk profile:

| Profile | Kelly fraction | Min edge | Max/position | Max exposure | Max units/trade | Min confidence |
| ------- | -------------- | -------- | ------------ | ------------ | --------------- | -------------- |
| LOW     | 0.15           | 8%       | 5% equity    | 30% equity   | 2               | 55%            |
| MEDIUM  | 0.25           | 5%       | 10% equity   | 60% equity   | 5               | 40%            |
| HIGH    | 0.50           | 4%       | 20% equity   | 80% equity   | 10              | 30%            |

The Settings page also has an **auto trading** toggle (the `AUTO_PAPER_TRADE` env var remains a hard kill switch on top of it).

## Demo mode (no network / no market hours)

```bash
pnpm db:seed:demo
```

Seeds a synthetic mispriced "Highest temperature in NYC" bucket ladder for tomorrow plus provider forecasts (all market ids prefixed `demo-`), so the full loop — analyzer → auto paper trades → portfolio → dashboard — runs without reaching NOAA/Open-Meteo/Polymarket. Re-running wipes and re-creates the demo rows. Useful for testing in restricted-network environments; live data requires outbound access to `api.weather.gov`, `api.open-meteo.com`, `gamma-api.polymarket.com`, `clob.polymarket.com`, and `wss://ws-subscriptions-clob.polymarket.com`.

## Troubleshooting

```bash
pnpm doctor
```

Checks every pipeline stage in dependency order (DB → migrations → collector → discovery → prices → analyzer → portfolio) and prints a fix hint at the first broken stage. See [docs/RUNBOOK.md](./docs/RUNBOOK.md) for deeper digging.

## Stack

- pnpm workspaces, Node 20 LTS, TypeScript 5 strict
- PostgreSQL 16 + Drizzle ORM
- Next.js 14 App Router + Tailwind
- `ws` for Polymarket WebSocket, `zod` validation, `pino` logs, `node-cron` schedules

## Daily workflow

```
1. Make changes in Claude Code on phone → push to GitHub
2. Open Codespace in browser tab
3. In terminal: bash scripts/update.sh
4. Refresh app preview tab (port 3000)
```

Keep two browser tabs open: the **Codespace terminal** and the **app preview URL**.

## First-time setup

Opening a fresh Codespace auto-runs `postCreateCommand` (install, start Postgres, migrate, seed) and `postStartCommand` (`pnpm dev:all` → port 3000).

If you need to start manually:

```bash
pnpm install
docker compose -f infra/docker/docker-compose.yml up -d postgres
pnpm db:migrate
pnpm db:seed
pnpm dev:all
```

## Required GitHub Codespaces secrets

Set at: repo Settings → Secrets and variables → Codespaces.

| Secret                          | Required | Notes                                                              |
| ------------------------------- | -------- | ------------------------------------------------------------------ |
| `NOAA_USER_AGENT`               | Yes      | `app-name/version (email)` — NOAA requires identification          |
| `MAX_PAPER_POSITION_USD`        | No       | Absolute per-position backstop, default `100`                      |
| `PAPER_STARTING_BANKROLL_USD`   | No       | Override default `1000`                                            |
| `AUTO_PAPER_TRADE`              | No       | Hard kill switch, default `true`                                   |

Unit size, risk tolerance, and the auto-trading toggle are configured on the dashboard's **Settings** page, not via secrets.

No Polymarket credentials — Gamma REST and CLOB WebSocket are unauthenticated.

## Environment variables

See [.env.example](./.env.example). Required: `DATABASE_URL`, `LOG_LEVEL`, `NOAA_USER_AGENT`.

## Repository layout

```
apps/web/                # Next.js dashboard
packages/
  shared/                # Config, types, logger, db client
  collector/             # NOAA + Open-Meteo weather ingestion
  live-feed/             # Polymarket WebSocket + market discovery
  analyzer/              # Edge calc + auto paper-trade creation
  portfolio/             # PnL calc, snapshots, auto-resolution
infra/
  db/                    # Drizzle schema + migrations
  docker/                # docker-compose.yml (postgres)
scripts/update.sh
```

## Scripts

| Script                 | Purpose                                          |
| ---------------------- | ------------------------------------------------ |
| `pnpm dev:all`         | Start web + collector + live-feed + analyzer + portfolio |
| `pnpm doctor`          | Check every pipeline stage, print fix hints      |
| `pnpm build`           | Build all packages                               |
| `pnpm typecheck`       | TypeScript across all packages                   |
| `pnpm lint`            | ESLint                                           |
| `pnpm test`            | Run all package tests                            |
| `pnpm db:migrate`      | Apply pending migrations                         |
| `pnpm db:seed`         | Seed US locations                                |
| `pnpm db:seed:demo`    | Seed synthetic focus market for offline testing  |
| `pnpm db:generate`     | Generate new migration from schema diff          |
| `pnpm db:studio`       | Open Drizzle Studio                              |
| `bash scripts/update.sh` | Pull, install, migrate, restart services       |

See [docs/RUNBOOK.md](./docs/RUNBOOK.md) (created in Phase 8) for operations.
