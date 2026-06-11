import pg from 'pg';

/**
 * Local troubleshooting: one command that tells you which part of the
 * pipeline is broken. Run with `pnpm doctor` from the repo root.
 *
 * Pipeline order (each stage feeds the next):
 *   collector → daily_forecasts        (model input)
 *   live-feed → polymarket_markets     (discovery)
 *   live-feed → market_prices          (websocket ticks)
 *   analyzer  → market_analysis        (edge + decisions)
 *   analyzer  → paper_trades           (auto trades)
 *   portfolio → portfolio_snapshots    (equity tracking)
 */

interface Check {
  name: string;
  hint: string;
  run(client: pg.Client): Promise<string>;
}

function ageMinutes(ts: Date | null): number | null {
  if (!ts) return null;
  return Math.round((Date.now() - ts.getTime()) / 60_000);
}

async function freshness(
  client: pg.Client,
  table: string,
  column: string,
  staleAfterMin: number,
): Promise<string> {
  const r = await client.query<{ latest: Date | null; count: string }>(
    `select max(${column}) as latest, count(*)::text as count from ${table}`,
  );
  const row = r.rows[0];
  if (!row || row.count === '0') throw new Error('table is empty — stage has never run');
  const age = ageMinutes(row.latest);
  if (age !== null && age > staleAfterMin) {
    throw new Error(`stale: newest row is ${age}min old (rows=${row.count})`);
  }
  return `${row.count} rows, newest ${age}min ago`;
}

const CHECKS: Check[] = [
  {
    name: 'database connection',
    hint: 'Is Postgres up? docker compose -f infra/docker/docker-compose.yml up -d postgres',
    run: async (c) => {
      const r = await c.query<{ version: string }>('select version()');
      return r.rows[0]?.version.split(' ').slice(0, 2).join(' ') ?? 'connected';
    },
  },
  {
    name: 'migrations applied',
    hint: 'Run: pnpm db:migrate',
    run: async (c) => {
      const r = await c.query<{ count: string }>(
        `select count(*)::text as count from information_schema.tables
         where table_name in ('daily_forecasts','polymarket_markets','market_prices','market_analysis','paper_trades','portfolio_snapshots')`,
      );
      const n = Number(r.rows[0]?.count ?? 0);
      if (n < 6) throw new Error(`only ${n}/6 expected tables exist`);
      return 'all expected tables present';
    },
  },
  {
    name: 'locations seeded',
    hint: 'Run: pnpm db:seed',
    run: async (c) => {
      const r = await c.query<{ count: string }>('select count(*)::text as count from locations');
      if (r.rows[0]?.count === '0') throw new Error('no locations');
      return `${r.rows[0]?.count} locations`;
    },
  },
  {
    name: 'collector: daily-max forecasts',
    hint: 'Collector not running or weather APIs unreachable. Check: pnpm --filter @pwa/collector start',
    run: (c) => freshness(c, 'daily_forecasts', 'forecasted_at', 12 * 60),
  },
  {
    name: 'live-feed: market discovery',
    hint: 'Live-feed not running, Gamma API unreachable, or no market matches FOCUS_QUERY/FOCUS_LOCATION right now.',
    run: async (c) => {
      const r = await c.query<{ count: string }>(
        `select count(*)::text as count from polymarket_markets where status = 'ACTIVE'`,
      );
      if (r.rows[0]?.count === '0') throw new Error('no ACTIVE markets discovered');
      return `${r.rows[0]?.count} active markets`;
    },
  },
  {
    name: 'live-feed: price ticks',
    hint: 'WebSocket down or no trading activity. Check live-feed logs.',
    run: (c) => freshness(c, 'market_prices', 'at', 15),
  },
  {
    name: 'analyzer: edge analysis',
    hint: 'Analyzer not running. Check: pnpm --filter @pwa/analyzer start',
    run: (c) => freshness(c, 'market_analysis', 'analyzed_at', 30),
  },
  {
    name: 'portfolio: snapshots',
    hint: 'Portfolio service not running. Check: pnpm --filter @pwa/portfolio start',
    run: (c) => freshness(c, 'portfolio_snapshots', 'at', 30),
  },
  {
    name: 'trading activity',
    hint: 'Informational — no trades is normal until an edge clears EDGE_THRESHOLD.',
    run: async (c) => {
      const r = await c.query<{ open: string; closed: string; pnl: string | null }>(
        `select
           count(*) filter (where status = 'OPEN')::text as open,
           count(*) filter (where status <> 'OPEN')::text as closed,
           sum(realized_pnl_usd) filter (where status <> 'OPEN')::text as pnl
         from paper_trades`,
      );
      const row = r.rows[0];
      const pnl = row?.pnl ? Number(row.pnl).toFixed(2) : '0.00';
      return `${row?.open ?? 0} open, ${row?.closed ?? 0} closed, realized $${pnl}`;
    },
  },
];

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? 'postgresql://pwa:pwa@localhost:5432/pwa';
  /* eslint-disable no-console */
  console.log(`doctor — checking pipeline (db: ${url.replace(/\/\/[^@]*@/, '//***@')})\n`);

  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
  } catch (err) {
    console.log(`✗ database connection — ${String(err)}`);
    console.log(`  hint: ${CHECKS[0]?.hint ?? ''}`);
    process.exit(1);
  }

  let failures = 0;
  for (const check of CHECKS) {
    try {
      const detail = await check.run(client);
      console.log(`✓ ${check.name} — ${detail}`);
    } catch (err) {
      failures++;
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`✗ ${check.name} — ${msg}`);
      console.log(`  hint: ${check.hint}`);
    }
  }

  await client.end();
  console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
  /* eslint-enable no-console */
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
