import cron from 'node-cron';
import { closeDb, createLogger } from '@pwa/shared';
import { runDiscoveryOnce } from './discovery.js';
import { buildTokenMap, PriceHandler } from './handler.js';
import { ClobWebSocketClient } from './websocket.js';

const log = createLogger('live-feed-main');

async function main(): Promise<void> {
  const handler = new PriceHandler();
  let knownTokens = new Set<string>();

  // Build initial token map and run discovery once before opening the socket.
  await runDiscoveryOnce().catch((err: unknown) => {
    log.warn({ err: String(err) }, 'initial discovery failed; continuing');
  });
  const tokenMap = await buildTokenMap();
  handler.setTokenMap(tokenMap);
  knownTokens = new Set(tokenMap.keys());
  log.info({ tokenCount: knownTokens.size }, 'initial token map');

  const client = new ClobWebSocketClient({
    handler,
    getActiveTokenIds: async () => {
      const m = await buildTokenMap();
      handler.setTokenMap(m);
      knownTokens = new Set(m.keys());
      return Array.from(m.keys());
    },
  });
  await client.start();

  // Discovery every 5 minutes; dynamically subscribe new tokens.
  cron.schedule('*/5 * * * *', () => {
    runDiscoveryOnce()
      .then(() => buildTokenMap())
      .then((m) => {
        handler.setTokenMap(m);
        for (const tokenId of m.keys()) {
          if (!knownTokens.has(tokenId)) {
            log.info({ tokenId }, 'new token discovered — subscribing');
            client.addToken(tokenId);
            knownTokens.add(tokenId);
          }
        }
      })
      .catch((err: unknown) => {
        log.error({ err: String(err) }, 'discovery refresh failed');
      });
  });

  const shutdown = (signal: string): void => {
    log.info({ signal }, 'shutting down');
    client.stop();
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
