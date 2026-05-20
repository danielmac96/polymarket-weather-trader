import { z } from 'zod';
import { and, eq, isNotNull, lt } from 'drizzle-orm';
import {
  createLogger,
  fetchJson,
  getDb,
  schema,
  type MarketSide,
} from '@pwa/shared';
import { computeRealizedPnl } from './pnl.js';

const log = createLogger('resolver');

const GammaMarket = z.object({
  id: z.union([z.string(), z.number()]),
  closed: z.boolean().optional(),
  outcomePrices: z.union([z.array(z.string()), z.string()]).optional(),
  umaResolutionStatuses: z.union([z.array(z.string()), z.string()]).optional(),
});
type GammaMarket = z.infer<typeof GammaMarket>;

function asStringArray(v: string | string[] | undefined): string[] | null {
  if (v === undefined) return null;
  if (Array.isArray(v)) return v;
  try {
    const parsed: unknown = JSON.parse(v);
    return Array.isArray(parsed) ? parsed.map(String) : null;
  } catch {
    return null;
  }
}

/** Derive YES|NO outcome from a Gamma market payload, or null if undecided. */
export function deriveOutcome(m: GammaMarket): MarketSide | null {
  if (m.closed !== true) return null;
  const prices = asStringArray(m.outcomePrices);
  if (prices && prices.length >= 2) {
    const yes = Number(prices[0]);
    const no = Number(prices[1]);
    if (Number.isFinite(yes) && Number.isFinite(no)) {
      if (yes >= 0.99 && no <= 0.01) return 'YES';
      if (no >= 0.99 && yes <= 0.01) return 'NO';
    }
  }
  const uma = asStringArray(m.umaResolutionStatuses);
  if (uma && uma.some((s) => s.toLowerCase().includes('resolved'))) {
    // No price info available; we treat the market as closed but unresolved
    // for our purposes (we can't decide trade outcome).
    return null;
  }
  return null;
}

async function fetchMarketResolution(marketId: string): Promise<GammaMarket | null> {
  const url = `https://gamma-api.polymarket.com/markets?id=${encodeURIComponent(marketId)}`;
  try {
    const data = await fetchJson(url, z.array(GammaMarket));
    return data[0] ?? null;
  } catch (err) {
    log.warn({ err: String(err), marketId }, 'resolution fetch failed');
    return null;
  }
}

export interface ResolveResult {
  candidates: number;
  resolved: number;
  tradesClosed: number;
}

/** Find ACTIVE markets past endDate and try to resolve them. */
export async function runResolverOnce(): Promise<ResolveResult> {
  const startedAt = Date.now();
  const db = getDb();
  const now = new Date();

  const expired = await db
    .select({
      id: schema.polymarketMarkets.id,
      marketId: schema.polymarketMarkets.marketId,
    })
    .from(schema.polymarketMarkets)
    .where(
      and(
        eq(schema.polymarketMarkets.status, 'ACTIVE'),
        isNotNull(schema.polymarketMarkets.endDate),
        lt(schema.polymarketMarkets.endDate, now),
      ),
    );

  let resolved = 0;
  let tradesClosed = 0;

  for (const m of expired) {
    const gamma = await fetchMarketResolution(m.marketId);
    if (!gamma) continue;
    const outcome = deriveOutcome(gamma);
    if (!outcome) continue;

    await db
      .update(schema.polymarketMarkets)
      .set({ status: 'RESOLVED', resolvedOutcome: outcome, resolvedAt: now, updatedAt: now })
      .where(eq(schema.polymarketMarkets.id, m.id));
    resolved++;

    const openTrades = await db
      .select({
        id: schema.paperTrades.id,
        side: schema.paperTrades.side,
        entryPrice: schema.paperTrades.entryPrice,
        sharesQty: schema.paperTrades.sharesQty,
      })
      .from(schema.paperTrades)
      .where(
        and(
          eq(schema.paperTrades.marketId, m.id),
          eq(schema.paperTrades.status, 'OPEN'),
        ),
      );

    for (const t of openTrades) {
      const won = t.side === outcome;
      const pnl = computeRealizedPnl(
        { side: t.side, entryPrice: t.entryPrice, sharesQty: t.sharesQty },
        won ? 'WIN' : 'LOSS',
      );
      await db
        .update(schema.paperTrades)
        .set({
          status: won ? 'RESOLVED_WIN' : 'RESOLVED_LOSS',
          closedAt: now,
          closePrice: won ? 1 : 0,
          realizedPnlUsd: pnl,
          updatedAt: now,
        })
        .where(eq(schema.paperTrades.id, t.id));
      tradesClosed++;
    }
  }

  log.info(
    { candidates: expired.length, resolved, tradesClosed, durationMs: Date.now() - startedAt },
    'resolver complete',
  );
  return { candidates: expired.length, resolved, tradesClosed };
}
