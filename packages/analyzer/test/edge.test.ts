import { describe, expect, it } from 'vitest';
import type { Forecast } from '@pwa/shared';
import { computeEdge } from '../src/edge.js';

function forecast(provider: string, tempC: number): Forecast {
  return {
    locationId: 'loc-1',
    provider,
    forecastedAt: new Date(),
    validFrom: new Date(),
    validUntil: new Date(),
    tempC,
    tempF: (tempC * 9) / 5 + 32,
    precipMm: null,
    precipProb: null,
    windKph: null,
    weatherCode: null,
    payload: {},
  };
}

describe('computeEdge — TEMPERATURE_ABOVE', () => {
  it('reports positive edge when forecasts are well above threshold and market is uncertain', () => {
    const r = computeEdge({
      marketId: 'm1',
      question: 'will NYC be above 70F?',
      condition: 'TEMPERATURE_ABOVE',
      threshold: 70,
      thresholdUnit: 'F',
      endDate: new Date(Date.now() + 86400_000),
      impliedProb: 0.5,
      forecasts: [forecast('noaa', 28), forecast('open-meteo', 27)],
    });
    expect(r.modelProb).toBeGreaterThan(0.9);
    expect(r.edge).toBeGreaterThan(0.3);
    expect(r.confidence).toBeGreaterThan(0.5);
  });

  it('reports negative edge when forecasts are far below threshold', () => {
    const r = computeEdge({
      marketId: 'm2',
      question: 'will Phoenix exceed 120F?',
      condition: 'TEMPERATURE_ABOVE',
      threshold: 120,
      thresholdUnit: 'F',
      endDate: new Date(Date.now() + 86400_000),
      impliedProb: 0.5,
      forecasts: [forecast('noaa', 30), forecast('open-meteo', 31)],
    });
    expect(r.modelProb).toBeLessThan(0.1);
    expect(r.edge).toBeLessThan(-0.3);
  });

  it('lower confidence when providers disagree strongly', () => {
    const agree = computeEdge({
      marketId: 'a',
      question: 'q',
      condition: 'TEMPERATURE_ABOVE',
      threshold: 70,
      thresholdUnit: 'F',
      endDate: new Date(Date.now() + 86400_000),
      impliedProb: 0.5,
      forecasts: [forecast('noaa', 25), forecast('open-meteo', 25)],
    });
    const disagree = computeEdge({
      marketId: 'b',
      question: 'q',
      condition: 'TEMPERATURE_ABOVE',
      threshold: 70,
      thresholdUnit: 'F',
      endDate: new Date(Date.now() + 86400_000),
      impliedProb: 0.5,
      forecasts: [forecast('noaa', 18), forecast('open-meteo', 32)],
    });
    expect(disagree.confidence).toBeLessThan(agree.confidence);
  });
});

describe('computeEdge — TEMPERATURE_BELOW', () => {
  it('positive model prob when forecasts are well below threshold', () => {
    const r = computeEdge({
      marketId: 'm3',
      question: 'will Chicago drop below 32F?',
      condition: 'TEMPERATURE_BELOW',
      threshold: 32,
      thresholdUnit: 'F',
      endDate: new Date(Date.now() + 86400_000),
      impliedProb: 0.4,
      forecasts: [forecast('noaa', -10), forecast('open-meteo', -8)],
    });
    expect(r.modelProb).toBeGreaterThan(0.9);
    expect(r.edge).toBeGreaterThan(0.4);
  });
});
