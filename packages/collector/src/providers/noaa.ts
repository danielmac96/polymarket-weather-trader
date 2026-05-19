import { z } from 'zod';
import {
  createLogger,
  fetchJson,
  loadConfig,
  type Forecast,
  type Location,
  type WeatherProvider,
} from '@pwa/shared';

const log = createLogger('noaa');

const PointsResponse = z.object({
  properties: z.object({
    forecastHourly: z.string().url(),
    forecast: z.string().url(),
    relativeLocation: z
      .object({ properties: z.object({ city: z.string(), state: z.string() }).partial() })
      .optional(),
  }),
});

const ForecastPeriod = z.object({
  startTime: z.string(),
  endTime: z.string(),
  temperature: z.number(),
  temperatureUnit: z.enum(['F', 'C']),
  probabilityOfPrecipitation: z
    .object({ value: z.number().nullable() })
    .nullable()
    .optional(),
  windSpeed: z.string().optional(),
  shortForecast: z.string().optional(),
});

const HourlyForecastResponse = z.object({
  properties: z.object({
    generatedAt: z.string(),
    periods: z.array(ForecastPeriod).min(1),
  }),
});

function parseWindKph(windSpeed: string | undefined): number | null {
  if (!windSpeed) return null;
  const match = windSpeed.match(/(\d+(?:\.\d+)?)/);
  if (!match || !match[1]) return null;
  const mph = Number(match[1]);
  if (!Number.isFinite(mph)) return null;
  return mph * 1.609344;
}

function fToC(f: number): number {
  return ((f - 32) * 5) / 9;
}
function cToF(c: number): number {
  return (c * 9) / 5 + 32;
}

export const noaaProvider: WeatherProvider = {
  name: 'noaa',
  async fetch(location: Location): Promise<Forecast> {
    if (!location.id) throw new Error('noaa.fetch requires location.id');
    const cfg = loadConfig();
    const headers = { 'User-Agent': cfg.NOAA_USER_AGENT };

    const lat = location.lat.toFixed(4);
    const lng = location.lng.toFixed(4);
    const pointsUrl = `https://api.weather.gov/points/${lat},${lng}`;
    log.debug({ pointsUrl, location: location.name }, 'noaa: fetching points');
    const points = await fetchJson(pointsUrl, PointsResponse, { headers });

    const hourly = await fetchJson(points.properties.forecastHourly, HourlyForecastResponse, {
      headers,
    });

    const first = hourly.properties.periods[0];
    if (!first) throw new Error('noaa: no forecast periods returned');

    const tempF = first.temperatureUnit === 'F' ? first.temperature : cToF(first.temperature);
    const tempC = first.temperatureUnit === 'C' ? first.temperature : fToC(first.temperature);
    const precipProb = first.probabilityOfPrecipitation?.value;

    return {
      locationId: location.id,
      provider: this.name,
      forecastedAt: new Date(hourly.properties.generatedAt),
      validFrom: new Date(first.startTime),
      validUntil: new Date(first.endTime),
      tempC,
      tempF,
      precipMm: null,
      precipProb: typeof precipProb === 'number' ? precipProb / 100 : null,
      windKph: parseWindKph(first.windSpeed),
      weatherCode: first.shortForecast ?? null,
      payload: { points: points.properties, period: first },
    };
  },
};
