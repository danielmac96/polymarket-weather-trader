import { and, desc, eq, gte, sql } from 'drizzle-orm';
import {
  createLogger,
  getDb,
  loadConfig,
  schema,
  type Forecast,
  type WeatherCondition,
  type ThresholdUnit,
} from '@pwa/shared';
import { usParser } from './parsers/usParser.js';
import { computeEdge, type EdgeResult } from './edge.js';
import { decide } from './decide.js';
import { maybeAutoTrade } from './paperTrader.js';

const log = createLogger('analyzer');

interface MarketRow {
  id: string;
  marketId: string;
  question: string;
  endDate: Date | null;
  parsedLocationId: string | null;
  parsedCondition: WeatherCondition | null;
  parsedThreshold: number | null;
  parsedThresholdUnit: ThresholdUnit | null;
}

async function fetchActiveMarkets(): Promise<MarketRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: schema.polymarketMarkets.id,
      marketId: schema.polymarketMarkets.marketId,
      question: schema.polymarketMarkets.question,
      endDate: schema.polymarketMarkets.endDate,
      parsedLocationId: schema.polymarketMarkets.parsedLocationId,
      parsedCondition: schema.polymarketMarkets.parsedCondition,
      parsedThreshold: schema.polymarketMarkets.parsedThreshold,
      parsedThresholdUnit: schema.polymarketMarkets.parsedThresholdUnit,
    })
    .from(schema.polymarketMarkets)
    .where(eq(schema.polymarketMarkets.status, 'ACTIVE'));
  return rows;
}

async function backfillParse(row: MarketRow): Promise<MarketRow> {
  if (row.parsedLocationId && row.parsedCondition && row.parsedThreshold !== null) {
    return row;
  }
  const db = getDb();
  const location = usParser.extractLocation(row.question);
  const condition = usParser.extractCondition(row.question);
  const threshold = usParser.extractThreshold(row.question);

  let locationId: string | null = row.parsedLocationId;
  if (location && !locationId) {
    const found = await db
      .select({ id: schema.locations.id })
      .from(schema.locations)
      .where(
        and(
          eq(schema.locations.region, 'US'),
          eq(schema.locations.name, location.name),
          location.state ? eq(schema.locations.state, location.state) : sql`true`,
        ),
      )
      .limit(1);
    locationId = found[0]?.id ?? null;
  }

  await db
    .update(schema.polymarketMarkets)
    .set({
      parsedLocationId: locationId,
      parsedCondition: condition,
      parsedThreshold: threshold?.value ?? null,
      parsedThresholdUnit: threshold?.unit ?? null,
      updatedAt: new Date(),
    })
    .where(eq(schema.polymarketMarkets.id, row.id));

  return {
    ...row,
    parsedLocationId: locationId,
    parsedCondition: condition,
    parsedThreshold: threshold?.value ?? null,
    parsedThresholdUnit: threshold?.unit ?? null,
  };
}

async function latestMidpoint(marketRowId: string): Promise<number | null> {
  const db = getDb();
  const rows = await db
    .select({ midpoint: schema.marketPrices.midpoint, price: schema.marketPrices.price })
    .from(schema.marketPrices)
    .where(
      and(
        eq(schema.marketPrices.marketId, marketRowId),
        eq(schema.marketPrices.side, 'YES'),
      ),
    )
    .orderBy(desc(schema.marketPrices.at))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return r.midpoint ?? r.price ?? null;
}

async function latestVolumeAndLiquidity(
  marketRowId: string,
): Promise<{ volume24hr: number | null; liquidity: number | null }> {
  const db = getDb();
  const rows = await db
    .select({
      volume24hr: schema.marketPrices.volume24hr,
      liquidity: schema.marketPrices.liquidity,
    })
    .from(schema.marketPrices)
    .where(eq(schema.marketPrices.marketId, marketRowId))
    .orderBy(desc(schema.marketPrices.at))
    .limit(1);
  const r = rows[0];
  return { volume24hr: r?.volume24hr ?? null, liquidity: r?.liquidity ?? null };
}

