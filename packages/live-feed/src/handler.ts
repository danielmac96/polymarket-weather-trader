import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { createLogger, getDb, schema, type MarketSide } from '@pwa/shared';

const log = createLogger('handler');

const numberLike = z.union([z.string(), z.number()]).transform((v) => {
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
});

const PriceChangeEvent = z
  .object({
    event_type: z.literal('price_change'),
    market: z.string().optional(),
    asset_id: z.string(),
    price: numberLike.nullable().optional(),
    side: z.string().optional(),
    timestamp: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();

const BookLevel = z.object({
  price: numberLike.nullable().optional(),
  size: numberLike.nullable().optional(),
});

const BookEvent = z
  .object({
    event_type: z.literal('book'),
    market: z.string().optional(),
    asset_id: z.string(),
    bids: z.array(BookLevel).optional(),
    asks: z.array(BookLevel).optional(),
    timestamp: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();

const LastTradeEvent = z
  .object({
    event_type: z.literal('last_trade_price'),
    market: z.string().optional(),
    asset_id: z.string(),
    price: numberLike.nullable().optional(),
    side: z.string().optional(),
    timestamp: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();

export const ClobEvent = z.discriminatedUnion('event_type', [
  PriceChangeEvent,
  BookEvent,
  LastTradeEvent,
]);
export type ClobEvent = z.infer<typeof ClobEvent>;

interface TokenMeta {
  marketRowId: string;
  side: MarketSide;
}

// Cache for the latest seen (price, at) per token for the 250ms dedupe.
interface LastSeen {
  price: number;
  at: number;
}

export class PriceHandler {
  private tokenMap = new Map<string, TokenMeta>();
  private lastSeen = new Map<string, LastSeen>();
  private readonly DEDUPE_WINDOW_MS = 250;

  setTokenMap(map: Map<string, TokenMeta>): void {
    this.tokenMap = map;
  }

  registerToken(tokenId: string, meta: TokenMeta): void {
    this.tokenMap.set(tokenId, meta);
  }

  parseTimestamp(raw: string | number | undefined): Date {
    if (raw === undefined) return new Date();
    const n = typeof raw === 'string' ? Number(raw) : raw;
    if (Number.isFinite(n)) {
      // Polymarket sends ms-since-epoch; guard against seconds-since-epoch.
      // 1e11 seconds is far past the year 5000, so any value >= 1e11 is ms.
      const ms = n >= 1e11 ? n : n * 1000;
      return new Date(ms);
    }
    if (typeof raw === 'string') {
      const d = new Date(raw);
      if (!Number.isNaN(d.getTime())) return d;
    }
    return new Date();
  }

  private extractPrice(evt: ClobEvent): {
    price: number | null;
    bestBid: number | null;
    bestAsk: number | null;
    midpoint: number | null;
  } {
    if (evt.event_type === 'price_change' || evt.event_type === 'last_trade_price') {
      const price = evt.price ?? null;
      return { price, bestBid: null, bestAsk: null, midpoint: price };
    }
    const bids = evt.bids ?? [];
    const asks = evt.asks ?? [];
    const bestBid = bids.length > 0 && bids[0]?.price != null ? bids[0].price : null;
    const bestAsk = asks.length > 0 && asks[0]?.price != null ? asks[0].price : null;
    const midpoint =
      bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : (bestBid ?? bestAsk);
    return { price: midpoint, bestBid, bestAsk, midpoint };
  }

  async handle(evt: ClobEvent): Promise<void> {
    const meta = this.tokenMap.get(evt.asset_id);
    if (!meta) {
      log.debug({ asset_id: evt.asset_id }, 'event for unknown token, ignoring');
      return;
    }
    const at = this.parseTimestamp(evt.timestamp);
    const { price, bestBid, bestAsk, midpoint } = this.extractPrice(evt);
    if (price === null) {
      log.debug({ asset_id: evt.asset_id, event_type: evt.event_type }, 'no price');
      return;
    }

    const prev = this.lastSeen.get(evt.asset_id);
    if (
      prev !== undefined &&
      prev.price === price &&
      at.getTime() - prev.at < this.DEDUPE_WINDOW_MS
    ) {
      return;
    }
    this.lastSeen.set(evt.asset_id, { price, at: at.getTime() });

    const db = getDb();
    await db.insert(schema.marketPrices).values({
      marketId: meta.marketRowId,
      tokenId: evt.asset_id,
      side: meta.side,
      price,
      bestBid,
      bestAsk,
      midpoint,
      volume24hr: null,
      liquidity: null,
      at,
    });
  }
}

export async function buildTokenMap(): Promise<Map<string, TokenMeta>> {
  const db = getDb();
  const rows = await db
    .select({
      id: schema.polymarketMarkets.id,
      clobTokenIdYes: schema.polymarketMarkets.clobTokenIdYes,
      clobTokenIdNo: schema.polymarketMarkets.clobTokenIdNo,
    })
    .from(schema.polymarketMarkets)
    .where(eq(schema.polymarketMarkets.status, 'ACTIVE'));

  const map = new Map<string, TokenMeta>();
  for (const r of rows) {
    if (r.clobTokenIdYes) map.set(r.clobTokenIdYes, { marketRowId: r.id, side: 'YES' });
    if (r.clobTokenIdNo) map.set(r.clobTokenIdNo, { marketRowId: r.id, side: 'NO' });
  }
  return map;
}

// Helper for tests / consumers wanting the most-recent price for a market.
export async function getLatestPrice(
  marketRowId: string,
  side: MarketSide,
): Promise<typeof schema.marketPrices.$inferSelect | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.marketPrices)
    .where(
      and(eq(schema.marketPrices.marketId, marketRowId), eq(schema.marketPrices.side, side)),
    )
    .orderBy(desc(schema.marketPrices.at))
    .limit(1);
  return rows[0] ?? null;
}
