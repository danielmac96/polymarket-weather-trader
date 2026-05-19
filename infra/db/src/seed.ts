import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { sql } from 'drizzle-orm';
import { locations } from './schema.js';

interface SeedLocation {
  region: 'US' | 'UK' | 'AU' | 'CA';
  name: string;
  state: string;
  lat: number;
  lng: number;
}

const US_CITIES: SeedLocation[] = [
  { region: 'US', name: 'New York', state: 'NY', lat: 40.7128, lng: -74.006 },
  { region: 'US', name: 'Los Angeles', state: 'CA', lat: 34.0522, lng: -118.2437 },
  { region: 'US', name: 'Chicago', state: 'IL', lat: 41.8781, lng: -87.6298 },
  { region: 'US', name: 'Houston', state: 'TX', lat: 29.7604, lng: -95.3698 },
  { region: 'US', name: 'Phoenix', state: 'AZ', lat: 33.4484, lng: -112.074 },
  { region: 'US', name: 'Miami', state: 'FL', lat: 25.7617, lng: -80.1918 },
  { region: 'US', name: 'Dallas', state: 'TX', lat: 32.7767, lng: -96.797 },
  { region: 'US', name: 'Seattle', state: 'WA', lat: 47.6062, lng: -122.3321 },
  { region: 'US', name: 'Denver', state: 'CO', lat: 39.7392, lng: -104.9903 },
  { region: 'US', name: 'Atlanta', state: 'GA', lat: 33.749, lng: -84.388 },
];

export async function seed(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required to seed');
  const pool = new pg.Pool({ connectionString: url });
  const db = drizzle(pool);

  // eslint-disable-next-line no-console
  console.log(`→ seeding ${US_CITIES.length} US locations`);
  for (const c of US_CITIES) {
    await db
      .insert(locations)
      .values(c)
      .onConflictDoUpdate({
        target: [locations.region, locations.name, locations.state],
        set: { lat: c.lat, lng: c.lng, updatedAt: sql`now()` },
      });
  }

  const result = await db.execute<{ count: string }>(
    sql`select count(*)::text as count from locations where region = 'US'`,
  );
  // eslint-disable-next-line no-console
  console.log(`✓ seed complete — locations(US)=${result.rows[0]?.count ?? '?'}`);
  await pool.end();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seed().catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}
