import type { Forecast, ThresholdUnit, WeatherCondition } from '@pwa/shared';

export interface ProviderObservation {
  provider: string;
  value: number;
}

export interface EdgeInput {
  marketId: string;
  question: string;
  condition: WeatherCondition;
  threshold: number;
  /** Upper bound for TEMPERATURE_RANGE buckets (same unit as threshold). */
  thresholdHigh?: number | null;
  thresholdUnit: ThresholdUnit;
  endDate: Date;
  impliedProb: number;
  forecasts: Forecast[];
  /** True for "highest temperature" markets — resolve on the daily max. */
  isDailyHigh?: boolean;
  /**
   * Daily-max temperature forecasts (°C, one per provider) for the market's
   * target date. When present, temperature conditions are evaluated against
   * the daily high instead of current-hour temps.
   */
  dailyHighsC?: ProviderObservation[];
  /** Whole days between now and the target date (0 = resolves today). */
  leadDays?: number;
}

export interface EdgeResult {
  impliedProb: number;
  modelProb: number;
  edge: number;
  confidence: number;
  reasoning: Record<string, unknown>;
}

// Standard normal CDF via the Abramowitz & Stegun erf approximation.
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * ax);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return sign * y;
}

function normalCdf(x: number, mu: number, sigma: number): number {
  if (sigma <= 0) return x >= mu ? 1 : 0;
  return 0.5 * (1 + erf((x - mu) / (sigma * Math.SQRT2)));
}

function unitToCelsius(value: number, unit: ThresholdUnit): number | null {
  if (unit === 'C') return value;
  if (unit === 'F') return ((value - 32) * 5) / 9;
  return null;
}

function unitToMm(value: number, unit: ThresholdUnit): number | null {
  if (unit === 'mm') return value;
  if (unit === 'in') return value * 25.4;
  return null;
}

function gatherTemps(forecasts: Forecast[]): ProviderObservation[] {
  return forecasts
    .filter((f) => f.tempC !== null)
    .map((f) => ({ provider: f.provider, value: f.tempC as number }));
}

function gatherPrecip(forecasts: Forecast[]): ProviderObservation[] {
  return forecasts
    .filter((f) => f.precipMm !== null)
    .map((f) => ({ provider: f.provider, value: f.precipMm as number }));
}

function meanStdev(obs: ProviderObservation[]): { mean: number; stdev: number } {
  if (obs.length === 0) return { mean: 0, stdev: 0 };
  const mean = obs.reduce((a, b) => a + b.value, 0) / obs.length;
  if (obs.length === 1) return { mean, stdev: 0 };
  const variance =
    obs.reduce((a, b) => a + (b.value - mean) ** 2, 0) / (obs.length - 1);
  return { mean, stdev: Math.sqrt(variance) };
}

/** Normalize provider stdev to a 0–1 confidence. Small disagreement = high confidence. */
function confidenceFromStdev(stdev: number, naturalSigma: number): number {
  const total = stdev + naturalSigma;
  if (total <= 0) return 0.5;
  const c = naturalSigma / total;
  return Math.max(0, Math.min(1, c));
}

const PRECIP_PROB_MEANS_PRECIPITATION = 0.5; // sanity fallback

const TEMP_CONDITIONS = new Set<WeatherCondition>([
  'TEMPERATURE_ABOVE',
  'TEMPERATURE_BELOW',
  'TEMPERATURE_RANGE',
]);

/**
 * Probability model for daily highest-temperature buckets.
 *
 * Tmax ~ Normal(mean of provider daily-max forecasts, sigma), where sigma is
 * the larger of provider disagreement and an irreducible forecast error that
 * grows with lead time (~0.9°C same-day, +0.45°C per day out).
 *
 * Buckets resolve on the rounded integer station reading, so each bound gets
 * a ±0.5° continuity correction in the question's unit:
 *   "≥ T"    → P(Tmax > T − 0.5)
 *   "≤ T"    → P(Tmax < T + 0.5)
 *   "[a, b]" → P(a − 0.5 < Tmax < b + 0.5)
 */
function dailyHighModel(input: EdgeInput, reasoning: Record<string, unknown>): {
  modelProb: number;
  confidence: number;
} {
  const obs = input.dailyHighsC as ProviderObservation[];
  const { mean, stdev } = meanStdev(obs);
  const leadDays = Math.max(0, input.leadDays ?? 0);
  const naturalSigma = 0.9 + 0.45 * leadDays;
  const sigma = Math.max(stdev, naturalSigma);

  const half = 0.5; // in the question's unit (buckets are integer-degree)
  const toC = (v: number): number =>
    input.thresholdUnit === 'F' ? ((v - 32) * 5) / 9 : v;

  let modelProb: number;
  if (input.condition === 'TEMPERATURE_ABOVE') {
    modelProb = 1 - normalCdf(toC(input.threshold - half), mean, sigma);
  } else if (input.condition === 'TEMPERATURE_BELOW') {
    modelProb = normalCdf(toC(input.threshold + half), mean, sigma);
  } else {
    const high = input.thresholdHigh ?? input.threshold;
    modelProb =
      normalCdf(toC(high + half), mean, sigma) -
      normalCdf(toC(input.threshold - half), mean, sigma);
  }

  // Provider agreement drives confidence; a single provider is capped so it
  // can never look certain.
  const agreement = confidenceFromStdev(stdev, naturalSigma);
  const countFactor = Math.min(1, 0.6 + 0.2 * obs.length);
  const confidence = agreement * countFactor;

  reasoning.model = 'daily-high-normal';
  reasoning.observations = obs;
  reasoning.modelInputs = { mean, stdev, sigma, leadDays, naturalSigma };
  return { modelProb, confidence };
}

