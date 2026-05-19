import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Location } from '@pwa/shared';
import { resetConfigForTesting } from '@pwa/shared';
import { noaaProvider } from '../src/providers/noaa.js';
import { openMeteoProvider } from '../src/providers/openMeteo.js';

const ORIGINAL_ENV = { ...process.env };

const NYC: Location = {
  id: '00000000-0000-0000-0000-000000000001',
  region: 'US',
  name: 'New York',
  state: 'NY',
  lat: 40.7128,
  lng: -74.006,
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('noaa provider', () => {
  beforeEach(() => {
    resetConfigForTesting();
    process.env = {
      ...ORIGINAL_ENV,
      DATABASE_URL: 'postgresql://x:y@localhost:5432/z',
      LOG_LEVEL: 'silent',
      NOAA_USER_AGENT: 'test/1.0 (test@example.com)',
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetConfigForTesting();
    process.env = { ...ORIGINAL_ENV };
  });

  it('parses a two-step NOAA response into a normalized Forecast', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json(200, {
          properties: {
            forecastHourly: 'https://api.weather.gov/gridpoints/OKX/33,35/forecast/hourly',
            forecast: 'https://api.weather.gov/gridpoints/OKX/33,35/forecast',
          },
        }),
      )
      .mockResolvedValueOnce(
        json(200, {
          properties: {
            generatedAt: '2026-05-19T12:00:00Z',
            periods: [
              {
                startTime: '2026-05-19T12:00:00-04:00',
                endTime: '2026-05-19T13:00:00-04:00',
                temperature: 72,
                temperatureUnit: 'F',
                probabilityOfPrecipitation: { value: 30 },
                windSpeed: '10 mph',
                shortForecast: 'Partly Cloudy',
              },
            ],
          },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const f = await noaaProvider.fetch(NYC);
    expect(f.provider).toBe('noaa');
    expect(f.locationId).toBe(NYC.id);
    expect(f.tempF).toBe(72);
    expect(f.tempC).toBeCloseTo(22.222, 2);
    expect(f.precipProb).toBe(0.3);
    expect(f.windKph).toBeCloseTo(16.09, 1);
    expect(f.weatherCode).toBe('Partly Cloudy');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws when /points returns invalid JSON shape', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(200, { wrong: 'shape' }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(noaaProvider.fetch(NYC)).rejects.toThrow();
  });
});

describe('open-meteo provider', () => {
  beforeEach(() => {
    resetConfigForTesting();
    process.env = {
      ...ORIGINAL_ENV,
      DATABASE_URL: 'postgresql://x:y@localhost:5432/z',
      LOG_LEVEL: 'silent',
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetConfigForTesting();
    process.env = { ...ORIGINAL_ENV };
  });

  it('parses Open-Meteo response into a normalized Forecast', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      json(200, {
        latitude: 40.71,
        longitude: -74.01,
        current: {
          time: '2026-05-19T12:00',
          temperature_2m: 20,
          precipitation: 0.1,
          wind_speed_10m: 15,
          weather_code: 3,
        },
        hourly: {
          time: ['2026-05-19T12:00', '2026-05-19T13:00'],
          temperature_2m: [20, 21],
          precipitation_probability: [25, 30],
          precipitation: [0.1, 0.0],
          wind_speed_10m: [15, 16],
          weather_code: [3, 2],
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const f = await openMeteoProvider.fetch(NYC);
    expect(f.provider).toBe('open-meteo');
    expect(f.locationId).toBe(NYC.id);
    expect(f.tempC).toBe(20);
    expect(f.tempF).toBe(68);
    expect(f.precipProb).toBe(0.25);
    expect(f.windKph).toBe(15);
    expect(f.weatherCode).toBe('3');
  });
});
