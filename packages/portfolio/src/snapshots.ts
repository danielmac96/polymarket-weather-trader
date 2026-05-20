import { eq, inArray, ne } from 'drizzle-orm';
import { createLogger, getDb, loadConfig, schema } from '@pwa/shared';
import { getCurrentPrice } from './pricing.js';
import { computeUnrealizedPnl } from './pnl.js';

const log = createLogger('snapshots');

export interface SnapshotResult {
  totalEquityUsd: number;
  cashUsd: number;
  openExposureUsd: number;
  unrealizedPnlUsd: number;
  realizedPnlUsdToDate: number;
  openPositionsCount: number;
  totalTradesCount: number;
  roiPct: number;
  winRatePct: number;
}

export async function writeSnapshotOnce(): Promise<SnapshotResult> {
  const cfg = loadConfig();
  const db = getDb();
  const now = new Date();

  const openTrades = await db
    .select({
      id: schema.paperTrades.id,
      marketId: schema.paperTrades.marketId,
      side: schema.paperTrades.side,
      entryPrice: schema.paperTrades.entryPrice,
      sizeUsd: schema.paperTrades.sizeUsd,
      sharesQty: schema.paperTrades.sharesQty,
    })
    .from(schema.paperTrades)
    .where(eq(schema.paperTrades.status, 'OPEN'));

  let openExposureUsd = 0;
  let unrealizedPnlUsd = 0;
  for (const t of openTrades) {
    openExposureUsd += t.sizeUsd;
    const live = await getCurrentPrice(t.marketId, 'YES');
    const yesMid = live?.midpoint ?? live?.price;
    if (yesMid !== undefined && yesMid !== null) {
      unrealizedPnlUsd += computeUnrealizedPnl(
        { side: t.side, entryPrice: t.entryPrice, sharesQty: t.sharesQty },
        yesMid,
      );
    }
  }

  const closed = await db
    .select({
      status: schema.paperTrades.status,
      realizedPnlUsd: schema.paperTrades.realizedPnlUsd,
    })
    .from(schema.paperTrades)
    .where(
      inArray(schema.paperTrades.status, ['CLOSED_MANUAL', 'RESOLVED_WIN', 'RESOLVED_LOSS']),
    );

  const realizedPnlUsdToDate = closed.reduce(
    (a, b) => a + (b.realizedPnlUsd ?? 0),
    0,
  );
  const wins = closed.filter((t) => t.status === 'RESOLVED_WIN').length;
  const losses = closed.filter((t) => t.status === 'RESOLVED_LOSS').length;
  const totalTradesCount = closed.length;

  const cashUsd =
    cfg.PAPER_STARTING_BANKROLL_USD - openExposureUsd + realizedPnlUsdToDate;
  const totalEquityUsd = cashUsd + openExposureUsd + unrealizedPnlUsd;
  const roiPct =
    ((totalEquityUsd - cfg.PAPER_STARTING_BANKROLL_USD) /
      cfg.PAPER_STARTING_BANKROLL_USD) *
    100;
  const winDenom = wins + losses;
  const winRatePct = winDenom === 0 ? 0 : (wins / winDenom) * 100;

  await db.insert(schema.portfolioSnapshots).values({
    at: now,
    cashUsd,
    openPositionsCount: openTrades.length,
    openExposureUsd,
    unrealizedPnlUsd,
    realizedPnlUsdToDate,
    totalEquityUsd,
    roiPct,
    winRatePct,
    totalTradesCount,
  });

  const result: SnapshotResult = {
    totalEquityUsd,
    cashUsd,
    openExposureUsd,
    unrealizedPnlUsd,
    realizedPnlUsdToDate,
    openPositionsCount: openTrades.length,
    totalTradesCount,
    roiPct,
    winRatePct,
  };
  log.info(result, 'snapshot written');
  return result;
}

// silence unused-import linter for ne in some configurations
export { ne };