async function recentForecasts(locationId: string): Promise<Forecast[]> {
  const db = getDb();
  // Last 24h of forecasts is generous; pick the most recent per provider.
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await db
    .select()
    .from(schema.weatherForecasts)
    .where(
      and(
        eq(schema.weatherForecasts.locationId, locationId),
        gte(schema.weatherForecasts.forecastedAt, cutoff),
      ),
    )
    .orderBy(desc(schema.weatherForecasts.forecastedAt));

  const latestByProvider = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    if (!latestByProvider.has(r.provider)) latestByProvider.set(r.provider, r);
  }
  return Array.from(latestByProvider.values()).map((r) => ({
    locationId: r.locationId,
    provider: r.provider,
    forecastedAt: r.forecastedAt,
    validFrom: r.validFrom,
    validUntil: r.validUntil,
    tempC: r.tempC,
    tempF: r.tempF,
    precipMm: r.precipMm,
    precipProb: r.precipProb,
    windKph: r.windKph,
    weatherCode: r.weatherCode,
    payload: r.payload,
  }));
}

async function hasOpenTrade(marketRowId: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ id: schema.paperTrades.id })
    .from(schema.paperTrades)
    .where(
      and(
        eq(schema.paperTrades.marketId, marketRowId),
        eq(schema.paperTrades.status, 'OPEN'),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export interface AnalyzeRunResult {
  analyzed: number;
  tradeDecisions: number;
  watchDecisions: number;
  skipDecisions: number;
  tradesOpened: number;
}

export async function runAnalysisOnce(): Promise<AnalyzeRunResult> {
  const cfg = loadConfig();
  const startedAt = Date.now();
  const rows = await fetchActiveMarkets();
  log.info({ count: rows.length }, 'starting analysis');

  let trade = 0;
  let watch = 0;
  let skip = 0;
  let tradesOpened = 0;

  for (const original of rows) {
    const row = await backfillParse(original);
    if (
      row.parsedLocationId === null ||
      row.parsedCondition === null ||
      row.parsedThreshold === null ||
      row.parsedThresholdUnit === null
    ) {
      log.debug({ marketId: row.marketId }, 'incomplete parse, skipping');
      skip++;
      continue;
    }
    const midpoint = await latestMidpoint(row.id);
    if (midpoint === null) {
      log.debug({ marketId: row.marketId }, 'no price yet, skipping');
      skip++;
      continue;
    }
    const forecasts = await recentForecasts(row.parsedLocationId);
    const edge = computeEdge({
      marketId: row.marketId,
      question: row.question,
      condition: row.parsedCondition,
      threshold: row.parsedThreshold,
      thresholdUnit: row.parsedThresholdUnit,
      endDate: row.endDate ?? new Date(),
      impliedProb: midpoint,
      forecasts,
    });

    const open = await hasOpenTrade(row.id);
    const { volume24hr, liquidity } = await latestVolumeAndLiquidity(row.id);
    const decision = decide({
      edge,
      volume24hr,
      liquidity,
      endDate: row.endDate,
      hasOpenTrade: open,
      edgeThreshold: cfg.EDGE_THRESHOLD,
      minVolumeUsd: cfg.MIN_MARKET_VOLUME_USD,
      minLiquidityUsd: cfg.MIN_MARKET_LIQUIDITY_USD,
      minConfidence: 0.4,
      now: new Date(),
    });

    const db = getDb();
    const insertedAnalysis = await db
      .insert(schema.marketAnalysis)
      .values({
        marketId: row.id,
        impliedProb: edge.impliedProb,
        modelProb: edge.modelProb,
        edge: edge.edge,
        confidence: edge.confidence,
        decision,
        reasoning: edge.reasoning,
      })
      .returning({ id: schema.marketAnalysis.id });
    const analysisId = insertedAnalysis[0]?.id ?? null;

    if (decision === 'TRADE') {
      trade++;
      const tradeId = await maybeAutoTrade({
        marketRowId: row.id,
        analysisId,
        edge,
        midpoint,
      });
      if (tradeId) tradesOpened++;
    } else if (decision === 'WATCH') {
      watch++;
    } else {
      skip++;
    }
  }

  const result: AnalyzeRunResult = {
    analyzed: rows.length,
    tradeDecisions: trade,
    watchDecisions: watch,
    skipDecisions: skip,
    tradesOpened,
  };
  log.info({ ...result, durationMs: Date.now() - startedAt }, 'analysis complete');
  return result;
}

// re-export for tests
export { fetchActiveMarkets };
