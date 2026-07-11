import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  createLogger,
  getDb,
  loadConfig,
  schema,
  type MarketSide,
  type TradingSettings,
} from '@pwa/shared';
import type { EdgeResult } from './edge.js';
import { computeKellySize } from './sizing.js';

const log = createLogger('paper-trader');

export interface PaperTradeInput {
  marketRowId: string;
  analysisId: string | null;
  edge: EdgeResult;
  midpoint: number;
  /** Live user settings (unit size + risk profile) for this cycle. */
  settings: TradingSettings;
}

/** Current free cash and open cost basis derived from the trade ledger. */
async function getBankroll(): Promise<{ cashUsd: number; openExposureUsd: number }> {
  const cfg = loadConfig();
  const db = getDb();
  const open = await db
    .select({ total: sql<string>`coalesce(sum(${schema.paperTrades.sizeUsd}), 0)` })
    .from(schema.paperTrades)
    .where(eq(schema.paperTrades.status, 'OPEN'));
  const realized = await db
    .select({
      total: sql<string>`coalesce(sum(${schema.paperTrades.realizedPnlUsd}), 0)`,
    })
    .from(schema.paperTrades)
    .where(
      inArray(schema.paperTrades.status, ['CLOSED_MANUAL', 'RESOLVED_WIN', 'RESOLVED_LOSS']),
    );
  const openExposureUsd = Number(open[0]?.total ?? 0);
  const realizedPnlUsd = Number(realized[0]?.total ?? 0);
  return {
    cashUsd: cfg.PAPER_STARTING_BANKROLL_USD + realizedPnlUsd - openExposureUsd,
    openExposureUsd,
  };
}

export async function maybeAutoTrade(input: PaperTradeInput): Promise<string | null> {
  const cfg = loadConfig();
  // Env flag is a hard kill switch; the DB setting is the user's live toggle.
  if (!cfg.AUTO_PAPER_TRADE || !input.settings.autoTradeEnabled) {
    log.debug({ marketRowId: input.marketRowId }, 'auto trading disabled');
    return null;
  }

  const db = getDb();

  // Duplicate guard: refuse if there's already an OPEN trade on this market.
  const existing = await db
    .select({ id: schema.paperTrades.id })
    .from(schema.paperTrades)
    .where(
      and(
        eq(schema.paperTrades.marketId, input.marketRowId),
        eq(schema.paperTrades.status, 'OPEN'),
      ),
    )
    .limit(1);
  if (existing.length > 0) {
    log.debug({ marketRowId: input.marketRowId }, 'open trade exists, skipping');
    return null;
  }

  const side: MarketSide = input.edge.modelProb > input.edge.impliedProb ? 'YES' : 'NO';
  // Entry price for the chosen side. If buying YES, that's the YES midpoint.
  // If buying NO, that's 1 - midpoint (NO probability).
  const entryPrice = side === 'YES' ? input.midpoint : 1 - input.midpoint;
  if (entryPrice <= 0 || entryPrice >= 1) {
    log.warn(
      { marketRowId: input.marketRowId, entryPrice, midpoint: input.midpoint },
      'invalid entry price, skipping',
    );
    return null;
  }

  const { cashUsd, openExposureUsd } = await getBankroll();
  const { profile, unitSizeUsd } = input.settings;
  const sized = computeKellySize({
    modelProbYes: input.edge.modelProb,
    side,
    entryPrice,
    cashUsd,
    openExposureUsd,
    kellyFraction: profile.kellyFraction,
    maxPositionPct: profile.maxPositionPct,
    maxTotalExposurePct: profile.maxTotalExposurePct,
    maxPositionUsd: cfg.MAX_PAPER_POSITION_USD,
    unitSizeUsd,
    maxUnitsPerTrade: profile.maxUnitsPerTrade,
  });
  if (sized.sizeUsd <= 0) {
    log.info(
      { marketRowId: input.marketRowId, reason: sized.reason, cashUsd, openExposureUsd },
      'kelly sizing declined trade',
    );
    return null;
  }
  const sizeUsd = sized.sizeUsd;
  const sharesQty = sizeUsd / entryPrice;

  const inserted = await db
    .insert(schema.paperTrades)
    .values({
      marketId: input.marketRowId,
      analysisId: input.analysisId,
      side,
      entryPrice,
      sizeUsd,
      sharesQty,
      status: 'OPEN',
      source: 'AUTO',
      notes: `auto: edge=${input.edge.edge.toFixed(4)} conf=${input.edge.confidence.toFixed(2)} | ${sized.reason}`,
    })
    .returning({ id: schema.paperTrades.id });

  const id = inserted[0]?.id ?? null;
  log.info(
    {
      tradeId: id,
      marketRowId: input.marketRowId,
      side,
      entryPrice,
      sizeUsd,
      sharesQty,
      edge: input.edge.edge,
      confidence: input.edge.confidence,
    },
    'auto paper trade opened',
  );
  return id;
}
