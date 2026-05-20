import { and, desc, eq, inArray } from 'drizzle-orm';
import { getDb, schema, type MarketSide, type TradeStatus } from '@pwa/shared';

export const dynamic = 'force-dynamic';

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
