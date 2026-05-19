import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLogger } from '../src/logger.js';
import { resetConfigForTesting } from '../src/config.js';

const ORIGINAL_ENV = { ...process.env };

describe('createLogger', () => {
  beforeEach(() => {
    resetConfigForTesting();
    process.env = { ...ORIGINAL_ENV, DATABASE_URL: 'postgresql://x:y@localhost:5432/z' };
  });

  afterEach(() => {
    resetConfigForTesting();
    process.env = { ...ORIGINAL_ENV };
  });

  it('returns a child logger with the component binding', () => {
    const log = createLogger('test-component');
    expect(log).toBeDefined();
    expect(typeof log.info).toBe('function');
    expect(typeof log.child).toBe('function');
    // pino exposes bindings via the bindings() method.
    expect(log.bindings()).toMatchObject({ component: 'test-component' });
  });
});
