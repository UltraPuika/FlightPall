import type { DepartureAirport, Destination, DestinationRegion } from '../domain/types';

/** Default departure airports. Additional costs are examples — edit them in Settings. */
export const DEFAULT_DEPARTURE_AIRPORTS: DepartureAirport[] = [
  { code: 'RIX', city: 'Riga', country: 'Latvia', countryCode: 'LV', timeZone: 'Europe/Riga', enabled: true, additionalCost: 0 },
  { code: 'TLL', city: 'Tallinn', country: 'Estonia', countryCode: 'EE', timeZone: 'Europe/Tallinn', enabled: true, additionalCost: 50, costNote: 'Bus Riga ⇄ Tallinn, per person' },
  { code: 'VNO', city: 'Vilnius', country: 'Lithuania', countryCode: 'LT', timeZone: 'Europe/Vilnius', enabled: true, additionalCost: 50, costNote: 'Bus Riga ⇄ Vilnius, per person' },
  { code: 'KUN', city: 'Kaunas', country: 'Lithuania', countryCode: 'LT', timeZone: 'Europe/Vilnius', enabled: true, additionalCost: 50, costNote: 'Bus Riga ⇄ Kaunas, per person' },
];

/** Other nearby airports a user can add with one click. */
export const EXTRA_DEPARTURE_AIRPORTS: Omit<DepartureAirport, 'enabled' | 'additionalCost'>[] = [
  { code: 'PLQ', city: 'Palanga', country: 'Lithuania', countryCode: 'LT', timeZone: 'Europe/Vilnius' },
  { code: 'HEL', city: 'Helsinki', country: 'Finland', countryCode: 'FI', timeZone: 'Europe/Helsinki' },
  { code: 'TAY', city: 'Tartu', country: 'Estonia', countryCode: 'EE', timeZone: 'Europe/Tallinn' },
  { code: 'GDN', city: 'Gdańsk', country: 'Poland', countryCode: 'PL', timeZone: 'Europe/Warsaw' },
  { code: 'WAW', city: 'Warsaw', country: 'Poland', countryCode: 'PL', timeZone: 'Europe/Warsaw' },
  { code: 'STO', city: 'Stockholm', country: 'Sweden', countryCode: 'SE', timeZone: 'Europe/Stockholm' },
];

type D = [code: string, city: string, country: string, cc: string, region: DestinationRegion, tz: string, airports: string[], continent?: Destination['continent']];

