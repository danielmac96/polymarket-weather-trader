import cron from 'node-cron';
import { closeDb, createLogger } from '@pwa/shared';
import { runResolverOnce } from './resolver.js';
import { writeSnapshotOnce } from './snapshots.js';

const log = createLogger('portfolio-main');

async function tick(): Promise<void> {
  try {
    await runResolverOnce();
  } catch (err) {
    log.error({ err: String(err) }, 'resolver failed');
  }
  try {
    await writeSnapshotOnce();
  } catch (err) {
    log.error({ err: String(err) }, 'snapshot failed');
  }
}

async function main(): Promise<void> {
  const once = process.argv.includes('--once');
  if (once) {
    await tick();
    await closeDb();
    process.exit(0);
  }

  const schedule = '*/5 * * * *';
  log.info({ schedule }, 'starting cron');
  cron.schedule(schedule, () => {
    tick().catch((err: unknown) => log.error({ err: String(err) }, 'tick failed'));
  });

  tick().catch((err: unknown) => log.error({ err: String(err) }, 'initial tick failed'));

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
