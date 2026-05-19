import cron from 'node-cron';
import { closeDb, createLogger } from '@pwa/shared';
import { runCollectionOnce } from './runner.js';

const log = createLogger('collector-main');

async function main(): Promise<void> {
  const once = process.argv.includes('--once');

  if (once) {
    try {
      const result = await runCollectionOnce();
      log.info({ result }, 'one-shot collection done');
      await closeDb();
      process.exit(0);
    } catch (err) {
      log.error({ err: String(err) }, 'one-shot collection failed');
      await closeDb();
      process.exit(1);
    }
  }

  const schedule = '*/10 * * * *';
  log.info({ schedule }, 'starting cron');
  cron.schedule(schedule, () => {
    runCollectionOnce().catch((err: unknown) => {
      log.error({ err: String(err) }, 'cron collection failed');
    });
  });

  // Run once on startup so the first window of data lands immediately.
  runCollectionOnce().catch((err: unknown) => {
    log.error({ err: String(err) }, 'initial collection failed');
  });

  const shutdown = (signal: string): void => {
    log.info({ signal }, 'shutting down');
    closeDb()
      .catch(() => undefined)
      .finally(() => process.exit(0));
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err: unknown) => {
  log.error({ err: String(err) }, 'fatal');
  process.exit(1);
});