const RAW: D[] = [
  // Southern Europe
  ['ROM', 'Rome', 'Italy', 'IT', 'Southern Europe', 'Europe/Rome', ['FCO', 'CIA']],
  ['MIL', 'Milan', 'Italy', 'IT', 'Southern Europe', 'Europe/Rome', ['MXP', 'LIN', 'BGY']],
  ['VCE', 'Venice', 'Italy', 'IT', 'Southern Europe', 'Europe/Rome', ['VCE', 'TSF']],
  ['NAP', 'Naples', 'Italy', 'IT', 'Southern Europe', 'Europe/Rome', ['NAP']],
  ['BLQ', 'Bologna', 'Italy', 'IT', 'Southern Europe', 'Europe/Rome', ['BLQ']],
  ['PSA', 'Pisa', 'Italy', 'IT', 'Southern Europe', 'Europe/Rome', ['PSA']],
  ['CTA', 'Catania', 'Italy', 'IT', 'Southern Europe', 'Europe/Rome', ['CTA']],
  ['PMO', 'Palermo', 'Italy', 'IT', 'Southern Europe', 'Europe/Rome', ['PMO']],
  ['BRI', 'Bari', 'Italy', 'IT', 'Southern Europe', 'Europe/Rome', ['BRI']],
  ['BCN', 'Barcelona', 'Spain', 'ES', 'Southern Europe', 'Europe/Madrid', ['BCN']],
  ['MAD', 'Madrid', 'Spain', 'ES', 'Southern Europe', 'Europe/Madrid', ['MAD']],
  ['AGP', 'Málaga', 'Spain', 'ES', 'Southern Europe', 'Europe/Madrid', ['AGP']],
  ['ALC', 'Alicante', 'Spain', 'ES', 'Southern Europe', 'Europe/Madrid', ['ALC']],
  ['PMI', 'Palma de Mallorca', 'Spain', 'ES', 'Southern Europe', 'Europe/Madrid', ['PMI']],
  ['VLC', 'Valencia', 'Spain', 'ES', 'Southern Europe', 'Europe/Madrid', ['VLC']],
  ['TCI', 'Tenerife', 'Spain', 'ES', 'Southern Europe', 'Atlantic/Canary', ['TFS', 'TFN']],
  ['LPA', 'Gran Canaria', 'Spain', 'ES', 'Southern Europe', 'Atlantic/Canary', ['LPA']],
  ['LIS', 'Lisbon', 'Portugal', 'PT', 'Southern Europe', 'Europe/Lisbon', ['LIS']],
  ['OPO', 'Porto', 'Portugal', 'PT', 'Southern Europe', 'Europe/Lisbon', ['OPO']],
  ['FAO', 'Faro', 'Portugal', 'PT', 'Southern Europe', 'Europe/Lisbon', ['FAO']],
  ['FNC', 'Funchal (Madeira)', 'Portugal', 'PT', 'Southern Europe', 'Atlantic/Madeira', ['FNC']],
  ['ATH', 'Athens', 'Greece', 'GR', 'Southern Europe', 'Europe/Athens', ['ATH']],
  ['SKG', 'Thessaloniki', 'Greece', 'GR', 'Southern Europe', 'Europe/Athens', ['SKG']],
  ['HER', 'Heraklion (Crete)', 'Greece', 'GR', 'Southern Europe', 'Europe/Athens', ['HER']],
  ['RHO', 'Rhodes', 'Greece', 'GR', 'Southern Europe', 'Europe/Athens', ['RHO']],
  ['CFU', 'Corfu', 'Greece', 'GR', 'Southern Europe', 'Europe/Athens', ['CFU']],
  ['MLA', 'Malta', 'Malta', 'MT', 'Southern Europe', 'Europe/Malta', ['MLA']],
  // Western Europe
  ['PAR', 'Paris', 'France', 'FR', 'Western Europe', 'Europe/Paris', ['CDG', 'ORY', 'BVA']],
  ['NCE', 'Nice', 'France', 'FR', 'Western Europe', 'Europe/Paris', ['NCE']],
  ['LYS', 'Lyon', 'France', 'FR', 'Western Europe', 'Europe/Paris', ['LYS']],
  ['MRS', 'Marseille', 'France', 'FR', 'Western Europe', 'Europe/Paris', ['MRS']],
  ['AMS', 'Amsterdam', 'Netherlands', 'NL', 'Western Europe', 'Europe/Amsterdam', ['AMS']],
  ['EIN', 'Eindhoven', 'Netherlands', 'NL', 'Western Europe', 'Europe/Amsterdam', ['EIN']],
  ['BRU', 'Brussels', 'Belgium', 'BE', 'Western Europe', 'Europe/Brussels', ['BRU', 'CRL']],
  // British Isles
  ['LON', 'London', 'United Kingdom', 'GB', 'British Isles', 'Europe/London', ['LHR', 'LGW', 'STN', 'LTN', 'SEN']],
  ['MAN', 'Manchester', 'United Kingdom', 'GB', 'British Isles', 'Europe/London', ['MAN']],
  ['EDI', 'Edinburgh', 'United Kingdom', 'GB', 'British Isles', 'Europe/London', ['EDI']],
  ['DUB', 'Dublin', 'Ireland', 'IE', 'British Isles', 'Europe/Dublin', ['DUB']],
  // Central Europe
  ['BER', 'Berlin', 'Germany', 'DE', 'Central Europe', 'Europe/Berlin', ['BER']],
  ['FRA', 'Frankfurt', 'Germany', 'DE', 'Central Europe', 'Europe/Berlin', ['FRA']],
  ['MUC', 'Munich', 'Germany', 'DE', 'Central Europe', 'Europe/Berlin', ['MUC']],
  ['HAM', 'Hamburg', 'Germany', 'DE', 'Central Europe', 'Europe/Berlin', ['HAM']],
  ['DUS', 'Düsseldorf', 'Germany', 'DE', 'Central Europe', 'Europe/Berlin', ['DUS']],
  ['CGN', 'Cologne', 'Germany', 'DE', 'Central Europe', 'Europe/Berlin', ['CGN']],
  ['VIE', 'Vienna', 'Austria', 'AT', 'Central Europe', 'Europe/Vienna', ['VIE']],
  ['PRG', 'Prague', 'Czechia', 'CZ', 'Central Europe', 'Europe/Prague', ['PRG']],
  ['BUD', 'Budapest', 'Hungary', 'HU', 'Central Europe', 'Europe/Budapest', ['BUD']],
  ['WAW', 'Warsaw', 'Poland', 'PL', 'Central Europe', 'Europe/Warsaw', ['WAW', 'WMI']],
  ['KRK', 'Kraków', 'Poland', 'PL', 'Central Europe', 'Europe/Warsaw', ['KRK']],
  ['GDN', 'Gdańsk', 'Poland', 'PL', 'Central Europe', 'Europe/Warsaw', ['GDN']],
  ['ZRH', 'Zurich', 'Switzerland', 'CH', 'Central Europe', 'Europe/Zurich', ['ZRH']],
  ['GVA', 'Geneva', 'Switzerland', 'CH', 'Central Europe', 'Europe/Zurich', ['GVA']],
  // Nordics
  ['CPH', 'Copenhagen', 'Denmark', 'DK', 'Nordics', 'Europe/Copenhagen', ['CPH']],
  ['STO', 'Stockholm', 'Sweden', 'SE', 'Nordics', 'Europe/Stockholm', ['ARN', 'BMA', 'NYO']],
  ['GOT', 'Gothenburg', 'Sweden', 'SE', 'Nordics', 'Europe/Stockholm', ['GOT']],
  ['OSL', 'Oslo', 'Norway', 'NO', 'Nordics', 'Europe/Oslo', ['OSL', 'TRF']],
  ['BGO', 'Bergen', 'Norway', 'NO', 'Nordics', 'Europe/Oslo', ['BGO']],
  ['TOS', 'Tromsø', 'Norway', 'NO', 'Nordics', 'Europe/Oslo', ['TOS']],
  ['HEL', 'Helsinki', 'Finland', 'FI', 'Nordics', 'Europe/Helsinki', ['HEL']],
  ['RVN', 'Rovaniemi', 'Finland', 'FI', 'Nordics', 'Europe/Helsinki', ['RVN']],
  ['REK', 'Reykjavík', 'Iceland', 'IS', 'Nordics', 'Atlantic/Reykjavik', ['KEF']],
  // Balkans
  ['DBV', 'Dubrovnik', 'Croatia', 'HR', 'Balkans', 'Europe/Zagreb', ['DBV']],
  ['SPU', 'Split', 'Croatia', 'HR', 'Balkans', 'Europe/Zagreb', ['SPU']],
  ['ZAG', 'Zagreb', 'Croatia', 'HR', 'Balkans', 'Europe/Zagreb', ['ZAG']],
  ['LJU', 'Ljubljana', 'Slovenia', 'SI', 'Balkans', 'Europe/Ljubljana', ['LJU']],
  ['TIV', 'Tivat', 'Montenegro', 'ME', 'Balkans', 'Europe/Podgorica', ['TIV']],
  ['BEG', 'Belgrade', 'Serbia', 'RS', 'Balkans', 'Europe/Belgrade', ['BEG']],
  ['TIA', 'Tirana', 'Albania', 'AL', 'Balkans', 'Europe/Tirane', ['TIA']],
  ['SOF', 'Sofia', 'Bulgaria', 'BG', 'Balkans', 'Europe/Sofia', ['SOF']],
  ['BOJ', 'Burgas', 'Bulgaria', 'BG', 'Balkans', 'Europe/Sofia', ['BOJ']],
  ['VAR', 'Varna', 'Bulgaria', 'BG', 'Balkans', 'Europe/Sofia', ['VAR']],
  ['BUH', 'Bucharest', 'Romania', 'RO', 'Balkans', 'Europe/Bucharest', ['OTP']],
  // Eastern Europe
  ['KIV', 'Chișinău', 'Moldova', 'MD', 'Eastern Europe', 'Europe/Chisinau', ['KIV']],
  // Eastern Mediterranean
  ['IST', 'Istanbul', 'Türkiye', 'TR', 'Eastern Mediterranean', 'Europe/Istanbul', ['IST', 'SAW']],
  ['AYT', 'Antalya', 'Türkiye', 'TR', 'Eastern Mediterranean', 'Europe/Istanbul', ['AYT'], 'Asia'],
  ['LCA', 'Larnaca', 'Cyprus', 'CY', 'Eastern Mediterranean', 'Asia/Nicosia', ['LCA']],
  ['PFO', 'Paphos', 'Cyprus', 'CY', 'Eastern Mediterranean', 'Asia/Nicosia', ['PFO']],
  ['TBS', 'Tbilisi', 'Georgia', 'GE', 'Eastern Mediterranean', 'Asia/Tbilisi', ['TBS'], 'Asia'],
  // Beyond Europe (short/medium haul)
  ['TLV', 'Tel Aviv', 'Israel', 'IL', 'Middle East', 'Asia/Jerusalem', ['TLV'], 'Asia'],
  ['DXB', 'Dubai', 'United Arab Emirates', 'AE', 'Middle East', 'Asia/Dubai', ['DXB'], 'Asia'],
  ['RAK', 'Marrakesh', 'Morocco', 'MA', 'North Africa', 'Africa/Casablanca', ['RAK'], 'Africa'],
  ['HRG', 'Hurghada', 'Egypt', 'EG', 'North Africa', 'Africa/Cairo', ['HRG'], 'Africa'],
  ['SSH', 'Sharm el-Sheikh', 'Egypt', 'EG', 'North Africa', 'Africa/Cairo', ['SSH'], 'Africa'],
];

