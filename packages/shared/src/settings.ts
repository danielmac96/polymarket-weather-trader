import { eq } from 'drizzle-orm';
import { getDb, schema } from './db.js';

/**
 * User-facing trading controls: a unit size (base bet in USD) and a risk
 * tolerance. Everything else the engine needs — Kelly fraction, exposure
 * caps, edge threshold, confidence floor — derives from the risk tolerance
 * via RISK_PROFILES. Stored in the single-row trading_settings table so the
 * dashboard can change them at runtime; the analyzer re-reads every cycle.
 */

export type RiskTolerance = 'LOW' | 'MEDIUM' | 'HIGH';

export interface RiskProfile {
  /** Fraction of the full-Kelly stake to bet. */
  kellyFraction: number;
  /** Max single position as a fraction of equity. */
  maxPositionPct: number;
  /** Max total open cost basis as a fraction of equity. */
  maxTotalExposurePct: number;
  /** Minimum model-vs-market edge to trigger a trade. */
  edgeThreshold: number;
  /** Minimum model confidence to trade. */
  minConfidence: number;
  /** Max units (multiples of unit size) in a single position. */
  maxUnitsPerTrade: number;
}

export const RISK_PROFILES: Record<RiskTolerance, RiskProfile> = {
  LOW: {
    kellyFraction: 0.15,
    maxPositionPct: 0.05,
    maxTotalExposurePct: 0.3,
    edgeThreshold: 0.08,
    minConfidence: 0.55,
    maxUnitsPerTrade: 2,
  },
  MEDIUM: {
    kellyFraction: 0.25,
    maxPositionPct: 0.1,
    maxTotalExposurePct: 0.6,
    edgeThreshold: 0.05,
    minConfidence: 0.4,
    maxUnitsPerTrade: 5,
  },
  HIGH: {
    kellyFraction: 0.5,
    maxPositionPct: 0.2,
    maxTotalExposurePct: 0.8,
    edgeThreshold: 0.04,
    minConfidence: 0.3,
    maxUnitsPerTrade: 10,
  },
};

export const UNIT_SIZE_MIN_USD = 1;
export const UNIT_SIZE_MAX_USD = 1000;

export interface TradingSettings {
  unitSizeUsd: number;
  riskTolerance: RiskTolerance;
  autoTradeEnabled: boolean;
  profile: RiskProfile;
  updatedAt: Date;
}

function toSettings(row: typeof schema.tradingSettings.$inferSelect): TradingSettings {
  return {
    unitSizeUsd: row.unitSizeUsd,
    riskTolerance: row.riskTolerance,
    autoTradeEnabled: row.autoTradeEnabled,
    profile: RISK_PROFILES[row.riskTolerance],
    updatedAt: row.updatedAt,
  };
}

export async function getTradingSettings(): Promise<TradingSettings> {
  const db = getDb();
  const rows = await db.select().from(schema.tradingSettings).limit(1);
  if (rows[0]) return toSettings(rows[0]);
  // The migration seeds row 1, but self-heal if it was deleted.
  await db.insert(schema.tradingSettings).values({ id: 1 }).onConflictDoNothing();
  const seeded = await db.select().from(schema.tradingSettings).limit(1);
  if (!seeded[0]) throw new Error('trading_settings row missing and could not be created');
  return toSettings(seeded[0]);
}

export interface TradingSettingsPatch {
  unitSizeUsd?: number | undefined;
  riskTolerance?: RiskTolerance | undefined;
  autoTradeEnabled?: boolean | undefined;
}

export async function updateTradingSettings(
  patch: TradingSettingsPatch,
): Promise<TradingSettings> {
  if (patch.unitSizeUsd !== undefined) {
    if (
      !Number.isFinite(patch.unitSizeUsd) ||
      patch.unitSizeUsd < UNIT_SIZE_MIN_USD ||
      patch.unitSizeUsd > UNIT_SIZE_MAX_USD
    ) {
      throw new Error(
        `unitSizeUsd must be between ${UNIT_SIZE_MIN_USD} and ${UNIT_SIZE_MAX_USD}`,
      );
    }
  }
  await getTradingSettings(); // ensure row exists
  const db = getDb();
  const set: Partial<typeof schema.tradingSettings.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (patch.unitSizeUsd !== undefined) set.unitSizeUsd = patch.unitSizeUsd;
  if (patch.riskTolerance !== undefined) set.riskTolerance = patch.riskTolerance;
  if (patch.autoTradeEnabled !== undefined) set.autoTradeEnabled = patch.autoTradeEnabled;
  const updated = await db
    .update(schema.tradingSettings)
    .set(set)
    .where(eq(schema.tradingSettings.id, 1))
    .returning();
  if (!updated[0]) throw new Error('failed to update trading_settings');
  return toSettings(updated[0]);
}
