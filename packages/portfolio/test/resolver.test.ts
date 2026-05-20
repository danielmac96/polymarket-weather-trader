import { describe, expect, it } from 'vitest';
import { deriveOutcome } from '../src/resolver.js';

describe('deriveOutcome', () => {
  it('returns null when market is not closed', () => {
    expect(deriveOutcome({ id: '1', closed: false, outcomePrices: ['1', '0'] })).toBeNull();
  });

  it('returns YES when outcomePrices = ["1", "0"]', () => {
    expect(
      deriveOutcome({ id: '1', closed: true, outcomePrices: ['1', '0'] }),
    ).toBe('YES');
  });

  it('returns NO when outcomePrices = ["0", "1"]', () => {
    expect(
      deriveOutcome({ id: '1', closed: true, outcomePrices: ['0', '1'] }),
    ).toBe('NO');
  });

  it('parses outcomePrices as JSON string', () => {
    expect(
      deriveOutcome({ id: '1', closed: true, outcomePrices: '["1", "0"]' }),
    ).toBe('YES');
  });

  it('returns null when prices are ambiguous', () => {
    expect(
      deriveOutcome({ id: '1', closed: true, outcomePrices: ['0.5', '0.5'] }),
    ).toBeNull();
  });

  it('returns null when prices are missing', () => {
    expect(deriveOutcome({ id: '1', closed: true })).toBeNull();
  });
});
