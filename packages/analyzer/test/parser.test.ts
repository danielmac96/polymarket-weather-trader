import { describe, expect, it } from 'vitest';
import { usParser } from '../src/parsers/usParser.js';

interface Fixture {
  q: string;
  location: { name: string; state: string } | null;
  condition: string | null;
  threshold: { value: number; unit: string } | null;
}

const FIXTURES: Fixture[] = [
  {
    q: 'Will the high temperature in New York exceed 90°F on July 4?',
    location: { name: 'New York', state: 'NY' },
    condition: 'TEMPERATURE_ABOVE',
    threshold: { value: 90, unit: 'F' },
  },
  {
    q: 'Will Phoenix temperature stay above 110°F all weekend?',
    location: { name: 'Phoenix', state: 'AZ' },
    condition: 'TEMPERATURE_ABOVE',
    threshold: { value: 110, unit: 'F' },
  },
  {
    q: 'Will Chicago see temperatures below 20°F on January 10?',
    location: { name: 'Chicago', state: 'IL' },
    condition: 'TEMPERATURE_BELOW',
    threshold: { value: 20, unit: 'F' },
  },
  {
    q: 'Will Miami get 4 inches of rain this week?',
    location: { name: 'Miami', state: 'FL' },
    condition: 'PRECIPITATION',
    threshold: { value: 4, unit: 'in' },
  },
  {
    q: 'Will Denver receive 6 inches of snow in October?',
    location: { name: 'Denver', state: 'CO' },
    condition: 'SNOW',
    threshold: { value: 6, unit: 'in' },
  },
  {
    q: 'Will Florida be hit by a hurricane in 2026?',
    location: { name: 'Florida', state: 'FL' },
    condition: 'HURRICANE',
    threshold: null,
  },
  {
    q: 'Will Texas see a tornado outbreak in May?',
    location: { name: 'Texas', state: 'TX' },
    condition: null,
    threshold: null,
  },
  {
    q: 'Will Los Angeles temperature reach 100°F in September?',
    location: { name: 'Los Angeles', state: 'CA' },
    condition: 'TEMPERATURE_ABOVE',
    threshold: { value: 100, unit: 'F' },
  },
  {
    q: 'Will Seattle get over 2 inches of rain on May 15?',
    location: { name: 'Seattle', state: 'WA' },
    condition: 'PRECIPITATION',
    threshold: { value: 2, unit: 'in' },
  },
  {
    q: 'Will Houston temperature exceed 95 degrees Fahrenheit?',
    location: { name: 'Houston', state: 'TX' },
    condition: 'TEMPERATURE_ABOVE',
    threshold: { value: 95, unit: 'F' },
  },
  {
    q: 'Will Atlanta drop below 32°F overnight?',
    location: { name: 'Atlanta', state: 'GA' },
    condition: 'TEMPERATURE_BELOW',
    threshold: { value: 32, unit: 'F' },
  },
  {
    q: 'Will Dallas exceed 100°F by Memorial Day?',
    location: { name: 'Dallas', state: 'TX' },
    condition: 'TEMPERATURE_ABOVE',
    threshold: { value: 100, unit: 'F' },
  },
  {
    q: 'Will NYC see 5 inches of snowfall before Christmas?',
    location: { name: 'New York', state: 'NY' },
    condition: 'SNOW',
    threshold: { value: 5, unit: 'in' },
  },
  {
    q: 'Will a Category 3 hurricane hit Louisiana this season?',
    location: { name: 'Louisiana', state: 'LA' },
    condition: 'HURRICANE',
    threshold: { value: 3, unit: 'mph' },
  },
  {
    q: 'Will wind gusts in Boston, MA exceed 60 mph in March?',
    location: { name: 'Massachusetts', state: 'MA' },
    condition: 'WIND',
    threshold: { value: 60, unit: 'mph' },
  },
  {
    q: 'Will Phoenix reach 115°F in July 2026?',
    location: { name: 'Phoenix', state: 'AZ' },
    condition: 'TEMPERATURE_ABOVE',
    threshold: { value: 115, unit: 'F' },
  },
  {
    q: 'Will Las Vegas temperature stay above 105°F for 7 days?',
    location: { name: 'Nevada', state: 'NV' },
    condition: 'TEMPERATURE_ABOVE',
    threshold: { value: 105, unit: 'F' },
  },
  {
    q: 'Will Minneapolis see snowfall before Halloween?',
    location: { name: 'Minnesota', state: 'MN' },
    condition: 'SNOW',
    threshold: null,
  },
  {
    q: 'Will California experience a heat wave above 110°F in August?',
    location: { name: 'California', state: 'CA' },
    condition: 'TEMPERATURE_ABOVE',
    threshold: { value: 110, unit: 'F' },
  },
  {
    q: 'Will Oklahoma have a tornado warning in April?',
    location: { name: 'Oklahoma', state: 'OK' },
    condition: null,
    threshold: null,
  },
  {
    q: 'Will Buffalo, NY get 12 inches of snow this week?',
    location: { name: 'New York', state: 'NY' },
    condition: 'SNOW',
    threshold: { value: 12, unit: 'in' },
  },
  {
    q: 'Will Tampa receive a tropical storm in August?',
    location: { name: 'Florida', state: 'FL' },
    condition: 'HURRICANE',
    threshold: null,
  },
  {
    q: 'Will San Francisco temperature drop below 50°F in July?',
    location: { name: 'San Francisco', state: 'CA' },
    condition: 'TEMPERATURE_BELOW',
    threshold: { value: 50, unit: 'F' },
  },
  {
    q: 'Will Portland precipitation exceed 3 inches in November?',
    location: { name: 'Portland', state: 'OR' },
    condition: 'PRECIPITATION',
    threshold: { value: 3, unit: 'in' },
  },
  {
    q: 'Will Charlotte, NC reach 95°F before June 1?',
    location: { name: 'North Carolina', state: 'NC' },
    condition: 'TEMPERATURE_ABOVE',
    threshold: { value: 95, unit: 'F' },
  },
  {
    q: 'Will Cleveland get measurable snow on Thanksgiving?',
    location: { name: 'Ohio', state: 'OH' },
    condition: 'SNOW',
    threshold: null,
  },
  {
    q: 'Will Salt Lake City temperature exceed 100°F in August 2026?',
    location: { name: 'Salt Lake City', state: 'UT' },
    condition: 'TEMPERATURE_ABOVE',
    threshold: { value: 100, unit: 'F' },
  },
];

describe('usParser fixtures', () => {
  it(`has at least 25 fixtures`, () => {
    expect(FIXTURES.length).toBeGreaterThanOrEqual(25);
  });

  for (const f of FIXTURES) {
    it(`parses: ${f.q}`, () => {
      const loc = usParser.extractLocation(f.q);
      if (f.location) {
        expect(loc).not.toBeNull();
        expect(loc?.name).toBe(f.location.name);
        expect(loc?.state).toBe(f.location.state);
      }
      const cond = usParser.extractCondition(f.q);
      expect(cond).toBe(f.condition);
      const t = usParser.extractThreshold(f.q);
      if (f.threshold === null) {
        expect(t).toBeNull();
      } else {
        expect(t).not.toBeNull();
        expect(t?.value).toBe(f.threshold.value);
        expect(t?.unit).toBe(f.threshold.unit);
      }
    });
  }
});
