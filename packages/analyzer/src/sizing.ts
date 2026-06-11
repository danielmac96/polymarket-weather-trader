import type { MarketSide } from '@pwa/shared';

/**
 * Growth-oriented position sizing: fractional Kelly.
 *
 * For a binary share bought at price c with believed win probability p, the
 * full-Kelly bankroll fraction is (p − c) / (1 − c). Full Kelly maximizes
 * long-run growth but assumes p is exactly right; we bet KELLY_FRACTION of it
 * (default 25%) to keep drawdowns survivable when the model is miscalibrated,
 * then clamp by per-position and total-exposure caps.
 */

export interface SizeInput {
  /** Model probability that YES wins. */
  modelProbYes: number;
  side: MarketSide;
  /** Price of the chosen side (probability, 0..1). */
  entryPrice: number;
  /** Free cash available right now. */
  cashUsd: number;
  /** Cost basis of currently open positions. */
  openExposureUsd: number;
  kellyFraction: number;
  /** Max single position as a fraction of equity (cash + open exposure). */
  maxPositionPct: number;
  /** Max total open cost basis as a fraction of equity. */
  maxTotalExposurePct: number;
  /** Absolute per-position backstop in USD. */
  maxPositionUsd: number;
}

export interface SizeResult {
  sizeUsd: number;
  kellyFull: number;
  reason: string;
}

const MIN_TRADE_USD = 1;

export function computeKellySize(i: SizeInput): SizeResult {
  const pWin = i.side === 'YES' ? i.modelProbYes : 1 - i.modelProbYes;
  const c = i.entryPrice;
  if (c <= 0 || c >= 1) {
    return { sizeUsd: 0, kellyFull: 0, reason: 'invalid entry price' };
  }

  const kellyFull = (pWin - c) / (1 - c);
  if (kellyFull <= 0) {
    return { sizeUsd: 0, kellyFull, reason: 'no positive edge at entry price' };
  }

  const equity = i.cashUsd + i.openExposureUsd;
  if (equity <= 0) {
    return { sizeUsd: 0, kellyFull, reason: 'no equity' };
  }

  const fraction = Math.min(kellyFull * i.kellyFraction, i.maxPositionPct);
  let size = equity * fraction;
  let reason = `kelly ${(kellyFull * 100).toFixed(1)}% × ${i.kellyFraction} of $${equity.toFixed(0)}`;

  if (size > i.maxPositionUsd) {
    size = i.maxPositionUsd;
    reason += ` (capped at $${i.maxPositionUsd})`;
  }

  const exposureRoom = i.maxTotalExposurePct * equity - i.openExposureUsd;
  if (size > exposureRoom) {
    size = Math.max(0, exposureRoom);
    reason += ' (exposure cap)';
  }
  if (size > i.cashUsd) {
    size = i.cashUsd;
    reason += ' (cash limit)';
  }

  if (size < MIN_TRADE_USD) {
    return { sizeUsd: 0, kellyFull, reason: 'size below minimum after caps' };
  }
  return { sizeUsd: size, kellyFull, reason };
}