export function computeEdge(input: EdgeInput): EdgeResult {
  const reasoning: Record<string, unknown> = {
    condition: input.condition,
    threshold: input.threshold,
    thresholdUnit: input.thresholdUnit,
    providerCount: input.forecasts.length,
    providers: input.forecasts.map((f) => f.provider),
  };

  let modelProb = 0.5;
  let confidence = 0;

  const isDailyHigh = input.isDailyHigh === true || input.condition === 'TEMPERATURE_RANGE';
  if (TEMP_CONDITIONS.has(input.condition) && isDailyHigh) {
    if (input.dailyHighsC && input.dailyHighsC.length > 0) {
      const r = dailyHighModel(input, reasoning);
      modelProb = r.modelProb;
      confidence = r.confidence;
    } else {
      // A daily-high market without daily-max forecasts: current-hour temps
      // are the wrong input, so defer to the market with zero confidence.
      reasoning.note = 'daily-high market but no daily-max forecasts yet';
      modelProb = input.impliedProb;
      confidence = 0;
    }
  } else if (input.condition === 'TEMPERATURE_ABOVE' || input.condition === 'TEMPERATURE_BELOW') {
    const thresholdC = unitToCelsius(input.threshold, input.thresholdUnit);
    if (thresholdC === null) {
      reasoning.note = 'threshold unit not temperature-compatible';
    } else {
      const obs = gatherTemps(input.forecasts);
      reasoning.observations = obs;
      reasoning.thresholdC = thresholdC;
      if (obs.length === 0) {
        reasoning.note = 'no temperature observations';
      } else {
        const { mean, stdev } = meanStdev(obs);
        // Floor sigma so a single provider doesn't make a deterministic prediction.
        const SIGMA_FLOOR_C = 1.5;
        const sigma = Math.max(stdev, SIGMA_FLOOR_C);
        const cdf = normalCdf(thresholdC, mean, sigma);
        modelProb = input.condition === 'TEMPERATURE_ABOVE' ? 1 - cdf : cdf;
        confidence = confidenceFromStdev(stdev, SIGMA_FLOOR_C);
        reasoning.modelInputs = { mean, stdev, sigma, cdf };
      }
    }
  } else if (input.condition === 'PRECIPITATION' || input.condition === 'SNOW') {
    const thresholdMm = unitToMm(input.threshold, input.thresholdUnit);
    if (thresholdMm === null) {
      reasoning.note = 'threshold unit not precipitation-compatible';
    } else {
      const obs = gatherPrecip(input.forecasts);
      reasoning.observations = obs;
      reasoning.thresholdMm = thresholdMm;
      if (obs.length === 0) {
        // Fall back to precipProb if available.
        const probs = input.forecasts
          .map((f) => f.precipProb)
          .filter((p): p is number => p !== null);
        if (probs.length > 0) {
          const meanProb = probs.reduce((a, b) => a + b, 0) / probs.length;
          modelProb = meanProb;
          confidence = 0.3;
          reasoning.note = 'using precipProb fallback';
          reasoning.modelInputs = { meanProb };
        } else {
          modelProb = PRECIP_PROB_MEANS_PRECIPITATION;
        }
      } else {
        const { mean, stdev } = meanStdev(obs);
        const SIGMA_FLOOR_MM = 2;
        const sigma = Math.max(stdev, SIGMA_FLOOR_MM);
        modelProb = 1 - normalCdf(thresholdMm, mean, sigma);
        confidence = confidenceFromStdev(stdev, SIGMA_FLOOR_MM);
        reasoning.modelInputs = { mean, stdev, sigma };
      }
    }
  } else if (input.condition === 'WIND') {
    const obs = input.forecasts
      .filter((f) => f.windKph !== null)
      .map((f) => ({ provider: f.provider, value: f.windKph as number }));
    reasoning.observations = obs;
    const thresholdKph =
      input.thresholdUnit === 'mph' ? input.threshold * 1.609344 : input.threshold;
    reasoning.thresholdKph = thresholdKph;
    if (obs.length > 0) {
      const { mean, stdev } = meanStdev(obs);
      const SIGMA_FLOOR_KPH = 5;
      const sigma = Math.max(stdev, SIGMA_FLOOR_KPH);
      modelProb = 1 - normalCdf(thresholdKph, mean, sigma);
      confidence = confidenceFromStdev(stdev, SIGMA_FLOOR_KPH);
      reasoning.modelInputs = { mean, stdev, sigma };
    }
  } else {
    // HURRICANE: rare-event default — confidence low, model defers to market.
    reasoning.note = 'hurricane: deferring to market with low confidence';
    modelProb = input.impliedProb;
    confidence = 0.1;
  }

  const edge = modelProb - input.impliedProb;
  return {
    impliedProb: input.impliedProb,
    modelProb,
    edge,
    confidence,
    reasoning,
  };
}

// TODO(scale): replace with ensemble model trained on outcome history.
