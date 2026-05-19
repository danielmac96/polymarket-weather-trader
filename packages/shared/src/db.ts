import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '@pwa/db/schema';
import { loadConfig } from './config.js';

let pool: pg.Pool | null = null;
let db: NodePgDatabase<typeof schema> | null = null;

export function getDb(): NodePgDatabase<typeof schema> {
  if (db) return db;
  const cfg = loadConfig();
  pool = new pg.Pool({ connectionString: cfg.DATABASE_URL, max: 10 });
  db = drizzle(pool, { schema });
  return db;
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    db = null;
  }
}

export { schema };
export * from '@pwa/db/schema';
