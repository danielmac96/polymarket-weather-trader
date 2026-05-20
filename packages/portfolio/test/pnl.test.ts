import { describe, expect, it } from 'vitest';
import {
  computeManualClosePnl,
  computeRealizedPnl,
  computeUnrealizedPnl,
} from '../src/pnl.js';

describe('computeUnrealizedPnl', () => {
  it('YES side: profits when YES price rises above entry', () => {
    const pnl = computeUnrealizedPnl(
      { side: 'YES', entryPrice: 0.5, sharesQty: 100 },
      0.6,
    );
    expect(pnl).toBeCloseTo(10, 6);
  });

  it('YES side: loses when YES price falls', () => {
    const pnl = computeUnrealizedPnl(
      { side: 'YES', entryPrice: 0.5, sharesQty: 100 },
      0.4,
    );
    expect(pnl).toBeCloseTo(-10, 6);
  });

  it('NO side: profits when YES price falls (NO price rises)', () => {
    const pnl = computeUnrealizedPnl(
      { side: 'NO', entryPrice: 0.5, sharesQty: 100 },
      0.4,
    );
    expect(pnl).toBeCloseTo(10, 6);
  });

  it('zero PnL when current equals entry', () => {
    const pnl = computeUnrealizedPnl(
      { side: 'YES', entryPrice: 0.5, sharesQty: 100 },
      0.5,
    );
    expect(pnl).toBe(0);
  });
});

describe('computeRealizedPnl', () => {
  it('YES win pays (1 - entry) per share', () => {
    const pnl = computeRealizedPnl(
      { side: 'YES', entryPrice: 0.4, sharesQty: 100 },
      'WIN',
    );
    expect(pnl).toBeCloseTo(60, 6);
  });

  it('YES loss loses entry per share', () => {
    const pnl = computeRealizedPnl(
      { side: 'YES', entryPrice: 0.4, sharesQty: 100 },
      'LOSS',
    );
    expect(pnl).toBeCloseTo(-40, 6);
  });

  it('NO win pays (1 - entry) per share', () => {
    const pnl = computeRealizedPnl(
      { side: 'NO', entryPrice: 0.6, sharesQty: 100 },
      'WIN',
    );
    expect(pnl).toBeCloseTo(40, 6);
  });

  it('NO loss loses entry per share', () => {
    const pnl = computeRealizedPnl(
      { side: 'NO', entryPrice: 0.6, sharesQty: 100 },
      'LOSS',
    );
    expect(pnl).toBeCloseTo(-60, 6);
  });
});

describe('computeManualClosePnl', () => {
  it('matches unrealized at the close price', () => {
    const trade = { side: 'YES' as const, entryPrice: 0.5, sharesQty: 50 };
    expect(computeManualClosePnl(trade, 0.55)).toBe(computeUnrealizedPnl(trade, 0.55));
  });
});
