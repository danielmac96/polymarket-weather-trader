import pino, { type Logger } from 'pino';
import { loadConfig } from './config.js';

let root: Logger | null = null;

function getRoot(): Logger {
  if (root) return root;
  const cfg = loadConfig();
  root = pino({
    level: cfg.LOG_LEVEL,
    timestamp: pino.stdTimeFunctions.isoTime,
  });
  return root;
}

export function createLogger(component: string): Logger {
  return getRoot().child({ component });
}

export type { Logger };
