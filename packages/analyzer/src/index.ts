import cron from 'node-cron';
import { closeDb, createLogger } from '@pwa/shared';
import { runAnalysisOnce } from './runner.js';

const log = createLogger('analyzer-main');

async function main(): Promise<void> {
  const once = process.argv.includes('--once');
  if (once) {
    try {
      const r = await runAnalysisOnce();
      log.info({ result: r }, 'one-shot analysis done');
      await closeDb();
      process.exit(0);
    } catch (err) {
      log.error({ err: String(err) }, 'one-shot analysis failed');
      await closeDb();
      process.exit(1);
    }
  }

  const schedule = '*/2 * * * *';
  log.info({ schedule }, 'starting cron');
  cron.schedule(schedule, () => {
    runAnalysisOnce().catch((err: unknown) => {
      log.error({ err: String(err) }, 'cron analysis failed');
    });
  });

  runAnalysisOnce().catch((err: unknown) => {
    log.error({ err: String(err) }, 'initial analysis failed');
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
