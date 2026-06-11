import { and, desc, eq, gte, inArray, isNotNull } from 'drizzle-orm';
import { getDb, schema, type MarketSide, type TradeStatus } from '@pwa/shared';

export const dynamic = 'force-dynamic';

export interface FocusBucket {
  rowId: string;
  question: string;
  label: string;
  sortKey: number;
  midpointYes: number | null;
  modelProb: number | null;
  edge: number | null;
  decision: string | null;
  priceAt: Date | null;
}

export interface FocusForecast {
  provider: string;
  tempMaxF: number;
  forecastedAt: Date;
}

export interface FocusData {
  locationName: string | null;
  targetDate: string;
  buckets: FocusBucket[];
  forecasts: FocusForecast[];
}

function bucketLabel(
  condition: string | null,
  low: number | null,
  high: number | null,
  unit: string | null,
): string {
  const u = unit === 'C' ? '°C' : '°F';
  if (low === null) return '—';
  if (condition === 'TEMPERATURE_ABOVE') return `${low}${u} or higher`;
  if (condition === 'TEMPERATURE_BELOW') return `${low}${u} or lower`;
  if (high !== null && high !== low) return `${low}–${high}${u}`;
  return `${low}${u}`;
}

/**
 * The focused highest-temp market: all buckets of the soonest unresolved
 * target date, plus the daily-max forecasts feeding the model.
 */
export async function getFocusData(): Promise<FocusData | null> {
  const db = getDb();
  const rows = await db
    .select({
      rowId: schema.polymarketMarkets.id,
      question: schema.polymarketMarkets.question,
      condition: schema.polymarketMarkets.parsedCondition,
      threshold: schema.polymarketMarkets.parsedThreshold,
      thresholdHigh: schema.polymarketMarkets.parsedThresholdHigh,
      thresholdUnit: schema.polymarketMarkets.parsedThresholdUnit,
      targetDate: schema.polymarketMarkets.parsedTargetDate,
      locationId: schema.polymarketMarkets.parsedLocationId,
    })
    .from(schema.polymarketMarkets)
    .where(
      and(
        eq(schema.polymarketMarkets.status, 'ACTIVE'),
        isNotNull(schema.polymarketMarkets.parsedTargetDate),
      ),
    );
  if (rows.length === 0) return null;

  const targetDate = rows
    .map((r) => r.targetDate as string)
    .sort()[0] as string;
  const dayRows = rows.filter((r) => r.targetDate === targetDate);

  const buckets: FocusBucket[] = [];
  for (const r of dayRows) {
    const price = await getLatestPriceFor(r.rowId, 'YES');
    const analysis = await getLatestAnalysis(r.rowId);
    // ABOVE buckets sort last, BELOW first, ranges by lower bound.
    const sortKey =
      r.threshold === null
        ? Number.MAX_SAFE_INTEGER
        : r.threshold + (r.condition === 'TEMPERATURE_ABOVE' ? 0.5 : 0) -
          (r.condition === 'TEMPERATURE_BELOW' ? 0.5 : 0);
    buckets.push({
      rowId: r.rowId,
      question: r.question,
      label: bucketLabel(r.condition, r.threshold, r.thresholdHigh, r.thresholdUnit),
      sortKey,
      midpointYes: price?.midpoint ?? price?.price ?? null,
      modelProb: analysis?.modelProb ?? null,
      edge: analysis?.edge ?? null,
      decision: analysis?.decision ?? null,
      priceAt: price?.at ?? null,
    });
  }
  buckets.sort((a, b) => a.sortKey - b.sortKey);

  let locationName: string | null = null;
  let forecasts: FocusForecast[] = [];
  const locationId = dayRows.find((r) => r.locationId)?.locationId ?? null;
  if (locationId) {
    const loc = await db
      .select({ name: schema.locations.name, state: schema.locations.state })
      .from(schema.locations)
      .where(eq(schema.locations.id, locationId))
      .limit(1);
    locationName = loc[0] ? `${loc[0].name}${loc[0].state ? `, ${loc[0].state}` : ''}` : null;

    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const fRows = await db
      .select({
        provider: schema.dailyForecasts.provider,
        tempMaxF: schema.dailyForecasts.tempMaxF,
        forecastedAt: schema.dailyForecasts.forecastedAt,
      })
      .from(schema.dailyForecasts)
      .where(
        and(
          eq(schema.dailyForecasts.locationId, locationId),
          eq(schema.dailyForecasts.targetDate, targetDate),
          gte(schema.dailyForecasts.forecastedAt, cutoff),
        ),
      )
      .orderBy(desc(schema.dailyForecasts.forecastedAt));
    const seen = new Set<string>();
    forecasts = fRows.filter((f) => {
      if (seen.has(f.provider)) return false;
      seen.add(f.provider);
      return true;
    });
  }

  return { locationName, targetDate, buckets, forecasts };
}

