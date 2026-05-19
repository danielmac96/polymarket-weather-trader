import type { Forecast, Location, ThresholdUnit, WeatherCondition } from './types.js';

export interface WeatherProvider {
  readonly name: string;
  fetch(location: Location): Promise<Forecast>;
}

export interface ParsedThreshold {
  value: number;
  unit: ThresholdUnit;
}

export interface MarketParser {
  extractLocation(question: string): Location | null;
  extractCondition(question: string): WeatherCondition | null;
  extractThreshold(question: string): ParsedThreshold | null;
}
