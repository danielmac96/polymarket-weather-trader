import { describe, expect, it } from 'vitest';
import { computeEdge, type EdgeInput } from '../src/edge.js';

function fToC(f: number): number {
  return ((f - 32) * 5) / 9;
}

function input(overrides: Partial<EdgeInput>): EdgeInput {
  return {
    marketId: 'm1',
    question: 'Will the highest temperature in NYC on June 11 be 85°F?',
    condition: 'TEMPERATURE_RANGE',
    threshold: 85,
    thresholdHigh: 85,
    thresholdUnit: 'F',
    endDate: new Date(Date.now() + 86400_000),
    impliedProb: 0.2,
    forecasts: [],
    isDailyHigh: true,
    leadDays: 0,
    ...overrides,
  };
}

describe('computeEdge — daily-high model', () => {
  it('prices an exact bucket near the forecast consensus high', () => {
    const r = computeEdge(
      input({
        dailyHighsC: [
          { provider: 'noaa', value: fToC(85) },
          { provider: 'open-meteo', value: fToC(85) },
        ],
      }),
    );
    // Consensus exactly at the bucket → it should be the modal outcome.
    expect(r.modelProb).toBeGreaterThan(0.2);
    expect(r.modelProb).toBeLessThan(0.6);
    expect(r.confidence).toBeGreaterThan(0.4);
  });

  it('gives a far-away bucket near-zero probability', () => {
    const r = computeEdge(
      input({
        threshold: 95,
        thresholdHigh: 95,
        dailyHighsC: [
          { provider: 'noaa', value: fToC(85) },
          { provider: 'open-meteo', value: fToC(85) },
        ],
      }),
    );
    expect(r.modelProb).toBeLessThan(0.02);
    expect(r.edge).toBeLessThan(-0.15);
  });

  it('prices tail buckets with ≥ / ≤ semantics', () => {
    const highs = [
      { provider: 'noaa', value: fToC(88) },
      { provider: 'open-meteo', value: fToC(88) },
    ];
    const above = computeEdge(
      input({ condition: 'TEMPERATURE_ABOVE', threshold: 88, thresholdHigh: null, dailyHighsC: highs }),
    );
    const below = computeEdge(
      input({ condition: 'TEMPERATURE_BELOW', threshold: 88, thresholdHigh: null, dailyHighsC: highs }),
    );
    // Consensus 88 → P(Tmax ≥ 88) and P(Tmax ≤ 88) both > 0.5 thanks to the
    // ±0.5° rounding correction, and they overlap only on the 88 bucket.
    expect(above.modelProb).toBeGreaterThan(0.5);
    expect(below.modelProb).toBeGreaterThan(0.5);
    expect(above.modelProb + below.modelProb).toBeGreaterThan(1);
  });

  it('range buckets across the ladder sum to ~1', () => {
    const highs = [
      { provider: 'noaa', value: fToC(85.5) },
      { provider: 'open-meteo', value: fToC(86.5) },
    ];
    const ladder = [
      input({ condition: 'TEMPERATURE_BELOW', threshold: 83, thresholdHigh: null, dailyHighsC: highs }),
      input({ threshold: 84, thresholdHigh: 85, dailyHighsC: highs }),
      input({ threshold: 86, thresholdHigh: 87, dailyHighsC: highs }),
      input({ condition: 'TEMPERATURE_ABOVE', threshold: 88, thresholdHigh: null, dailyHighsC: highs }),
    ];
    const total = ladder.reduce((acc, i) => acc + computeEdge(i).modelProb, 0);
    expect(total).toBeGreaterThan(0.99);
    expect(total).toBeLessThan(1.01);
  });

  it('widens sigma with lead time, flattening probabilities', () => {
    const highs = [{ provider: 'noaa', value: fToC(85) }, { provider: 'open-meteo', value: fToC(85) }];
    const today = computeEdge(input({ leadDays: 0, dailyHighsC: highs }));
    const threeOut = computeEdge(input({ leadDays: 3, dailyHighsC: highs }));
    expect(threeOut.modelProb).toBeLessThan(today.modelProb);
  });

  it('caps confidence for a single provider', () => {
    const one = computeEdge(input({ dailyHighsC: [{ provider: 'noaa', value: fToC(85) }] }));
    const two = computeEdge(
      input({
        dailyHighsC: [
          { provider: 'noaa', value: fToC(85) },
          { provider: 'open-meteo', value: fToC(85) },
        ],
      }),
    );
    expect(one.confidence).toBeLessThan(two.confidence);
    expect(one.confidence).toBeLessThanOrEqual(0.8);
  });

  it('defers to the market with zero confidence when no daily-max data exists', () => {
    const r = computeEdge(input({ dailyHighsC: [] }));
    expect(r.modelProb).toBe(0.2);
    expect(r.edge).toBe(0);
    expect(r.confidence).toBe(0);
  });
});
