import { describe, expect, it } from 'vitest';
import {
  isHighestTempQuestion,
  parseHighestTempBucket,
  parseTargetDate,
} from '../src/parsers/highestTemp.js';

describe('isHighestTempQuestion', () => {
  it('matches highest temperature phrasing', () => {
    expect(isHighestTempQuestion('Highest temperature in NYC on June 11?')).toBe(true);
    expect(
      isHighestTempQuestion('Will the highest temperature in NYC on June 11 be 85°F?'),
    ).toBe(true);
    expect(isHighestTempQuestion('Will it rain in NYC on June 11?')).toBe(false);
    expect(isHighestTempQuestion('Will NYC temperature exceed 90F?')).toBe(false);
  });
});

describe('parseHighestTempBucket', () => {
  it('parses "or higher" tail bucket', () => {
    const b = parseHighestTempBucket(
      'Will the highest temperature in NYC on June 11 be 88°F or higher?',
    );
    expect(b).toEqual({
      condition: 'TEMPERATURE_ABOVE',
      threshold: 88,
      thresholdHigh: null,
      unit: 'F',
    });
  });

  it('parses "or below" tail bucket', () => {
    const b = parseHighestTempBucket(
      'Will the highest temperature in NYC on June 11 be 84°F or below?',
    );
    expect(b).toEqual({
      condition: 'TEMPERATURE_BELOW',
      threshold: 84,
      thresholdHigh: null,
      unit: 'F',
    });
  });

  it('parses exact single-degree bucket as a range', () => {
    const b = parseHighestTempBucket(
      'Will the highest temperature in NYC on June 11 be 85°F?',
    );
    expect(b).toEqual({
      condition: 'TEMPERATURE_RANGE',
      threshold: 85,
      thresholdHigh: 85,
      unit: 'F',
    });
  });

  it('parses dash range bucket', () => {
    const b = parseHighestTempBucket(
      'Will the highest temperature in NYC on June 11 be 86-87°F?',
    );
    expect(b).toEqual({
      condition: 'TEMPERATURE_RANGE',
      threshold: 86,
      thresholdHigh: 87,
      unit: 'F',
    });
  });

  it('parses "between X and Y"', () => {
    const b = parseHighestTempBucket(
      'Will the highest temp in Chicago on July 4 be between 90°F and 92°F?',
    );
    expect(b).toEqual({
      condition: 'TEMPERATURE_RANGE',
      threshold: 90,
      thresholdHigh: 92,
      unit: 'F',
    });
  });

  it('detects celsius', () => {
    const b = parseHighestTempBucket(
      'Will the highest temperature in NYC on June 11 be 30°C or higher?',
    );
    expect(b?.unit).toBe('C');
  });

  it('returns null for non-highest-temp questions', () => {
    expect(parseHighestTempBucket('Will NYC temperature exceed 90F today?')).toBeNull();
  });
});

describe('parseTargetDate', () => {
  it('reads month/day from the question and year from endDate', () => {
    const d = parseTargetDate(
      'Will the highest temperature in NYC on June 11 be 85°F?',
      new Date('2026-06-12T03:00:00Z'),
    );
    expect(d).toBe('2026-06-11');
  });

  it('handles December markets whose endDate rolls into January', () => {
    const d = parseTargetDate(
      'Will the highest temperature in NYC on December 31 be 40°F?',
      new Date('2027-01-01T04:59:00Z'),
    );
    expect(d).toBe('2026-12-31');
  });

  it('falls back to endDate date when the question has no date', () => {
    const d = parseTargetDate(
      'Will the highest temperature in NYC be 85°F?',
      new Date('2026-06-11T22:00:00Z'),
    );
    expect(d).toBe('2026-06-11');
  });

  it('returns null with no date anywhere', () => {
    expect(parseTargetDate('Will the highest temperature in NYC be 85°F?', null)).toBeNull();
  });
});
