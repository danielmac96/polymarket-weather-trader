import type { Region, WeatherProvider } from '@pwa/shared';
import { noaaProvider } from './providers/noaa.js';
import { openMeteoProvider } from './providers/openMeteo.js';

export interface ProviderRegistration {
  provider: WeatherProvider;
  regions: Region[];
}

export const ACTIVE_PROVIDERS: ProviderRegistration[] = [
  { provider: noaaProvider, regions: ['US'] },
  { provider: openMeteoProvider, regions: ['US', 'UK', 'AU', 'CA'] },
  // TODO(scale): { provider: metOfficeProvider, regions: ['UK'] },
];

export function providersFor(region: Region): WeatherProvider[] {
  return ACTIVE_PROVIDERS.filter((r) => r.regions.includes(region)).map((r) => r.provider);
}
