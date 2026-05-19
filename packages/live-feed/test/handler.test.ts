import { describe, expect, it, vi } from 'vitest';
import { ClobEvent, PriceHandler } from '../src/handler.js';

// Mock the DB module so handler.handle doesn't actually insert.
const insertedRows: Array<Record<string, unknown>> = [];
vi.mock('@pwa/shared', async () => {
  const actual = await vi.importActual<typeof import('@pwa/shared')>('@pwa/shared');
  return {
    ...actual,
    getDb: () => ({
      insert: () => ({
        values: (row: Record<string, unknown>) => {
          insertedRows.push(row);
          return Promise.resolve();
        },
      }),
    }),
  };
});

describe('ClobEvent schema', () => {
  it('parses price_change events', () => {
    const r = ClobEvent.safeParse({
      event_type: 'price_change',
      asset_id: 'tok-1',
      price: '0.55',
      timestamp: '1747654321000',
    });
    expect(r.success).toBe(true);
  });
  it('parses book events', () => {
    const r = ClobEvent.safeParse({
      event_type: 'book',
      asset_id: 'tok-1',
      bids: [{ price: '0.50', size: '100' }],
      asks: [{ price: '0.52', size: '100' }],
      timestamp: 1747654321000,
    });
    expect(r.success).toBe(true);
  });
  it('rejects unknown event types', () => {
    const r = ClobEvent.safeParse({ event_type: 'made_up', asset_id: 'tok-1' });
    expect(r.success).toBe(false);
  });
});

describe('PriceHandler', () => {
  it('parses ms-since-epoch timestamps', () => {
    const h = new PriceHandler();
    const d1 = h.parseTimestamp(1_747_654_321_000);
    expect(d1.getTime()).toBe(1_747_654_321_000);
  });

  it('parses seconds-since-epoch timestamps', () => {
    const h = new PriceHandler();
    const d = h.parseTimestamp(1_747_654_321);
    expect(d.getTime()).toBe(1_747_654_321_000);
  });

  it('parses ISO strings', () => {
    const h = new PriceHandler();
    const d = h.parseTimestamp('2026-05-19T12:00:00.000Z');
    expect(d.toISOString()).toBe('2026-05-19T12:00:00.000Z');
  });

  it('inserts a row for price_change events', async () => {
    insertedRows.length = 0;
    const h = new PriceHandler();
    h.registerToken('tok-1', { marketRowId: 'mkt-row-1', side: 'YES' });
    await h.handle({
      event_type: 'price_change',
      asset_id: 'tok-1',
      price: 0.55,
      timestamp: 1_747_654_321_000,
    });
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0]).toMatchObject({
      marketId: 'mkt-row-1',
      tokenId: 'tok-1',
      side: 'YES',
      price: 0.55,
      midpoint: 0.55,
    });
  });

  it('computes midpoint from book events', async () => {
    insertedRows.length = 0;
    const h = new PriceHandler();
    h.registerToken('tok-2', { marketRowId: 'mkt-row-2', side: 'NO' });
    await h.handle({
      event_type: 'book',
      asset_id: 'tok-2',
      bids: [{ price: 0.4, size: 100 }],
      asks: [{ price: 0.44, size: 100 }],
      timestamp: 1_747_654_321_000,
    });
    const row = insertedRows[0] as Record<string, number | string>;
    expect(row.marketId).toBe('mkt-row-2');
    expect(row.bestBid).toBe(0.4);
    expect(row.bestAsk).toBe(0.44);
    expect(row.midpoint).toBeCloseTo(0.42, 6);
    expect(row.price).toBeCloseTo(0.42, 6);
  });

  it('dedupes back-to-back same-price events within 250ms', async () => {
    insertedRows.length = 0;
    const h = new PriceHandler();
    h.registerToken('tok-3', { marketRowId: 'mkt-row-3', side: 'YES' });
    await h.handle({
      event_type: 'price_change',
      asset_id: 'tok-3',
      price: 0.6,
      timestamp: 1_000_000_000_000,
    });
    await h.handle({
      event_type: 'price_change',
      asset_id: 'tok-3',
      price: 0.6,
      timestamp: 1_000_000_000_100, // 100ms later, same price → skip
    });
    await h.handle({
      event_type: 'price_change',
      asset_id: 'tok-3',
      price: 0.6,
      timestamp: 1_000_000_000_500, // 500ms later, same price → accept
    });
    expect(insertedRows).toHaveLength(2);
  });

  it('ignores events for unknown tokens', async () => {
    insertedRows.length = 0;
    const h = new PriceHandler();
    await h.handle({
      event_type: 'price_change',
      asset_id: 'unknown-tok',
      price: 0.5,
      timestamp: 1_747_654_321_000,
    });
    expect(insertedRows).toHaveLength(0);
  });
});
