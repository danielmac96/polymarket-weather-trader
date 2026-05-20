import type {
  Location,
  MarketParser,
  ParsedThreshold,
  WeatherCondition,
} from '@pwa/shared';

interface CityEntry {
  display: string;
  state: string;
  patterns: RegExp[];
}

const US_STATES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina',
  ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee',
  TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

const SEED_CITIES: CityEntry[] = [
  { display: 'New York', state: 'NY', patterns: [/\bnew york\b/i, /\bnyc\b/i, /\bbuffalo\b/i] },
  { display: 'Los Angeles', state: 'CA', patterns: [/\blos angeles\b/i] },
  { display: 'Chicago', state: 'IL', patterns: [/\bchicago\b/i] },
  { display: 'Houston', state: 'TX', patterns: [/\bhouston\b/i] },
  { display: 'Phoenix', state: 'AZ', patterns: [/\bphoenix\b/i] },
  { display: 'Miami', state: 'FL', patterns: [/\bmiami\b/i] },
  { display: 'Florida', state: 'FL', patterns: [/\btampa\b/i, /\borlando\b/i, /\bjacksonville\b/i] },
  { display: 'Dallas', state: 'TX', patterns: [/\bdallas\b/i] },
  { display: 'Seattle', state: 'WA', patterns: [/\bseattle\b/i] },
  { display: 'Denver', state: 'CO', patterns: [/\bdenver\b/i] },
  { display: 'Atlanta', state: 'GA', patterns: [/\batlanta\b/i] },
  { display: 'San Francisco', state: 'CA', patterns: [/\bsan francisco\b/i] },
  { display: 'Portland', state: 'OR', patterns: [/\bportland\b/i] },
  { display: 'Salt Lake City', state: 'UT', patterns: [/\bsalt lake city\b/i] },
  { display: 'Nevada', state: 'NV', patterns: [/\blas vegas\b/i] },
  { display: 'Minnesota', state: 'MN', patterns: [/\bminneapolis\b/i, /\bst\.?\s*paul\b/i] },
  { display: 'Ohio', state: 'OH', patterns: [/\bcleveland\b/i, /\bcincinnati\b/i, /\bcolumbus\b/i] },
  { display: 'Massachusetts', state: 'MA', patterns: [/\bboston\b/i] },
  { display: 'North Carolina', state: 'NC', patterns: [/\bcharlotte\b/i, /\braleigh\b/i] },
];

function extractLocationFromQuestion(question: string): { name: string; state: string } | null {
  for (const c of SEED_CITIES) {
    for (const p of c.patterns) {
      if (p.test(question)) return { name: c.display, state: c.state };
    }
  }
  // State-name fallback. Match longest names first so "New York" wins over "York".
  const stateEntries = Object.entries(US_STATES).sort(
    (a, b) => b[1].length - a[1].length,
  );
  for (const [abbr, name] of stateEntries) {
    const re = new RegExp(`\\b${name}\\b`, 'i');
    if (re.test(question)) return { name, state: abbr };
  }
  // Abbreviation as standalone token (e.g. ", TX " or " NY?")
  for (const abbr of Object.keys(US_STATES)) {
    const re = new RegExp(`(^|[^A-Za-z])${abbr}([^A-Za-z]|$)`);
    if (re.test(question)) {
      const stateName = US_STATES[abbr];
      if (stateName) return { name: stateName, state: abbr };
    }
  }
  return null;
}

function extractCondition(question: string): WeatherCondition | null {
  const q = question.toLowerCase();
  if (/\b(hurricane|cyclone|tropical\s+storm)\b/.test(q)) return 'HURRICANE';
  if (/\b(snow|snowfall|blizzard)\b/.test(q)) return 'SNOW';
  if (/\b(rain|rainfall|precipitation|precip)\b/.test(q)) return 'PRECIPITATION';
  const tempKeyword = /\b(temp|temperature|degrees?|fahrenheit|celsius|heat|cold|freeze|freezing)\b|°/;
  if (/\b(below|under|less\s+than|lower\s+than|drop|drops|dropping)\b/.test(q) && tempKeyword.test(q)) {
    return 'TEMPERATURE_BELOW';
  }
  if (
    /\b(above|over|exceed|exceeds|hit|hits|reach|reaches|higher\s+than|greater\s+than|stay\s+above)\b/.test(q) &&
    tempKeyword.test(q)
  ) {
    return 'TEMPERATURE_ABOVE';
  }
  if (/\b(wind|gust|gusts)\b/.test(q)) return 'WIND';
  if (tempKeyword.test(q)) return 'TEMPERATURE_ABOVE';
  return null;
}

function extractThreshold(question: string): ParsedThreshold | null {
  // Temperature first — strongest signal.
  const tempMatch =
    question.match(/(-?\d+(?:\.\d+)?)\s*°?\s*F\b/i) ??
    question.match(/(-?\d+(?:\.\d+)?)\s*degrees?\s*(fahrenheit|f)\b/i);
  if (tempMatch?.[1]) return { value: Number(tempMatch[1]), unit: 'F' };

  const tempC = question.match(/(-?\d+(?:\.\d+)?)\s*°?\s*C\b/i);
  if (tempC?.[1]) return { value: Number(tempC[1]), unit: 'C' };

  // Inches of rain/snow.
  const inMatch = question.match(/(\d+(?:\.\d+)?)\s*(?:in|inch|inches|")\b/i);
  if (inMatch?.[1] && /rain|snow|precip/i.test(question)) {
    return { value: Number(inMatch[1]), unit: 'in' };
  }

  // Millimetres.
  const mmMatch = question.match(/(\d+(?:\.\d+)?)\s*mm\b/i);
  if (mmMatch?.[1]) return { value: Number(mmMatch[1]), unit: 'mm' };

  // Wind mph.
  const mphMatch = question.match(/(\d+(?:\.\d+)?)\s*mph\b/i);
  if (mphMatch?.[1]) return { value: Number(mphMatch[1]), unit: 'mph' };

  // Hurricane category as integer threshold.
  const cat = question.match(/category\s*(\d)/i);
  if (cat?.[1]) return { value: Number(cat[1]), unit: 'mph' };

  return null;
}

export const usParser: MarketParser = {
  extractLocation(question: string): Location | null {
    const found = extractLocationFromQuestion(question);
    if (!found) return null;
    return {
      region: 'US',
      name: found.name,
      state: found.state,
      lat: 0,
      lng: 0,
    };
  },
  extractCondition,
  extractThreshold,
};