export const DESTINATIONS: Destination[] = RAW.map(([code, city, country, countryCode, region, timeZone, airports, continent]) => ({
  code,
  city,
  country,
  countryCode,
  region,
  timeZone,
  airports,
  continent: continent ?? 'Europe',
}));

const BY_CODE = new Map<string, Destination>();
for (const d of DESTINATIONS) {
  BY_CODE.set(d.code, d);
  for (const a of d.airports) if (!BY_CODE.has(a)) BY_CODE.set(a, d);
}

/** Resolve a city or airport code. Unknown codes return a placeholder rather than failing. */
export function findDestination(code: string): Destination {
  if (code === 'ANYWHERE')
    return { code, city: 'Anywhere', country: 'Any destination', countryCode: '', region: 'Other', continent: 'Europe', timeZone: 'UTC', airports: [] };
  return (
    BY_CODE.get(code) ?? {
      code,
      city: code,
      country: 'Unknown',
      countryCode: '',
      region: 'Other',
      continent: 'Europe',
      timeZone: 'UTC',
      airports: [code],
    }
  );
}

export function isKnownDestination(code: string): boolean {
  return BY_CODE.has(code);
}

export const REGIONS: DestinationRegion[] = Array.from(new Set(DESTINATIONS.map((d) => d.region)));

