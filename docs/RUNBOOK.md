# Runbook

Operational guide for `polymarket-weather-app`. Assumes you're inside a GitHub Codespace with Postgres running via `infra/docker/docker-compose.yml`.

---

## First stop: `pnpm doctor`

One command that checks every pipeline stage in order (DB → migrations → seed → collector → discovery → prices → analyzer → portfolio → trades) and prints a pass/fail line with a fix hint for each:

```
$ pnpm doctor
✓ database connection — PostgreSQL 16.4
✓ migrations applied — all expected tables present
✓ locations seeded — 10 locations
✓ collector: daily-max forecasts — 24 rows, newest 12min ago
✗ live-feed: price ticks — stale: newest row is 47min old (rows=1043)
  hint: WebSocket down or no trading activity. Check live-feed logs.
...
```

The first ✗ in the list is almost always the actual problem — every later stage depends on the ones above it.

---

## Focus mode (current strategy scope)

The system targets **one market family**: the daily "Highest temperature in NYC" market on Polymarket (a ladder of mutually exclusive temperature buckets — `84°F or below`, `85°F`, `86-87°F`, `88°F or higher`, …).

| Env var | Default | Meaning |
| --- | --- | --- |
| `FOCUS_ENABLED` | `true` | Restrict discovery to the focus family. `false` = all US weather markets. |
| `FOCUS_QUERY` | `highest temperature` | Substring the question must contain. |
| `FOCUS_LOCATION` | `NYC` | Location filter (`NYC` also matches "New York"). |

To switch city: set `FOCUS_LOCATION=Chicago` (any seeded city) and restart. Discovery automatically closes markets that no longer match.

### How the strategy works

1. **Collector** stores each provider's forecast **daily-max** temperature per local calendar day (`daily_forecasts`).
2. **Analyzer** parses each bucket (`≤84`, `85`, `86-87`, `≥88`), models Tmax as Normal(provider mean, σ) where σ grows with lead time, applies a ±0.5° rounding correction, and compares model probability vs the market price.
3. **Decision gate**: edge > `EDGE_THRESHOLD`, volume/liquidity floors, confidence > 0.4 (confidence comes from provider agreement and count).
4. **Sizing**: fractional Kelly (`KELLY_FRACTION`, default 0.25 = quarter-Kelly) on current equity, clamped by `MAX_POSITION_PCT` (10% per position), `MAX_TOTAL_EXPOSURE_PCT` (60% total open), and `MAX_PAPER_POSITION_USD`.

### Strategy data to watch

```sql
-- Today's ladder: model vs market per bucket
SELECT m.question, a.implied_prob, a.model_prob, a.edge, a.confidence, a.decision
FROM market_analysis a
JOIN polymarket_markets m ON m.id = a.market_id
WHERE m.status = 'ACTIVE'
  AND a.analyzed_at > now() - interval '15 minutes'
ORDER BY m.parsed_threshold;

-- Daily-max forecasts feeding the model
SELECT provider, target_date, temp_max_f, forecasted_at
FROM daily_forecasts
ORDER BY forecasted_at DESC LIMIT 10;
```

---

## Daily loop

```
1. Edit code in Claude Code on phone → push to GitHub
2. Open Codespace browser tab → terminal
3. bash scripts/update.sh
4. Refresh app preview tab (port 3000)
```

Keep two browser tabs open: **Codespace terminal** and **app preview URL**.

`scripts/update.sh` runs:
- `git pull`
- `pnpm install`
- `pnpm db:migrate`
- kills any running `node-cron` / `next dev` / `tsx watch`
- restarts `pnpm dev:all` and logs to `/tmp/app.log`

---

## Starting / stopping everything

| Action | Command |
| --- | --- |
| Start full stack (web + collector + live-feed + analyzer + portfolio) | `pnpm dev:all` |
| Background restart (logs to `/tmp/app.log`) | `bash scripts/update.sh` |
| Tail logs | `tail -f /tmp/app.log` |
| Kill all background services | `pkill -f "node-cron\|next dev\|tsx watch"` |
| Bring up Postgres only | `docker compose -f infra/docker/docker-compose.yml up -d postgres` |
| Open Drizzle Studio | `pnpm db:studio` |

---

## Inspecting live data

```bash
psql $DATABASE_URL    # default: postgresql://pwa:pwa@localhost:5432/pwa
```

### Recent prices (sub-5s freshness check)

```sql
SELECT m.question, p.side, p.midpoint, p.at
FROM market_prices p
JOIN polymarket_markets m ON m.id = p.market_id
ORDER BY p.at DESC
LIMIT 20;
```

### Markets with the strongest edge right now

```sql
SELECT m.question, a.implied_prob, a.model_prob, a.edge, a.decision, a.analyzed_at
FROM market_analysis a
JOIN polymarket_markets m ON m.id = a.market_id
WHERE m.status = 'ACTIVE'
ORDER BY a.analyzed_at DESC
LIMIT 50;
```

### Open paper trades with unrealized PnL (rough — uses latest YES midpoint)

```sql
SELECT
  m.question,
  pt.side,
  pt.entry_price,
  pt.shares_qty,
  (SELECT midpoint FROM market_prices
     WHERE market_id = pt.market_id AND side = 'YES'
     ORDER BY at DESC LIMIT 1) AS yes_mid,
  pt.size_usd
FROM paper_trades pt
JOIN polymarket_markets m ON m.id = pt.market_id
WHERE pt.status = 'OPEN';
```

### Portfolio progression

```sql
SELECT at, total_equity_usd, roi_pct, win_rate_pct, open_positions_count
FROM portfolio_snapshots
ORDER BY at DESC
LIMIT 30;
```