export interface DashboardMarket {
  rowId: string;
  marketId: string;
  question: string;
  endDate: Date | null;
  midpointYes: number | null;
  modelProb: number | null;
  edge: number | null;
  decision: string | null;
  volume24hr: number | null;
  liquidity: number | null;
  priceAt: Date | null;
}

export interface OpenPosition {
  id: string;
  marketId: string;
  question: string;
  side: MarketSide;
  entryPrice: number;
  sizeUsd: number;
  sharesQty: number;
  openedAt: Date;
  currentYesMidpoint: number | null;
  unrealizedPnlUsd: number;
}

export interface ClosedPosition {
  id: string;
  question: string;
  side: MarketSide;
  entryPrice: number;
  closePrice: number | null;
  realizedPnlUsd: number | null;
  status: TradeStatus;
  openedAt: Date;
  closedAt: Date | null;
}

export interface LatestSnapshot {
  at: Date;
  cashUsd: number;
  openPositionsCount: number;
  openExposureUsd: number;
  unrealizedPnlUsd: number;
  realizedPnlUsdToDate: number;
  totalEquityUsd: number;
  roiPct: number;
  winRatePct: number;
  totalTradesCount: number;
}

export async function getLatestSnapshot(): Promise<LatestSnapshot | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.portfolioSnapshots)
    .orderBy(desc(schema.portfolioSnapshots.at))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return r;
}

export async function getEquityHistory(limit = 200): Promise<Array<{ at: Date; totalEquityUsd: number }>> {
  const db = getDb();
  const rows = await db
    .select({
      at: schema.portfolioSnapshots.at,
      totalEquityUsd: schema.portfolioSnapshots.totalEquityUsd,
    })
    .from(schema.portfolioSnapshots)
    .orderBy(desc(schema.portfolioSnapshots.at))
    .limit(limit);
  return rows.slice().reverse();
}

async function getLatestPriceFor(marketRowId: string, side: MarketSide): Promise<{
  midpoint: number | null;
  price: number;
  at: Date;
} | null> {
  const db = getDb();
  const rows = await db
    .select({
      midpoint: schema.marketPrices.midpoint,
      price: schema.marketPrices.price,
      at: schema.marketPrices.at,
    })
    .from(schema.marketPrices)
    .where(
      and(eq(schema.marketPrices.marketId, marketRowId), eq(schema.marketPrices.side, side)),
    )
    .orderBy(desc(schema.marketPrices.at))
    .limit(1);
  return rows[0] ?? null;
}

