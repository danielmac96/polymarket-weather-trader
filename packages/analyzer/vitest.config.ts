import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 10_000,
    env: {
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      LOG_LEVEL: 'silent',
    },
  },
});
