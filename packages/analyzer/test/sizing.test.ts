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
    ...overrides,
  };
}

describe('computeKellySize', () => {
  it('sizes proportionally to edge (fractional Kelly)', () => {
    // p=0.6, c=0.5 → full Kelly = 0.2; quarter Kelly = 5% of $1000 = $50.
    const r = computeKellySize(base());
    expect(r.kellyFull).toBeCloseTo(0.2, 5);
    expect(r.sizeUsd).toBeCloseTo(50, 5);
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
    expect(r.reason).toContain('minimum');
  });

  it('never bets more than available cash', () => {
    const r = computeKellySize(
      base({ modelProbYes: 0.95, cashUsd: 20, openExposureUsd: 980, maxPositionUsd: 500 }),
    );
    expect(r.sizeUsd).toBeLessThanOrEqual(20);
  });

  it('rejects degenerate entry prices', () => {
    expect(computeKellySize(base({ entryPrice: 0 })).sizeUsd).toBe(0);
    expect(computeKellySize(base({ entryPrice: 1 })).sizeUsd).toBe(0);
  });
});
