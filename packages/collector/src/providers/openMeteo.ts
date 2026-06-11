import { z } from 'zod';
import {
  createLogger,
  fetchJson,
  type DailyHighForecast,
  type Forecast,
  type Location,
  type WeatherProvider,
} from '@pwa/shared';

const log = createLogger('open-meteo');

const OpenMeteoResponse = z.object({
  latitude: z.number(),
  longitude: z.number(),
  generationtime_ms: z.number().optional(),
  current: z
    .object({
      time: z.string(),
      temperature_2m: z.number().nullable().optional(),
      precipitation: z.number().nullable().optional(),
      wind_speed_10m: z.number().nullable().optional(),
      weather_code: z.number().nullable().optional(),
    })
    .optional(),
  hourly: z
    .object({
      time: z.array(z.string()),
      temperature_2m: z.array(z.number().nullable()),
      precipitation_probability: z.array(z.number().nullable()).optional(),
      precipitation: z.array(z.number().nullable()).optional(),
      wind_speed_10m: z.array(z.number().nullable()).optional(),
      weather_code: z.array(z.number().nullable()).optional(),
    })
    .optional(),
});

function cToF(c: number): number {
  return (c * 9) / 5 + 32;
}

const OpenMeteoDailyResponse = z.object({
  daily: z.object({
    time: z.array(z.string()),
    temperature_2m_max: z.array(z.number().nullable()),
  }),
  timezone: z.string().optional(),
});

export const openMeteoProvider: WeatherProvider = {
  name: 'open-meteo',
  async fetch(location: Location): Promise<Forecast> {
    if (!location.id) throw new Error('open-meteo.fetch requires location.id');
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${location.lat}` +
      `&longitude=${location.lng}` +
      `&current=temperature_2m,precipitation,wind_speed_10m,weather_code` +
      `&hourly=temperature_2m,precipitation_probability,precipitation,wind_speed_10m,weather_code` +
      `&temperature_unit=celsius` +
      `&wind_speed_unit=kmh` +
      `&precipitation_unit=mm` +
      `&timezone=UTC` +
      `&forecast_days=2`;

    log.debug({ url, location: location.name }, 'open-meteo: fetching');
    const data = await fetchJson(url, OpenMeteoResponse);

    const now = new Date();
    const firstTimeStr = data.hourly?.time[0];
    const validFrom = firstTimeStr ? new Date(firstTimeStr + 'Z') : now;
    const lastTimeStr = data.hourly?.time[data.hourly.time.length - 1];
    const validUntil = lastTimeStr
      ? new Date(lastTimeStr + 'Z')
      : new Date(now.getTime() + 60 * 60 * 1000);

    const tempC = data.current?.temperature_2m ?? data.hourly?.temperature_2m?.[0] ?? null;
    const tempF = tempC !== null ? cToF(tempC) : null;
    const precipMm =
      data.current?.precipitation ?? data.hourly?.precipitation?.[0] ?? null;
    const precipProbPct = data.hourly?.precipitation_probability?.[0];
    const precipProb =
      typeof precipProbPct === 'number' ? precipProbPct / 100 : null;
    const windKph = data.current?.wind_speed_10m ?? data.hourly?.wind_speed_10m?.[0] ?? null;
    const code = data.current?.weather_code ?? data.hourly?.weather_code?.[0];

    return {
      locationId: location.id,
      provider: this.name,
      forecastedAt: now,
      validFrom,
      validUntil,
      tempC,
      tempF,
      precipMm,
      precipProb,
      windKph,
      weatherCode: typeof code === 'number' ? String(code) : null,
      payload: data,
    };
  },

  async fetchDailyHighs(location: Location): Promise<DailyHighForecast[]> {
    if (!location.id) throw new Error('open-meteo.fetchDailyHighs requires location.id');
    // timezone=auto so each daily max covers the location's local calendar
    // day — Polymarket highest-temp markets resolve on local days.
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${location.lat}` +
      `&longitude=${location.lng}` +
      `&daily=temperature_2m_max` +
      `&temperature_unit=celsius` +
      `&timezone=auto` +
      `&forecast_days=4`;

    log.debug({ url, location: location.name }, 'open-meteo: fetching daily highs');
    const data = await fetchJson(url, OpenMeteoDailyResponse);
    const now = new Date();

    const out: DailyHighForecast[] = [];
    data.daily.time.forEach((date, i) => {
      const maxC = data.daily.temperature_2m_max[i];
      if (maxC === null || maxC === undefined) return;
      out.push({
        locationId: location.id as string,
        provider: this.name,
        forecastedAt: now,
        targetDate: date,
        tempMaxC: maxC,
        tempMaxF: cToF(maxC),
        payload: { timezone: data.timezone ?? null },
      });
    });
    return out;
  },
};
