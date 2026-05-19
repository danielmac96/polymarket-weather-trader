import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate as drizzleMigrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

export async function migrate(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required to run migrations');
  const pool = new pg.Pool({ connectionString: url });
  const db = drizzle(pool);
  const here = dirname(fileURLToPath(import.meta.url));
  const migrationsFolder = resolve(here, '..', 'migrations');
  // eslint-disable-next-line no-console
  console.log(`→ running migrations from ${migrationsFolder}`);
  await drizzleMigrate(db, { migrationsFolder });
  await pool.end();
  // eslint-disable-next-line no-console
  console.log('✓ migrations complete');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate().catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}
