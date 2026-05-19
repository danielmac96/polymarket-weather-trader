const WEATHER_KEYWORDS = [
  'temperature',
  'temp',
  'storm',
  'hurricane',
  'cyclone',
  'tornado',
  'snow',
  'snowfall',
  'rain',
  'rainfall',
  'heat',
  'cold',
  'precipitation',
  'precip',
  'weather',
  'blizzard',
];

const US_STATE_NAMES = [
  'alabama','alaska','arizona','arkansas','california','colorado','connecticut',
  'delaware','florida','georgia','hawaii','idaho','illinois','indiana','iowa',
  'kansas','kentucky','louisiana','maine','maryland','massachusetts','michigan',
  'minnesota','mississippi','missouri','montana','nebraska','nevada','new hampshire',
  'new jersey','new mexico','new york','north carolina','north dakota','ohio',
  'oklahoma','oregon','pennsylvania','rhode island','south carolina','south dakota',
  'tennessee','texas','utah','vermont','virginia','washington','west virginia',
  'wisconsin','wyoming',
];

const US_STATE_ABBR = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY',
];

const US_CITIES = [
  'new york','los angeles','chicago','houston','phoenix','miami','dallas',
  'seattle','denver','atlanta','boston','san francisco','san diego','austin',
  'philadelphia','detroit','minneapolis','tampa','orlando','las vegas',
  'portland','washington dc','st louis','kansas city','nashville','charlotte',
  'new orleans','salt lake city','sacramento','san jose','san antonio','indianapolis',
  'cleveland','baltimore','milwaukee','jacksonville',
];

const STATE_ABBR_PATTERN = new RegExp(
  `(^|[^A-Za-z])(${US_STATE_ABBR.join('|')})([^A-Za-z]|$)`,
);

export function isWeatherQuestion(question: string): boolean {
  const q = question.toLowerCase();
  return WEATHER_KEYWORDS.some((k) => q.includes(k));
}

export function isUsLocation(question: string): boolean {
  const lower = question.toLowerCase();
  if (US_STATE_NAMES.some((s) => lower.includes(s))) return true;
  if (US_CITIES.some((c) => lower.includes(c))) return true;
  // Match state abbreviations only as standalone tokens.
  if (STATE_ABBR_PATTERN.test(question)) return true;
  return false;
}

export function isUsWeatherMarket(question: string): boolean {
  return isWeatherQuestion(question) && isUsLocation(question);
}
