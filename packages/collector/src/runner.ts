import {
  createLogger,
  getDb,
  schema,
  type Forecast,
  type Location,
  type WeatherProvider,
} from '@pwa/shared';
import { providersFor } from './registry.js';

const log = createLogger('collector');

async function loadLocations(): Promise<Location[]> {
  const db = getDb();
  const rows = await db.select().from(schema.locations);
  return rows.map((r) => ({
    id: r.id,
    region: r.region,
    name: r.name,
    ...(r.state !== null ? { state: r.state } : {}),
    lat: r.lat,
    lng: r.lng,
  }));
}

async function fetchOne(
  provider: WeatherProvider,
  location: Location,
): Promise<Forecast | null> {
  try {
    const f = await provider.fetch(location);
    return f;
  } catch (err) {
    log.warn(
      { err: String(err), provider: provider.name, location: location.name },
      'provider fetch failed',
    );
    return null;
  }
}

export interface RunResult {
  attempted: number;
  inserted: number;
  failures: number;
}

export async function runCollectionOnce(): Promise<RunResult> {
  const startedAt = Date.now();
  const locations = await loadLocations();
  log.info({ count: locations.length }, 'starting collection');

  const tasks: Array<Promise<Forecast | null>> = [];
  for (const loc of locations) {
    for (const provider of providersFor(loc.region)) {
      tasks.push(fetchOne(provider, loc));
    }
  }

  const settled = await Promise.allSettled(tasks);
  const forecasts: Forecast[] = [];
  let failures = 0;
  for (const s of settled) {
    if (s.status === 'fulfilled' && s.value !== null) {
      forecasts.push(s.value);
    } else {
      failures++;
    }
  }

  if (forecasts.length > 0) {
    const db = getDb();
    await db.insert(schema.weatherForecasts).values(
      forecasts.map((f) => ({
        locationId: f.locationId,
        provider: f.provider,
        forecastedAt: f.forecastedAt,
        validFrom: f.validFrom,
        validUntil: f.validUntil,
        tempC: f.tempC,
        tempF: f.tempF,
        precipMm: f.precipMm,
        precipProb: f.precipProb,
        windKph: f.windKph,
        weatherCode: f.weatherCode,
        payload: f.payload,
      })),
    );
  }

  const result: RunResult = {
    attempted: tasks.length,
    inserted: forecasts.length,
    failures,
  };
  log.info({ ...result, durationMs: Date.now() - startedAt }, 'collection complete');
  return result;
}
