import type { MarketSide } from '@pwa/shared';

export interface OpenTrade {
  side: MarketSide;
  entryPrice: number;
  sharesQty: number;
}

/**
 * For paper trading: a YES share pays $1 if YES wins, $0 otherwise.
 * A NO share pays $1 if NO wins, $0 otherwise.
 * Entry price represents the share cost (always a probability 0..1 of the
 * chosen side). Current value of a YES position = currentYesPrice; of a NO
 * position = (1 - currentYesPrice). PnL is shares × (currentValue - entry).
 */
export function computeUnrealizedPnl(
  trade: OpenTrade,
  currentYesMidpoint: number,
): number {
  const currentValue = trade.side === 'YES' ? currentYesMidpoint : 1 - currentYesMidpoint;
  return trade.sharesQty * (currentValue - trade.entryPrice);
}

/**
 * Realized PnL on resolution.
 * Win: each share pays $1 → profit = (1 - entryPrice) × shares
 * Loss: each share pays $0 → loss  = -entryPrice × shares
 */
export function computeRealizedPnl(
  trade: OpenTrade,
  outcome: 'WIN' | 'LOSS',
): number {
  if (outcome === 'WIN') return (1 - trade.entryPrice) * trade.sharesQty;
  return -trade.entryPrice * trade.sharesQty;
}

/** Realized PnL on manual close: pay current value − entry, scaled by shares. */
export function computeManualClosePnl(
  trade: OpenTrade,
  currentYesMidpoint: number,
): number {
  return computeUnrealizedPnl(trade, currentYesMidpoint);
}
