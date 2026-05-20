import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { getDb, schema } from '@pwa/shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(_req: Request, ctx: { params: { id: string } }) {
  const id = ctx.params.id;
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });
  const db = getDb();

  const tradeRows = await db
    .select({
      id: schema.paperTrades.id,
      marketId: schema.paperTrades.marketId,
      side: schema.paperTrades.side,
      entryPrice: schema.paperTrades.entryPrice,
      sharesQty: schema.paperTrades.sharesQty,
      status: schema.paperTrades.status,
    })
    .from(schema.paperTrades)
    .where(eq(schema.paperTrades.id, id))
    .limit(1);
  const trade = tradeRows[0];
  if (!trade) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (trade.status !== 'OPEN') {
    return NextResponse.json({ error: 'trade not open' }, { status: 409 });
  }

  const priceRows = await db
    .select({ midpoint: schema.marketPrices.midpoint, price: schema.marketPrices.price })
    .from(schema.marketPrices)
    .where(
      and(eq(schema.marketPrices.marketId, trade.marketId), eq(schema.marketPrices.side, 'YES')),
    )
    .orderBy(desc(schema.marketPrices.at))
    .limit(1);
  const yesMid = priceRows[0]?.midpoint ?? priceRows[0]?.price ?? null;
  if (yesMid === null) {
    return NextResponse.json({ error: 'no live price for market' }, { status: 400 });
  }
  const currentValue = trade.side === 'YES' ? yesMid : 1 - yesMid;
  const pnl = trade.sharesQty * (currentValue - trade.entryPrice);

  await db
    .update(schema.paperTrades)
    .set({
      status: 'CLOSED_MANUAL',
      closedAt: new Date(),
      closePrice: currentValue,
      realizedPnlUsd: pnl,
      updatedAt: new Date(),
    })
    .where(eq(schema.paperTrades.id, id));

  return NextResponse.json({ id, closePrice: currentValue, realizedPnlUsd: pnl });
}
