import { and, desc, eq } from 'drizzle-orm';
import { getDb, schema, type MarketSide } from '@pwa/shared';

export interface LatestPrice {
  price: number;
  midpoint: number | null;
  bestBid: number | null;
  bestAsk: number | null;
  at: Date;
}

export async function getCurrentPrice(
  marketRowId: string,
  side: MarketSide,
): Promise<LatestPrice | null> {
  const db = getDb();
  const rows = await db
    .select({
      price: schema.marketPrices.price,
      midpoint: schema.marketPrices.midpoint,
      bestBid: schema.marketPrices.bestBid,
      bestAsk: schema.marketPrices.bestAsk,
      at: schema.marketPrices.at,
    })
    .from(schema.marketPrices)
    .where(
      and(eq(schema.marketPrices.marketId, marketRowId), eq(schema.marketPrices.side, side)),
    )
    .orderBy(desc(schema.marketPrices.at))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
    price: r.price,
    midpoint: r.midpoint,
    bestBid: r.bestBid,
    bestAsk: r.bestAsk,
    at: r.at,
  };
}
