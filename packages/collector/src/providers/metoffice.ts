import type { Forecast, Location, WeatherProvider } from '@pwa/shared';

// TODO(scale): implement for UK region.
export const metOfficeProvider: WeatherProvider = {
  name: 'metoffice',
  async fetch(_location: Location): Promise<Forecast> {
    throw new Error('metoffice provider not yet implemented');
  },
};
