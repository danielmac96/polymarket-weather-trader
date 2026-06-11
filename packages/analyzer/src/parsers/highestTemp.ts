import type { ThresholdUnit, WeatherCondition } from '@pwa/shared';

/**
 * Parser for Polymarket daily highest-temperature markets.
 *
 * One Polymarket "market" (e.g. "Highest temperature in NYC on June 11?") is
 * a group of mutually exclusive bucket markets, one per outcome:
 *   "...be 84°F or below?"   → TEMPERATURE_BELOW  (Tmax ≤ 84)
 *   "...be 85°F?"            → TEMPERATURE_RANGE  (Tmax rounds to 85)
 *   "...be 86-87°F?"         → TEMPERATURE_RANGE  (86 ≤ Tmax ≤ 87)
 *   "...be 88°F or higher?"  → TEMPERATURE_ABOVE  (Tmax ≥ 88)
 * Buckets resolve on the rounded integer reading from the official station,
 * which the edge model accounts for with a ±0.5° continuity correction.
 */

export interface HighestTempBucket {
  condition: WeatherCondition;
  /** Lower bound (or the single threshold for ABOVE/BELOW). */
  threshold: number;
  /** Upper bound for TEMPERATURE_RANGE; equals threshold for exact buckets. */
  thresholdHigh: number | null;
  unit: ThresholdUnit;
}

export function isHighestTempQuestion(question: string): boolean {
  return /\bhighest\s+temp(?:erature)?\b/i.test(question);
}

function detectUnit(question: string): ThresholdUnit {
  return /°\s*C\b|celsius/i.test(question) ? 'C' : 'F';
}

const NUM = String.raw`(-?\d+(?:\.\d+)?)`;
const DEG = String.raw`\s*°?\s*[FC]?\b`;

export function parseHighestTempBucket(question: string): HighestTempBucket | null {
  if (!isHighestTempQuestion(question)) return null;
  const unit = detectUnit(question);

  const orAbove = question.match(
    new RegExp(`${NUM}${DEG}\\s*or\\s+(?:higher|above|more|greater|warmer)`, 'i'),
  );
  if (orAbove?.[1]) {
    return { condition: 'TEMPERATURE_ABOVE', threshold: Number(orAbove[1]), thresholdHigh: null, unit };
  }

  const orBelow = question.match(
    new RegExp(`${NUM}${DEG}\\s*or\\s+(?:lower|below|less|colder|cooler)`, 'i'),
  );
  if (orBelow?.[1]) {
    return { condition: 'TEMPERATURE_BELOW', threshold: Number(orBelow[1]), thresholdHigh: null, unit };
  }

  const between = question.match(
    new RegExp(`between\\s+${NUM}${DEG}\\s+and\\s+${NUM}`, 'i'),
  );
  if (between?.[1] && between[2]) {
    const lo = Number(between[1]);
    const hi = Number(between[2]);
    return {
      condition: 'TEMPERATURE_RANGE',
      threshold: Math.min(lo, hi),
      thresholdHigh: Math.max(lo, hi),
      unit,
    };
  }

  const dash = question.match(new RegExp(`${NUM}\\s*[-–]\\s*${NUM}\\s*°`, 'i'));
  if (dash?.[1] && dash[2]) {
    const lo = Number(dash[1]);
    const hi = Number(dash[2]);
    return {
      condition: 'TEMPERATURE_RANGE',
      threshold: Math.min(lo, hi),
      thresholdHigh: Math.max(lo, hi),
      unit,
    };
  }

  // Exact single-degree bucket: "be 85°F" / "be 85°?"
  const exact = question.match(new RegExp(`be\\s+${NUM}\\s*°`, 'i'));
  if (exact?.[1]) {
    const v = Number(exact[1]);
    return { condition: 'TEMPERATURE_RANGE', threshold: v, thresholdHigh: v, unit };
  }

  return null;
}

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/**
 * Extract the local calendar date the market resolves on, as YYYY-MM-DD.
 * Prefers an explicit "on <Month> <day>" in the question; the year comes from
 * endDate when available (these are daily markets, so endDate is on/just
 * after the target day). Falls back to endDate's UTC date.
 */
export function parseTargetDate(question: string, endDate: Date | null): string | null {
  const m = question.match(
    /\bon\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})\b/i,
  );
  if (m?.[1] && m[2]) {
    const month = MONTHS[m[1].toLowerCase()];
    const day = Number(m[2]);
    if (month && day >= 1 && day <= 31) {
      let year = endDate?.getUTCFullYear() ?? new Date().getUTCFullYear();
      // Guard the year boundary: a December market whose endDate already
      // rolled into January belongs to the previous year.
      if (endDate && month === 12 && endDate.getUTCMonth() === 0) year -= 1;
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  if (endDate) return endDate.toISOString().slice(0, 10);
  return null;
}
