import { describe, expect, it } from 'vitest';
import { isUsWeatherMarket, matchesFocus } from '../src/filters.js';

describe('isUsWeatherMarket', () => {
  it('matches real-feeling weather questions tied to a US location', () => {
    const yes = [
      'Will the high temperature in New York exceed 90°F on July 4?',
      'Will Phoenix temperature stay above 110°F all weekend?',
      'Will Florida receive a hurricane in 2026?',
      'Will it snow in Chicago, IL by November 15?',
      'Will Miami get 4 inches of rain this week?',
      'Will Denver see snowfall in October?',
    ];
    for (const q of yes) expect(isUsWeatherMarket(q), q).toBe(true);
  });

  it('rejects non-weather questions even in US cities', () => {
    expect(isUsWeatherMarket('Will the Dallas Cowboys win the Super Bowl?')).toBe(false);
    expect(isUsWeatherMarket('Who will win the New York mayoral race?')).toBe(false);
  });

  it('rejects weather questions outside the US', () => {
    expect(isUsWeatherMarket('Will London get a heatwave above 35°C in 2026?')).toBe(false);
    expect(isUsWeatherMarket('Will Tokyo see typhoon-strength winds in September?')).toBe(false);
  });
});

describe('matchesFocus', () => {
  it('matches highest-temp NYC bucket questions', () => {
    expect(
      matchesFocus(
        'Will the highest temperature in NYC on June 11 be 85°F?',
        'highest temperature',
        'NYC',
      ),
    ).toBe(true);
    expect(
      matchesFocus(
        'Will the highest temperature in New York on June 11 be 88°F or higher?',
        'highest temperature',
        'NYC',
      ),
    ).toBe(true);
  });

  it('rejects other locations and other market families', () => {
    expect(
      matchesFocus(
        'Will the highest temperature in Chicago on June 11 be 85°F?',
        'highest temperature',
        'NYC',
      ),
    ).toBe(false);
    expect(
      matchesFocus('Will it rain in NYC on June 11?', 'highest temperature', 'NYC'),
    ).toBe(false);
  });

  it('falls back to substring match for unaliased locations', () => {
    expect(
      matchesFocus(
        'Will the highest temperature in Denver on June 11 be 85°F?',
        'highest temperature',
        'Denver',
      ),
    ).toBe(true);
  });
});
