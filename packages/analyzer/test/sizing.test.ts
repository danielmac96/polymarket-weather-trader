import { describe, expect, it } from 'vitest';
import { computeKellySize, type SizeInput } from '../src/sizing.js';

function base(overrides: Partial<SizeInput> = {}): SizeInput {
  return {
    modelProbYes: 0.6,
    side: 'YES',
    entryPrice: 0.5,
    cashUsd: 1000,
    openExposureUsd: 0,
    kellyFraction: 0.25,
    maxPositionPct: 0.1,
    maxTotalExposurePct: 0.6,
    maxPositionUsd: 100,
    unitSizeUsd: 10,
    maxUnitsPerTrade: 100,
    ...overrides,
  };
}

describe('computeKellySize', () => {
  it('sizes proportionally to edge (fractional Kelly)', () => {
    // p=0.6, c=0.5 → full Kelly = 0.2; quarter Kelly = 5% of $1000 = $50.
    const r = computeKellySize(base());
    expect(r.kellyFull).toBeCloseTo(0.2, 5);
    expect(r.sizeUsd).toBeCloseTo(50, 5);
    expect(r.units).toBe(5);
  });

  it('declines when the model agrees with the market', () => {
    const r = computeKellySize(base({ modelProbYes: 0.5 }));
    expect(r.sizeUsd).toBe(0);
  });

  it('declines a NO bet when the model favors YES', () => {
    const r = computeKellySize(base({ side: 'NO', entryPrice: 0.5, modelProbYes: 0.6 }));
    expect(r.sizeUsd).toBe(0);
  });

  it('sizes a NO bet from the NO win probability', () => {
    // model YES=0.3 → NO wins with p=0.7 at NO price 0.5 → full Kelly 0.4.
    const r = computeKellySize(base({ side: 'NO', modelProbYes: 0.3, entryPrice: 0.5 }));
    expect(r.kellyFull).toBeCloseTo(0.4, 5);
    expect(r.sizeUsd).toBeCloseTo(100, 5); // 10% maxPositionPct binds
  });

  it('caps at maxPositionPct of equity', () => {
    // Huge edge → kelly would exceed 10%; clamp to 10% of $1000.
    const r = computeKellySize(base({ modelProbYes: 0.95, entryPrice: 0.5 }));
    expect(r.sizeUsd).toBeCloseTo(100, 5);
  });

  it('caps at the absolute USD backstop', () => {
    const r = computeKellySize(
      base({ modelProbYes: 0.95, cashUsd: 10_000, maxPositionUsd: 100 }),
    );
    expect(r.sizeUsd).toBe(100);
  });

  it('respects the total exposure cap', () => {
    // Equity 1000 (400 cash + 600 open), cap 60% → no room left.
    const r = computeKellySize(base({ cashUsd: 400, openExposureUsd: 600 }));
    expect(r.sizeUsd).toBe(0);
  });

  it('never bets more than available cash', () => {
    const r = computeKellySize(
      base({
        modelProbYes: 0.95,
        cashUsd: 20,
        openExposureUsd: 980,
        maxPositionUsd: 500,
      }),
    );
    expect(r.sizeUsd).toBeLessThanOrEqual(20);
  });

  it('rejects degenerate entry prices', () => {
    expect(computeKellySize(base({ entryPrice: 0 })).sizeUsd).toBe(0);
    expect(computeKellySize(base({ entryPrice: 1 })).sizeUsd).toBe(0);
  });

  it('quantizes the stake to whole units, flooring toward safety', () => {
    // Kelly target $50 with $15 units → 3 units = $45, never $60.
    const r = computeKellySize(base({ unitSizeUsd: 15 }));
    expect(r.units).toBe(3);
    expect(r.sizeUsd).toBe(45);
  });

  it('declines when the Kelly stake is below one unit', () => {
    // Kelly target $50 < $60 unit → no trade rather than over-betting.
    const r = computeKellySize(base({ unitSizeUsd: 60 }));
    expect(r.sizeUsd).toBe(0);
    expect(r.units).toBe(0);
    expect(r.reason).toContain('below one unit');
  });

  it('caps units at maxUnitsPerTrade', () => {
    // Kelly target $50 with $10 units → 5 units, but profile allows 2.
    const r = computeKellySize(base({ maxUnitsPerTrade: 2 }));
    expect(r.units).toBe(2);
    expect(r.sizeUsd).toBe(20);
  });

  it('rejects an invalid unit size', () => {
    expect(computeKellySize(base({ unitSizeUsd: 0 })).sizeUsd).toBe(0);
    expect(computeKellySize(base({ unitSizeUsd: -5 })).sizeUsd).toBe(0);
  });
});
