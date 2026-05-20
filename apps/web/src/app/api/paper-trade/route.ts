import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { getDb, loadConfig, schema, type MarketSide } from '@pwa/shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Body = z.object({
  marketId: z.string().min(1),
  side: z.enum(['YES', 'NO']),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  const { marketId, side } = parsed.data;
  const cfg = loadConfig();
  const db = getDb();

  // marketId here is the Postgres row id (uuid) we use throughout the UI.
  const open = await db
    .select({ id: schema.paperTrades.id })
    .from(schema.paperTrades)
    .where(
      and(
        eq(schema.paperTrades.marketId, marketId),
        eq(schema.paperTrades.status, 'OPEN'),
      ),
    )
    .limit(1);
  if (open.length > 0) {
    return NextResponse.json({ error: 'open trade already exists' }, { status: 409 });
  }

  const priceRows = await db
    .select({ midpoint: schema.marketPrices.midpoint, price: schema.marketPrices.price })
    .from(schema.marketPrices)
    .where(
      and(eq(schema.marketPrices.marketId, marketId), eq(schema.marketPrices.side, 'YES')),
    )
    .orderBy(desc(schema.marketPrices.at))
    .limit(1);
  const yesMid = priceRows[0]?.midpoint ?? priceRows[0]?.price ?? null;
  if (yesMid === null) {
    return NextResponse.json({ error: 'no live price for market' }, { status: 400 });
  }
  const entryPrice: number = side === 'YES' ? yesMid : 1 - yesMid;
  if (entryPrice <= 0 || entryPrice >= 1) {
    return NextResponse.json({ error: 'invalid entry price' }, { status: 400 });
  }
  const sizeUsd = cfg.MAX_PAPER_POSITION_USD;
  const sharesQty = sizeUsd / entryPrice;

  const inserted = await db
    .insert(schema.paperTrades)
    .values({
      marketId,
      side: side as MarketSide,
      entryPrice,
      sizeUsd,
      sharesQty,
      status: 'OPEN',
      source: 'MANUAL',
    })
    .returning({ id: schema.paperTrades.id });

  return NextResponse.json({ id: inserted[0]?.id, entryPrice, sizeUsd, sharesQty });
}
