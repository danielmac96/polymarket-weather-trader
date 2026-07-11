import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { and, eq, like, sql } from 'drizzle-orm';
import {
  dailyForecasts,
  locations,
  marketPrices,
  polymarketMarkets,
} from './schema.js';

/**
 * Demo seed: a synthetic "Highest temperature in NYC" bucket ladder for
 * tomorrow, with provider forecasts and mispriced markets, so the full
 * pipeline (analyzer → auto paper-trades → portfolio → dashboard) can be
 * exercised without network access to NOAA/Open-Meteo/Polymarket.
 *
 * All demo market_ids are prefixed "demo-" and re-seeding wipes them first,
 * so this never collides with real discovered markets.
 */

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface DemoBucket {
  slug: string;
  phrase: string; // question tail, parseable by parseHighestTempBucket
  condition: 'TEMPERATURE_ABOVE' | 'TEMPERATURE_BELOW' | 'TEMPERATURE_RANGE';
  threshold: number;
  thresholdHigh: number | null;
  /** YES midpoint the "market" is quoting (deliberately mispriced). */
  marketYes: number;
}

// Forecast consensus ≈ 86.5°F, so the model puts most mass on 86–87°F and
// 88°F-or-higher while the quoted prices overweight the cold buckets.
const BUCKETS: DemoBucket[] = [
  { slug: '84-below', phrase: 'be 84°F or below', condition: 'TEMPERATURE_BELOW', threshold: 84, thresholdHigh: null, marketYes: 0.4 },
  { slug: '85', phrase: 'be 85°F', condition: 'TEMPERATURE_RANGE', threshold: 85, thresholdHigh: 85, marketYes: 0.15 },
  { slug: '86-87', phrase: 'be 86-87°F', condition: 'TEMPERATURE_RANGE', threshold: 86, thresholdHigh: 87, marketYes: 0.2 },
  { slug: '88-higher', phrase: 'be 88°F or higher', condition: 'TEMPERATURE_ABOVE', threshold: 88, thresholdHigh: null, marketYes: 0.25 },
];

// Daily-max forecasts in °C per provider (≈86.0°F and ≈87.1°F).
const PROVIDER_HIGHS_C: Record<string, number> = {
  noaa: 30.0,
  'open-meteo': 30.6,
};

export async function demoSeed(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required to demo-seed');
  const pool = new pg.Pool({ connectionString: url });
  const db = drizzle(pool);

  const nyc = await db
    .select({ id: locations.id })
    .from(locations)
    .where(and(eq(locations.region, 'US'), eq(locations.name, 'New York')))
    .limit(1);
  const locationId = nyc[0]?.id;
  if (!locationId) throw new Error('New York location missing — run db:seed first');

  const now = new Date();
  const target = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const targetDate = target.toISOString().slice(0, 10);
  const [y, m, d] = targetDate.split('-').map(Number) as [number, number, number];
  const monthDay = `${MONTH_NAMES[m - 1]} ${d}`;
  const endDate = new Date(`${targetDate}T23:59:00Z`);

  // eslint-disable-next-line no-console
  console.log(`→ demo-seeding highest-temp NYC ladder for ${targetDate}`);

  await db.delete(polymarketMarkets).where(like(polymarketMarkets.marketId, 'demo-%'));

  for (const b of BUCKETS) {
    const marketId = `demo-highest-temp-nyc-${targetDate}-${b.slug}`;
    const question = `Will the highest temperature in NYC on ${monthDay} ${b.phrase}?`;
    const inserted = await db
      .insert(polymarketMarkets)
      .values({
        marketId,
        question,
        endDate,
        region: 'US',
        parsedLocationId: locationId,
        parsedCondition: b.condition,
        parsedThreshold: b.threshold,
        parsedThresholdHigh: b.thresholdHigh,
        parsedThresholdUnit: 'F',
        parsedTargetDate: targetDate,
        status: 'ACTIVE',
      })
      .returning({ id: polymarketMarkets.id });
    const rowId = inserted[0]?.id;
    if (!rowId) throw new Error(`failed to insert demo market ${marketId}`);

    await db.insert(marketPrices).values({
      marketId: rowId,
      tokenId: `demo-token-${b.slug}`,
      side: 'YES',
      price: b.marketYes,
      bestBid: b.marketYes - 0.01,
      bestAsk: b.marketYes + 0.01,
      midpoint: b.marketYes,
      volume24hr: 5000,
      liquidity: 3000,
      at: now,
    });
  }

  for (const [provider, tempMaxC] of Object.entries(PROVIDER_HIGHS_C)) {
    await db.insert(dailyForecasts).values({
      locationId,
      provider,
      forecastedAt: now,
      targetDate,
      tempMaxC,
      tempMaxF: (tempMaxC * 9) / 5 + 32,
      payload: { demo: true },
    });
  }

  const count = await db.execute<{ count: string }>(
    sql`select count(*)::text as count from polymarket_markets where market_id like 'demo-%'`,
  );
  // eslint-disable-next-line no-console
  console.log(`✓ demo seed complete — demo markets=${count.rows[0]?.count ?? '?'}`);
  await pool.end();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  demoSeed().catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}
