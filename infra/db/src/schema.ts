import { sql } from 'drizzle-orm';
import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const regionEnum = pgEnum('region', ['US', 'UK', 'AU', 'CA']);

export const weatherConditionEnum = pgEnum('weather_condition', [
  'TEMPERATURE_ABOVE',
  'TEMPERATURE_BELOW',
  'PRECIPITATION',
  'SNOW',
  'WIND',
  'HURRICANE',
]);

export const thresholdUnitEnum = pgEnum('threshold_unit', ['F', 'C', 'in', 'mm', 'mph']);

export const marketStatusEnum = pgEnum('market_status', ['ACTIVE', 'CLOSED', 'RESOLVED']);

export const marketSideEnum = pgEnum('market_side', ['YES', 'NO']);

export const decisionEnum = pgEnum('decision', ['TRADE', 'WATCH', 'SKIP']);

export const tradeStatusEnum = pgEnum('trade_status', [
  'OPEN',
  'CLOSED_MANUAL',
  'RESOLVED_WIN',
  'RESOLVED_LOSS',
]);

export const tradeSourceEnum = pgEnum('trade_source', ['AUTO', 'MANUAL']);

export const locations = pgTable(
  'locations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    region: regionEnum('region').notNull(),
    name: text('name').notNull(),
    state: text('state'),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    nameRegionIdx: uniqueIndex('locations_name_region_idx').on(t.region, t.name, t.state),
  }),
);

export const weatherForecasts = pgTable(
  'weather_forecasts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    forecastedAt: timestamp('forecasted_at', { withTimezone: true }).notNull(),
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull(),
    validUntil: timestamp('valid_until', { withTimezone: true }).notNull(),
    tempC: doublePrecision('temp_c'),
    tempF: doublePrecision('temp_f'),
    precipMm: doublePrecision('precip_mm'),
    precipProb: doublePrecision('precip_prob'),
    windKph: doublePrecision('wind_kph'),
    weatherCode: text('weather_code'),
    payload: jsonb('payload'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    locationProviderValidIdx: index('weather_forecasts_loc_provider_valid_idx').on(
      t.locationId,
      t.provider,
      t.validFrom,
    ),
  }),
);

export const polymarketMarkets = pgTable(
  'polymarket_markets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    marketId: text('market_id').notNull().unique(),
    question: text('question').notNull(),
    endDate: timestamp('end_date', { withTimezone: true }),
    clobTokenIdYes: text('clob_token_id_yes'),
    clobTokenIdNo: text('clob_token_id_no'),
    region: regionEnum('region'),
    parsedLocationId: uuid('parsed_location_id').references(() => locations.id, {
      onDelete: 'set null',
    }),
    parsedCondition: weatherConditionEnum('parsed_condition'),
    parsedThreshold: doublePrecision('parsed_threshold'),
    parsedThresholdUnit: thresholdUnitEnum('parsed_threshold_unit'),
    status: marketStatusEnum('status').notNull().default('ACTIVE'),
    resolvedOutcome: marketSideEnum('resolved_outcome'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    statusIdx: index('polymarket_markets_status_idx').on(t.status),
    endDateIdx: index('polymarket_markets_end_date_idx').on(t.endDate),
  }),
);

export const marketPrices = pgTable(
  'market_prices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    marketId: uuid('market_id')
      .notNull()
      .references(() => polymarketMarkets.id, { onDelete: 'cascade' }),
    tokenId: text('token_id').notNull(),
    side: marketSideEnum('side').notNull(),
    price: doublePrecision('price').notNull(),
    bestBid: doublePrecision('best_bid'),
    bestAsk: doublePrecision('best_ask'),
    midpoint: doublePrecision('midpoint'),
    volume24hr: doublePrecision('volume_24hr'),
    liquidity: doublePrecision('liquidity'),
    at: timestamp('at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    marketAtIdx: index('market_prices_market_at_idx').on(t.marketId, t.at.desc()),
    tokenAtIdx: index('market_prices_token_at_idx').on(t.tokenId, t.at.desc()),
  }),
);

export const marketAnalysis = pgTable(
  'market_analysis',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    marketId: uuid('market_id')
      .notNull()
      .references(() => polymarketMarkets.id, { onDelete: 'cascade' }),
    analyzedAt: timestamp('analyzed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    impliedProb: doublePrecision('implied_prob').notNull(),
    modelProb: doublePrecision('model_prob').notNull(),
    edge: doublePrecision('edge').notNull(),
    confidence: doublePrecision('confidence').notNull(),
    decision: decisionEnum('decision').notNull(),
    reasoning: jsonb('reasoning'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    marketAnalyzedIdx: index('market_analysis_market_analyzed_idx').on(
      t.marketId,
      t.analyzedAt.desc(),
    ),
  }),
);

export const paperTrades = pgTable(
  'paper_trades',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    marketId: uuid('market_id')
      .notNull()
      .references(() => polymarketMarkets.id, { onDelete: 'cascade' }),
    analysisId: uuid('analysis_id').references(() => marketAnalysis.id, {
      onDelete: 'set null',
    }),
    side: marketSideEnum('side').notNull(),
    entryPrice: doublePrecision('entry_price').notNull(),
    sizeUsd: doublePrecision('size_usd').notNull(),
    sharesQty: doublePrecision('shares_qty').notNull(),
    status: tradeStatusEnum('status').notNull().default('OPEN'),
    openedAt: timestamp('opened_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closePrice: doublePrecision('close_price'),
    realizedPnlUsd: doublePrecision('realized_pnl_usd'),
    source: tradeSourceEnum('source').notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    statusIdx: index('paper_trades_status_idx').on(t.status),
    marketStatusIdx: index('paper_trades_market_status_idx').on(t.marketId, t.status),
  }),
);

export const portfolioSnapshots = pgTable(
  'portfolio_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    cashUsd: doublePrecision('cash_usd').notNull(),
    openPositionsCount: integer('open_positions_count').notNull(),
    openExposureUsd: doublePrecision('open_exposure_usd').notNull(),
    unrealizedPnlUsd: doublePrecision('unrealized_pnl_usd').notNull(),
    realizedPnlUsdToDate: doublePrecision('realized_pnl_usd_to_date').notNull(),
    totalEquityUsd: doublePrecision('total_equity_usd').notNull(),
    roiPct: doublePrecision('roi_pct').notNull(),
    winRatePct: doublePrecision('win_rate_pct').notNull(),
    totalTradesCount: integer('total_trades_count').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    atIdx: index('portfolio_snapshots_at_idx').on(t.at.desc()),
  }),
);

export const _sqlMarker = sql;
