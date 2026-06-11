import type {
  DailyHighForecast,
  Forecast,
  Location,
  ThresholdUnit,
  WeatherCondition,
} from './types.js';

export interface WeatherProvider {
  readonly name: string;
  fetch(location: Location): Promise<Forecast>;
  /** Forecast daily-max temperatures for the next few local calendar days. */
  fetchDailyHighs?(location: Location): Promise<DailyHighForecast[]>;
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
