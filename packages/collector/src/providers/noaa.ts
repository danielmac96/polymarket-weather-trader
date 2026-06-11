import { z } from 'zod';
import {
  createLogger,
  fetchJson,
  loadConfig,
  type DailyHighForecast,
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

// 12-hour forecast periods: daytime periods carry the day's high temperature.
const HalfDayPeriod = z.object({
  startTime: z.string(),
  isDaytime: z.boolean(),
  temperature: z.number(),
  temperatureUnit: z.enum(['F', 'C']),
  shortForecast: z.string().optional(),
});

const HalfDayForecastResponse = z.object({
  properties: z.object({
    generatedAt: z.string(),
    periods: z.array(HalfDayPeriod).min(1),
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

  async fetchDailyHighs(location: Location): Promise<DailyHighForecast[]> {
    if (!location.id) throw new Error('noaa.fetchDailyHighs requires location.id');
    const cfg = loadConfig();
    const headers = { 'User-Agent': cfg.NOAA_USER_AGENT };

    const lat = location.lat.toFixed(4);
    const lng = location.lng.toFixed(4);
    const pointsUrl = `https://api.weather.gov/points/${lat},${lng}`;
    const points = await fetchJson(pointsUrl, PointsResponse, { headers });

    const forecast = await fetchJson(points.properties.forecast, HalfDayForecastResponse, {
      headers,
    });

    const forecastedAt = new Date(forecast.properties.generatedAt);
    const out: DailyHighForecast[] = [];
    for (const p of forecast.properties.periods) {
      if (!p.isDaytime) continue;
      // startTime is local ISO with offset (e.g. 2026-06-11T06:00:00-04:00);
      // the date portion is the local calendar day.
      const targetDate = p.startTime.slice(0, 10);
      const tempF = p.temperatureUnit === 'F' ? p.temperature : cToF(p.temperature);
      out.push({
        locationId: location.id,
        provider: this.name,
        forecastedAt,
        targetDate,
        tempMaxC: fToC(tempF),
        tempMaxF: tempF,
        payload: { shortForecast: p.shortForecast ?? null },
      });
    }
    return out;
  },
};
