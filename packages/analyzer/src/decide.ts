import type { Decision } from '@pwa/shared';
import type { EdgeResult } from './edge.js';

export interface DecideInput {
  edge: EdgeResult;
  volume24hr: number | null;
  liquidity: number | null;
  endDate: Date | null;
  hasOpenTrade: boolean;
  edgeThreshold: number;
  minVolumeUsd: number;
  minLiquidityUsd: number;
  minConfidence: number;
  now: Date;
}

export function decide(input: DecideInput): Decision {
  const absEdge = Math.abs(input.edge.edge);
  const conf = input.edge.confidence;

  const meetsEdge = absEdge > input.edgeThreshold;
  const meetsVol = (input.volume24hr ?? 0) > input.minVolumeUsd;
  const meetsLiq = (input.liquidity ?? 0) > input.minLiquidityUsd;
  const meetsConf = conf > input.minConfidence;
  const futureEnd = input.endDate !== null && input.endDate.getTime() > input.now.getTime();
  const notDuplicate = !input.hasOpenTrade;

  if (meetsEdge && meetsVol && meetsLiq && meetsConf && futureEnd && notDuplicate) {
    return 'TRADE';
  }
  // Markets we already have an open position in are not actionable.
  if (!notDuplicate) return 'SKIP';
  // WATCH if we're within 50% of the edge threshold (and otherwise tradeable).
  if (
    absEdge > input.edgeThreshold * 0.5 &&
    meetsVol &&
    meetsLiq &&
    meetsConf &&
    futureEnd
  ) {
    return 'WATCH';
  }
  return 'SKIP';
}
