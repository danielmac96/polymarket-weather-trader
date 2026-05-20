import { describe, expect, it } from 'vitest';
import { decide } from '../src/decide.js';

const baseEdge = {
  impliedProb: 0.5,
  modelProb: 0.7,
  edge: 0.2,
  confidence: 0.6,
  reasoning: {},
};

const futureDate = new Date(Date.now() + 86400_000);

const basis = {
  edge: baseEdge,
  volume24hr: 1000,
  liquidity: 500,
  endDate: futureDate,
  hasOpenTrade: false,
  edgeThreshold: 0.05,
  minVolumeUsd: 500,
  minLiquidityUsd: 200,
  minConfidence: 0.4,
  now: new Date(),
};

describe('decide', () => {
  it('TRADE when all gates pass', () => {
    expect(decide(basis)).toBe('TRADE');
  });
  it('SKIP if edge below threshold and not even within 50%', () => {
    expect(decide({ ...basis, edge: { ...baseEdge, edge: 0.01 } })).toBe('SKIP');
  });
  it('WATCH if within 50% of threshold but not over', () => {
    expect(decide({ ...basis, edge: { ...baseEdge, edge: 0.03 } })).toBe('WATCH');
  });
  it('SKIP if volume too low', () => {
    expect(decide({ ...basis, volume24hr: 100 })).toBe('SKIP');
  });
  it('SKIP if liquidity too low', () => {
    expect(decide({ ...basis, liquidity: 50 })).toBe('SKIP');
  });
  it('SKIP if confidence too low', () => {
    expect(decide({ ...basis, edge: { ...baseEdge, confidence: 0.1 } })).toBe('SKIP');
  });
  it('SKIP if endDate is null', () => {
    expect(decide({ ...basis, endDate: null })).toBe('SKIP');
  });
  it('SKIP if endDate is past', () => {
    expect(decide({ ...basis, endDate: new Date(Date.now() - 86400_000) })).toBe('SKIP');
  });
  it('SKIP if an open trade exists already', () => {
    expect(decide({ ...basis, hasOpenTrade: true })).toBe('SKIP');
  });
});
