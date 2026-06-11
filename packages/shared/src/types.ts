export const Region = {
  US: 'US',
  UK: 'UK',
  AU: 'AU',
  CA: 'CA',
} as const;
export type Region = (typeof Region)[keyof typeof Region];

export const WeatherCondition = {
  TEMPERATURE_ABOVE: 'TEMPERATURE_ABOVE',
  TEMPERATURE_BELOW: 'TEMPERATURE_BELOW',
  TEMPERATURE_RANGE: 'TEMPERATURE_RANGE',
  PRECIPITATION: 'PRECIPITATION',
  SNOW: 'SNOW',
  WIND: 'WIND',
  HURRICANE: 'HURRICANE',
} as const;
export type WeatherCondition = (typeof WeatherCondition)[keyof typeof WeatherCondition];

export const ThresholdUnit = {
  F: 'F',
  C: 'C',
  IN: 'in',
  MM: 'mm',
  MPH: 'mph',
} as const;
export type ThresholdUnit = (typeof ThresholdUnit)[keyof typeof ThresholdUnit];

export const MarketSide = {
  YES: 'YES',
  NO: 'NO',
} as const;
export type MarketSide = (typeof MarketSide)[keyof typeof MarketSide];

export const Decision = {
  TRADE: 'TRADE',
  WATCH: 'WATCH',
  SKIP: 'SKIP',
} as const;
export type Decision = (typeof Decision)[keyof typeof Decision];

export const TradeStatus = {
  OPEN: 'OPEN',
  CLOSED_MANUAL: 'CLOSED_MANUAL',
  RESOLVED_WIN: 'RESOLVED_WIN',
  RESOLVED_LOSS: 'RESOLVED_LOSS',
} as const;
export type TradeStatus = (typeof TradeStatus)[keyof typeof TradeStatus];

export const TradeSource = {
  AUTO: 'AUTO',
  MANUAL: 'MANUAL',
} as const;
export type TradeSource = (typeof TradeSource)[keyof typeof TradeSource];

export const MarketStatus = {
  ACTIVE: 'ACTIVE',
  CLOSED: 'CLOSED',
  RESOLVED: 'RESOLVED',
} as const;
export type MarketStatus = (typeof MarketStatus)[keyof typeof MarketStatus];

export interface Location {
  id?: string;
  region: Region;
  name: string;
  state?: string;
  lat: number;
  lng: number;
}

export interface Forecast {
  locationId: string;
  provider: string;
  forecastedAt: Date;
  validFrom: Date;
  validUntil: Date;
  tempC: number | null;
  tempF: number | null;
  precipMm: number | null;
  precipProb: number | null;
  windKph: number | null;
  weatherCode: string | null;
  payload: unknown;
}

/**
 * A provider's forecast of the daily maximum temperature for one calendar day
 * (in the location's local timezone). This is the model input for Polymarket
 * "highest temperature" markets — distinct from `Forecast`, which captures
 * current-hour conditions.
 */
export interface DailyHighForecast {
  locationId: string;
  provider: string;
  forecastedAt: Date;
  /** Local calendar date the max applies to, as YYYY-MM-DD. */
  targetDate: string;
  tempMaxC: number;
  tempMaxF: number;
  payload: unknown;
}

export interface LiveMarketPrice {
  marketId: string;
  tokenId: string;
  side: MarketSide;
  price: number;
  bestBid: number | null;
  bestAsk: number | null;
  midpoint: number | null;
  volume24hr: number | null;
  liquidity: number | null;
  at: Date;
}

export interface EdgeAnalysis {
  marketId: string;
  impliedProb: number;
  modelProb: number;
  edge: number;
  confidence: number;
  decision: Decision;
  reasoning: Record<string, unknown>;
}

export interface PaperTrade {
  id: string;
  marketId: string;
  analysisId: string | null;
  side: MarketSide;
  entryPrice: number;
  sizeUsd: number;
  sharesQty: number;
  status: TradeStatus;
  openedAt: Date;
  closedAt: Date | null;
  closePrice: number | null;
  realizedPnlUsd: number | null;
  source: TradeSource;
  notes: string | null;
}

export interface PortfolioSnapshot {
  at: Date;
  cashUsd: number;
  openPositionsCount: number;
  openExposureUsd: number;
  unrealizedPnlUsd: number;
  realizedPnlUsdToDate: number;
  totalEquityUsd: number;
  roiPct: number;
  winRatePct: number;
  totalTradesCount: number;
}