### Forecast freshness per provider

```sql
SELECT provider, MAX(forecasted_at) AS latest, COUNT(*) AS rows
FROM weather_forecasts
GROUP BY provider;
```

---

## Reset bankroll

Wipes paper trades, analyses, and portfolio snapshots. Markets and price history stay.

```sql
TRUNCATE paper_trades, market_analysis, portfolio_snapshots CASCADE;
```

After reset, the portfolio snapshot writer (every 5 minutes) recreates the starting baseline at `PAPER_STARTING_BANKROLL_USD`.

To also wipe market/price history:

```sql
TRUNCATE market_prices, polymarket_markets CASCADE;
```

---

## Resubscribe WebSocket

If the live feed seems stuck (footer says `ws Xm ago` and not advancing), the in-process exponential reconnect plus 60s silence health check should recover automatically. To force it:

```bash
pkill -f "tsx.*live-feed" || true
# dev:all will not auto-restart; either:
bash scripts/update.sh        # restart everything
# or only the feed:
pnpm --filter @pwa/live-feed start &
```

To verify recovery:

```sql
SELECT MAX(at) FROM market_prices;
-- expect a fresh timestamp within seconds
```

---

## Tuning thresholds

All knobs read from env vars at process start. To change them in Codespaces:
1. **Settings → Secrets and variables → Codespaces**
2. Update `EDGE_THRESHOLD`, `KELLY_FRACTION`, `MAX_POSITION_PCT`, `MAX_TOTAL_EXPOSURE_PCT`, `MAX_PAPER_POSITION_USD`, `PAPER_STARTING_BANKROLL_USD`, `AUTO_PAPER_TRADE`, `MIN_MARKET_VOLUME_USD`, `MIN_MARKET_LIQUIDITY_USD`, `FOCUS_ENABLED`, `FOCUS_QUERY`, `FOCUS_LOCATION`
3. Restart: `bash scripts/update.sh`

`LIVE_TRADING_ENABLED` is hard-coded false for this MVP. The shared config refuses to start if it's true.

---

## Adding a new region

1. Insert seed locations in `infra/db/src/seed.ts` (e.g. UK cities with lat/lng).
2. Add a parser file `packages/analyzer/src/parsers/ukParser.ts` implementing `MarketParser`. Mirror the US parser's structure (city list, condition regex, threshold extractor).
3. Wire the parser in `packages/analyzer/src/runner.ts` by region (currently the runner uses `usParser` directly; you'd add a `byRegion: Record<Region, MarketParser>` lookup and dispatch in `backfillParse`).
4. Update `packages/live-feed/src/filters.ts` to accept the new region's location keywords.
5. Add the region to `ACTIVE_PROVIDERS` regions in `packages/collector/src/registry.ts` for whatever weather sources cover it.
6. Run `pnpm db:seed` to insert the new locations, then `bash scripts/update.sh`.

---

## Adding a new weather provider

1. Create `packages/collector/src/providers/<name>.ts` exporting a `WeatherProvider` (interface from `@pwa/shared/adapters`). Implement `name` and `fetch(location): Promise<Forecast>`, using `fetchJson` for the HTTP call plus a Zod schema for the response.
2. Add one entry to `ACTIVE_PROVIDERS` in `packages/collector/src/registry.ts`:
   ```ts
   { provider: yourProvider, regions: ['US', 'UK'] },
   ```
3. `bash scripts/update.sh`. The collector picks it up on the next cron tick (or immediate startup run).
4. Sanity-check: `SELECT provider, COUNT(*) FROM weather_forecasts GROUP BY provider;` should show your new provider.

Adding a provider does not require touching the analyzer — the edge model averages whatever providers report for the location, so more providers = better ensemble (lower per-provider stdev = higher confidence).

---

## Useful one-liners

```bash
# What just got inserted? Tail prices for one market in real time.
watch -n 1 "PGPASSWORD=pwa psql -h localhost -U pwa -d pwa -c \"SELECT side, midpoint, at FROM market_prices WHERE market_id = '<uuid>' ORDER BY at DESC LIMIT 5\""

# Force one collector pass:
pnpm --filter @pwa/collector start --once

# Force one analyzer pass:
pnpm --filter @pwa/analyzer start --once

# Force one resolver + snapshot pass:
pnpm --filter @pwa/portfolio start --once
```

---

## Troubleshooting

Run `pnpm doctor` first — it pinpoints the broken stage. Then:

| Symptom | First thing to check |
| --- | --- |
| Dashboard 500 | `tail -50 /tmp/app.log` — usually a DB env var or migration drift. Run `pnpm db:migrate`. |
| Focus panel says "no daily-max forecasts" | Collector hasn't run or weather APIs blocked. `pnpm --filter @pwa/collector start` and check logs. |
| No focus markets discovered | Polymarket may not have today's market up yet, or `FOCUS_QUERY`/`FOCUS_LOCATION` don't match the question wording. Set `FOCUS_ENABLED=false` temporarily and inspect what discovery finds. |
| Trades skipped with "kelly sizing declined" | Working as intended: model edge at the entry price isn't positive, or exposure caps are full. |
| Empty dashboard, no active markets | Did the live-feed start? `pnpm --filter @pwa/live-feed start &` and watch logs. |
| Trades not auto-opening | `AUTO_PAPER_TRADE=true`? Check edge threshold isn't set too high. |
| Footer pill stays red | The WebSocket can't reach Polymarket — check egress in your network policy. |
| `LIVE_TRADING_ENABLED must remain false` on startup | The MVP refuses to start with that flag set. Unset it. |
