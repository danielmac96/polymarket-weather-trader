import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig, resetConfigForTesting } from '../src/config.js';

const ORIGINAL_ENV = { ...process.env };

describe('loadConfig', () => {
  beforeEach(() => {
    resetConfigForTesting();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    resetConfigForTesting();
    process.env = { ...ORIGINAL_ENV };
  });

  it('throws when DATABASE_URL is missing', () => {
    delete process.env.DATABASE_URL;
    expect(() => loadConfig()).toThrow(/DATABASE_URL/);
  });

  it('parses with defaults when only DATABASE_URL is set', () => {
    process.env.DATABASE_URL = 'postgresql://x:y@localhost:5432/z';
    delete process.env.LIVE_TRADING_ENABLED;
    delete process.env.AUTO_PAPER_TRADE;
    delete process.env.EDGE_THRESHOLD;
    delete process.env.LOG_LEVEL;
    const cfg = loadConfig();
    expect(cfg.DATABASE_URL).toBe('postgresql://x:y@localhost:5432/z');
    expect(cfg.LOG_LEVEL).toBe('info');
    expect(cfg.EDGE_THRESHOLD).toBe(0.05);
    expect(cfg.AUTO_PAPER_TRADE).toBe(true);
    expect(cfg.LIVE_TRADING_ENABLED).toBe(false);
    expect(cfg.MAX_PAPER_POSITION_USD).toBe(50);
    expect(cfg.PAPER_STARTING_BANKROLL_USD).toBe(1000);
  });

  it('coerces numeric strings', () => {
    process.env.DATABASE_URL = 'postgresql://x:y@localhost:5432/z';
    process.env.EDGE_THRESHOLD = '0.1';
    process.env.MAX_PAPER_POSITION_USD = '25';
    const cfg = loadConfig();
    expect(cfg.EDGE_THRESHOLD).toBe(0.1);
    expect(cfg.MAX_PAPER_POSITION_USD).toBe(25);
  });

  it('refuses to start with LIVE_TRADING_ENABLED=true', () => {
    process.env.DATABASE_URL = 'postgresql://x:y@localhost:5432/z';
    process.env.LIVE_TRADING_ENABLED = 'true';
    expect(() => loadConfig()).toThrow(/LIVE_TRADING_ENABLED must remain false/);
  });
});
