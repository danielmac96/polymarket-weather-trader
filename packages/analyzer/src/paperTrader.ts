import { and, eq } from 'drizzle-orm';
import {
  createLogger,
  getDb,
  loadConfig,
  schema,
  type MarketSide,
} from '@pwa/shared';
import type { EdgeResult } from './edge.js';

const log = createLogger('paper-trader');

export interface PaperTradeInput {
  marketRowId: string;
  analysisId: string | null;
  edge: EdgeResult;
  midpoint: number;
}

export async function maybeAutoTrade(input: PaperTradeInput): Promise<string | null> {
  const cfg = loadConfig();
  if (!cfg.AUTO_PAPER_TRADE) {
    log.debug({ marketRowId: input.marketRowId }, 'AUTO_PAPER_TRADE off');
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

  const sizeUsd = Math.min(
    cfg.MAX_PAPER_POSITION_USD,
    cfg.PAPER_STARTING_BANKROLL_USD * 0.05,
  );
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
      notes: `auto: edge=${input.edge.edge.toFixed(4)} conf=${input.edge.confidence.toFixed(2)}`,
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
