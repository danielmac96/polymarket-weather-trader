import { z } from 'zod';

const booleanString = z
  .string()
  .transform((v) => v.toLowerCase() === 'true')
  .pipe(z.boolean());

const numberString = z.string().transform((v, ctx) => {
  const n = Number(v);
  if (!Number.isFinite(n)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Expected number, got "${v}"` });
    return z.NEVER;
  }
  return n;
});

const schema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'])
    .default('info'),

  NOAA_USER_AGENT: z
    .string()
    .default('polymarket-weather-app/0.1 (contact@example.com)'),

  EDGE_THRESHOLD: numberString.default('0.05'),
  MIN_MARKET_VOLUME_USD: numberString.default('500'),
  MIN_MARKET_LIQUIDITY_USD: numberString.default('200'),

  // Focus mode: restrict discovery/analysis to a single market family.
  // Default is the most liquid weather market: highest temperature in NYC.
  FOCUS_ENABLED: booleanString.default('true'),
  FOCUS_QUERY: z.string().default('highest temperature'),
  FOCUS_LOCATION: z.string().default('NYC'),

  PAPER_STARTING_BANKROLL_USD: numberString.default('1000'),
  MAX_PAPER_POSITION_USD: numberString.default('100'),

  // Growth sizing: fractional Kelly with per-position and total-exposure caps.
  KELLY_FRACTION: numberString.default('0.25'),
  MAX_POSITION_PCT: numberString.default('0.10'),
  MAX_TOTAL_EXPOSURE_PCT: numberString.default('0.60'),

  AUTO_PAPER_TRADE: booleanString.default('true'),
  LIVE_TRADING_ENABLED: booleanString.default('false'),
});

export type Config = z.infer<typeof schema>;

let cached: Config | null = null;

export function loadConfig(): Config {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  if (parsed.data.LIVE_TRADING_ENABLED) {
    throw new Error(
      'LIVE_TRADING_ENABLED must remain false for this MVP. Refusing to start.',
    );
  }
  cached = parsed.data;
  return cached;
}

export function resetConfigForTesting(): void {
  cached = null;
}
