import { desc, eq } from 'drizzle-orm';
import { getDb, schema } from '@pwa/shared';

export interface FooterHealth {
  lastPriceAt: Date | null;
  lastForecastAt: Date | null;
  lastAnalysisAt: Date | null;
  activeMarketCount: number;
  commitSha: string | null;
}

export async function getFooterHealth(): Promise<FooterHealth> {
  const db = getDb();

  const priceRows = await db
    .select({ at: schema.marketPrices.at })
    .from(schema.marketPrices)
    .orderBy(desc(schema.marketPrices.at))
    .limit(1);

  const forecastRows = await db
    .select({ at: schema.weatherForecasts.forecastedAt })
    .from(schema.weatherForecasts)
    .orderBy(desc(schema.weatherForecasts.forecastedAt))
    .limit(1);

  const analysisRows = await db
    .select({ at: schema.marketAnalysis.analyzedAt })
    .from(schema.marketAnalysis)
    .orderBy(desc(schema.marketAnalysis.analyzedAt))
    .limit(1);

  const activeMarkets = await db
    .select({ id: schema.polymarketMarkets.id })
    .from(schema.polymarketMarkets)
    .where(eq(schema.polymarketMarkets.status, 'ACTIVE'));

  const sha = process.env.GITHUB_SHA ?? process.env.COMMIT_SHA ?? null;

  return {
    lastPriceAt: priceRows[0]?.at ?? null,
    lastForecastAt: forecastRows[0]?.at ?? null,
    lastAnalysisAt: analysisRows[0]?.at ?? null,
    activeMarketCount: activeMarkets.length,
    commitSha: sha ? sha.slice(0, 7) : null,
  };
}