async function getLatestAnalysis(marketRowId: string): Promise<{
  modelProb: number;
  edge: number;
  decision: string;
} | null> {
  const db = getDb();
  const rows = await db
    .select({
      modelProb: schema.marketAnalysis.modelProb,
      edge: schema.marketAnalysis.edge,
      decision: schema.marketAnalysis.decision,
    })
    .from(schema.marketAnalysis)
    .where(eq(schema.marketAnalysis.marketId, marketRowId))
    .orderBy(desc(schema.marketAnalysis.analyzedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function getDashboardMarkets(): Promise<DashboardMarket[]> {
  const db = getDb();
  const markets = await db
    .select({
      rowId: schema.polymarketMarkets.id,
      marketId: schema.polymarketMarkets.marketId,
      question: schema.polymarketMarkets.question,
      endDate: schema.polymarketMarkets.endDate,
    })
    .from(schema.polymarketMarkets)
    .where(eq(schema.polymarketMarkets.status, 'ACTIVE'));

  const out: DashboardMarket[] = [];
  for (const m of markets) {
    const price = await getLatestPriceFor(m.rowId, 'YES');
    const analysis = await getLatestAnalysis(m.rowId);
    out.push({
      rowId: m.rowId,
      marketId: m.marketId,
      question: m.question,
      endDate: m.endDate,
      midpointYes: price?.midpoint ?? price?.price ?? null,
      modelProb: analysis?.modelProb ?? null,
      edge: analysis?.edge ?? null,
      decision: analysis?.decision ?? null,
      volume24hr: null,
      liquidity: null,
      priceAt: price?.at ?? null,
    });
  }
  out.sort((a, b) => Math.abs(b.edge ?? 0) - Math.abs(a.edge ?? 0));
  return out;
}

export async function getOpenPositions(): Promise<OpenPosition[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: schema.paperTrades.id,
      marketId: schema.paperTrades.marketId,
      side: schema.paperTrades.side,
      entryPrice: schema.paperTrades.entryPrice,
      sizeUsd: schema.paperTrades.sizeUsd,
      sharesQty: schema.paperTrades.sharesQty,
      openedAt: schema.paperTrades.openedAt,
      question: schema.polymarketMarkets.question,
    })
    .from(schema.paperTrades)
    .innerJoin(
      schema.polymarketMarkets,
      eq(schema.polymarketMarkets.id, schema.paperTrades.marketId),
    )
    .where(eq(schema.paperTrades.status, 'OPEN'));

  const out: OpenPosition[] = [];
  for (const t of rows) {
    const price = await getLatestPriceFor(t.marketId, 'YES');
    const yesMid = price?.midpoint ?? price?.price ?? null;
    const currentValue =
      yesMid === null ? t.entryPrice : t.side === 'YES' ? yesMid : 1 - yesMid;
    const unrealizedPnlUsd =
      yesMid === null ? 0 : t.sharesQty * (currentValue - t.entryPrice);
    out.push({
      id: t.id,
      marketId: t.marketId,
      question: t.question,
      side: t.side,
      entryPrice: t.entryPrice,
      sizeUsd: t.sizeUsd,
      sharesQty: t.sharesQty,
      openedAt: t.openedAt,
      currentYesMidpoint: yesMid,
      unrealizedPnlUsd,
    });
  }
  return out;
}

export async function getClosedPositions(): Promise<ClosedPosition[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: schema.paperTrades.id,
      side: schema.paperTrades.side,
      entryPrice: schema.paperTrades.entryPrice,
      closePrice: schema.paperTrades.closePrice,
      realizedPnlUsd: schema.paperTrades.realizedPnlUsd,
      status: schema.paperTrades.status,
      openedAt: schema.paperTrades.openedAt,
      closedAt: schema.paperTrades.closedAt,
      question: schema.polymarketMarkets.question,
    })
    .from(schema.paperTrades)
    .innerJoin(
      schema.polymarketMarkets,
      eq(schema.polymarketMarkets.id, schema.paperTrades.marketId),
    )
    .where(inArray(schema.paperTrades.status, ['CLOSED_MANUAL', 'RESOLVED_WIN', 'RESOLVED_LOSS']))
    .orderBy(desc(schema.paperTrades.closedAt));

  return rows.map((r) => ({
    id: r.id,
    question: r.question,
    side: r.side,
    entryPrice: r.entryPrice,
    closePrice: r.closePrice,
    realizedPnlUsd: r.realizedPnlUsd,
    status: r.status,
    openedAt: r.openedAt,
    closedAt: r.closedAt,
  }));
}

export interface MarketsRow {
  rowId: string;
  marketId: string;
  question: string;
  status: string;
  endDate: Date | null;
  decision: string | null;
  edge: number | null;
}

export async function getAllMarkets(): Promise<MarketsRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      rowId: schema.polymarketMarkets.id,
      marketId: schema.polymarketMarkets.marketId,
      question: schema.polymarketMarkets.question,
      status: schema.polymarketMarkets.status,
      endDate: schema.polymarketMarkets.endDate,
    })
    .from(schema.polymarketMarkets);

  const out: MarketsRow[] = [];
  for (const m of rows) {
    const a = await getLatestAnalysis(m.rowId);
    out.push({
      rowId: m.rowId,
      marketId: m.marketId,
      question: m.question,
      status: m.status,
      endDate: m.endDate,
      decision: a?.decision ?? null,
      edge: a?.edge ?? null,
    });
  }
  return out;
}

export async function getFeedHealth(): Promise<{ lastPriceAt: Date | null; staleSeconds: number | null }> {
  const db = getDb();
  const rows = await db
    .select({ at: schema.marketPrices.at })
    .from(schema.marketPrices)
    .orderBy(desc(schema.marketPrices.at))
    .limit(1);
  const at = rows[0]?.at ?? null;
  if (!at) return { lastPriceAt: null, staleSeconds: null };
  return {
    lastPriceAt: at,
    staleSeconds: Math.round((Date.now() - at.getTime()) / 1000),
  };
}
