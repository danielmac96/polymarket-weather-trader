# TODO / roadmap

## Blocked on tools or access not available in the build session

- [ ] **Live (real-money) trading via Polymarket CLOB** — requires a Polymarket
      API key/wallet, an authenticated order-signing client (`@polymarket/clob-client`),
      and an explicit user opt-in flow. `LIVE_TRADING_ENABLED` stays hard-blocked
      until sizing has a verified paper track record. No Polymarket MCP server
      was available in the build session.
- [ ] **Unrestricted network policy for cloud dev sessions** — the Claude Code
      cloud sandbox denied `api.weather.gov`, `api.open-meteo.com`,
      `gamma-api.polymarket.com`, and `clob.polymarket.com` (proxy 403). Add these
      domains to the environment's network allowlist so live data flows during
      remote sessions; until then use `pnpm db:seed:demo`.
- [ ] **Hosted deployment** — Supabase (managed Postgres) + Vercel (dashboard)
      MCP tools are available but the pipeline services (collector/live-feed/
      analyzer/portfolio) are long-running Node processes that need a worker
      host (Railway/Fly/VPS). Deferred until the user wants an always-on
      deployment instead of Codespaces.

## Model / strategy improvements

- [ ] Add Met Office / more forecast providers to the daily-max consensus
      (provider file exists at `packages/collector/src/providers/metoffice.ts`).
- [ ] Calibrate σ (forecast error by lead time) against resolved market history
      instead of the fixed 0.9 + 0.45/day heuristic.
- [ ] Track model calibration (Brier score) per bucket type on resolved trades
      and surface it on the Portfolio page.
- [ ] Optional per-city expansion beyond NYC once the focus market is proven.

## App improvements

- [ ] Show unit count and risk profile on each open position row.
- [ ] Equity curve chart on the Portfolio page (snapshots table already has the data).
- [ ] Push/email notification on auto-trade open and resolution.
