import type { IsoDate, Weekday } from '../lib/dates';

// ---------------------------------------------------------------------------
// Airports
// ---------------------------------------------------------------------------

export interface DepartureAirport {
  /** IATA airport code, e.g. RIX */
  code: string;
  city: string;
  country: string;
  countryCode: string;
  timeZone: string;
  enabled: boolean;
  /**
   * Extra cost (EUR) of getting to/from this airport — bus, fuel, parking, a night
   * in a hotel. May be zero or negative (e.g. if a friend drives you).
   */
  additionalCost: number;
  /** Optional free-text note (e.g. "Lux Express return + parking") */
  costNote?: string;
}

export interface Destination {
  /** IATA city/metropolitan code as used by fare providers (ROM, LON, PAR...) */
  code: string;
  city: string;
  country: string;
  countryCode: string;
  region: DestinationRegion;
  continent: 'Europe' | 'Asia' | 'Africa' | 'North America';
  timeZone: string;
  /** Airport codes belonging to this city */
  airports: string[];
}

export type DestinationRegion =
  | 'Nordics'
  | 'Baltics'
  | 'Western Europe'
  | 'Central Europe'
  | 'Southern Europe'
  | 'Eastern Europe'
  | 'Balkans'
  | 'British Isles'
  | 'Eastern Mediterranean'
  | 'Middle East'
  | 'North Africa'
  | 'Other';

// ---------------------------------------------------------------------------
// Holiday calendar
// ---------------------------------------------------------------------------

export type CalendarEventType =
  /** Official public holiday (svētku diena) — a day off for everyone */
  | 'public_holiday'
  /** Holiday moved by statute, e.g. 4 May falling on a weekend → next Monday is off */
  | 'transferred_holiday'
  /** A working day moved away by Cabinet order — a day off (state/municipal institutions only) */
  | 'transferred_day_off'
  /** A weekend day that becomes a working day by Cabinet order (state/municipal only) */
  | 'transferred_working_day'
  /** Pre-holiday working day, shortened by one hour (Labour Law s.135) — still a working day */
  | 'shortened_day'
  /** Commemoration / observance day — not a day off */
  | 'observance'
  /** User-configured personal day off */
  | 'personal_day_off';

export type CalendarScope = 'all' | 'state_municipal';
export type VerificationStatus = 'official' | 'computed' | 'unverified';

export interface CalendarEntry {
  id: string;
  date: IsoDate;
  type: CalendarEventType;
  name: string;
  nameLocal?: string;
  /** Who the entry applies to */
  scope: CalendarScope;
  jurisdiction: 'LV';
  year: number;
  status: VerificationStatus;
  source: string;
  sourceUrl?: string;
  note?: string;
  /** For transfers: the paired date (the working day moved to / from) */
  pairedDate?: IsoDate;
}

export type EmploymentProfile = 'private' | 'state_municipal' | 'custom';

export type DayOverrideKind = 'day_off' | 'working_day' | 'shortened_day';

export interface DayOverride {
  date: IsoDate;
  kind: DayOverrideKind;
  note?: string;
}

/** Fully-resolved classification of a single date for a particular user. */
export interface DayInfo {
  date: IsoDate;
  weekday: Weekday;
  /** True when the user would be expected to work this day */
  isWorkingDay: boolean;
  /** True for a working day with shortened hours */
  isShortened: boolean;
  /** Why the day has its status (most significant reason first) */
  reasons: DayReason[];
  /** Calendar entries for the date that were applied to the user */
  entries: CalendarEntry[];
  /** Calendar entries that exist but do not apply under the current profile */
  ignoredEntries: CalendarEntry[];
  override?: DayOverride;
  /** Primary display category */
  category:
    | 'working'
    | 'weekend'
    | 'public_holiday'
    | 'transferred_day_off'
    | 'transferred_working_day'
    | 'shortened'
    | 'personal_day_off';
}

export type DayReason =
  | 'scheduled_working_day'
  | 'weekend'
  | 'public_holiday'
  | 'transferred_holiday'
  | 'transferred_day_off'
  | 'transferred_working_day'
  | 'shortened_day'
  | 'personal_day_off'
  | 'override_day_off'
  | 'override_working_day';

// ---------------------------------------------------------------------------
// Work schedule
// ---------------------------------------------------------------------------

export interface WorkSchedule {
  /** Indexed by Weekday (0 = Sunday). True when it's a regular working day. */
  workingWeekdays: [boolean, boolean, boolean, boolean, boolean, boolean, boolean];
  /** Minutes after midnight */
  workStart: number;
  workEnd: number;
  /** Buffer (minutes) needed between leaving work and departure / arrival and starting work */
  travelBufferMinutes: number;
}

export interface CalendarSettings {
  profile: EmploymentProfile;
  /** In custom profile only: whether state/municipal transfers should be applied */
  customApplyStateTransfers: boolean;
  overrides: DayOverride[];
  personalDaysOff: { date: IsoDate; note?: string }[];
}

// ---------------------------------------------------------------------------
// Search configuration
// ---------------------------------------------------------------------------

export type DurationMode = 'calendar_days' | 'nights';
export type SearchMode = 'anywhere' | 'specific';

export interface SearchParams {
  mode: SearchMode;
  destinations: string[];
  /** Region filter for "anywhere" mode; empty = all */
  regions: DestinationRegion[];
  /** ISO country codes to leave out in "anywhere" mode */
  excludedCountries: string[];
  earliestDeparture: IsoDate;
  latestDeparture: IsoDate;
  /** Optional absolute limit for the return date */
  latestReturn?: IsoDate;
  durationMode: DurationMode;
  preferredDuration: number;
  minDuration: number;
  maxDuration: number;
  maxVacationDays: number | null;
  budget: number | null;
  maxStops: number | null;
  directOnly: boolean;
  preferWeekendDeparture: boolean;
  preferWeekendReturn: boolean;
  preferDepartureAfterWork: boolean;
  preferArrivalOutsideWork: boolean;
  /** Rank by vacation days first, then by price */
  prioritiseFewestVacationDays: boolean;
}

export interface DateCombination {
  departure: IsoDate;
  return: IsoDate;
  /** Duration expressed in the selected DurationMode */
  duration: number;
  calendarDays: number;
  nights: number;
}

// ---------------------------------------------------------------------------
// Flight offers
// ---------------------------------------------------------------------------

/**
 * How trustworthy a price is. Never upgrade a price kind without revalidation.
 * - live_verified: re-checked with the provider moments ago and bookable
 * - indicative: cached price recently seen by the provider (may have changed)
 * - historical: older observation, for trend purposes only
 * - schedule_only: flight exists but no price available
 * - demo: synthetic sample data — NOT a real flight
 * - unpriced: no flight data; the user must check external sites
 */
export type PriceKind = 'live_verified' | 'indicative' | 'historical' | 'schedule_only' | 'demo' | 'unpriced';

export interface FlightLeg {
  from: string;
  to: string;
  /** Absolute instant, ISO 8601 */
  departAt: string;
  /** Absolute instant, ISO 8601; may be undefined if the provider did not supply duration */
  arriveAt?: string;
  durationMinutes?: number;
  stops: number;
  airline?: string;
  flightNumber?: string;
}

export interface FlightOffer {
  id: string;
  providerId: string;
  providerName: string;
  origin: string;
  /** Destination city code */
  destination: string;
  destinationAirport?: string;
  outbound: FlightLeg;
  inbound: FlightLeg;
  /** Ticket price in EUR; null when unknown */
  price: number | null;
  currency: 'EUR';
  priceKind: PriceKind;
  /** False when the provider supplied dates only (times are placeholders and must not be shown) */
  timesKnown: boolean;
  /** When the provider observed the price (ISO), if known */
  observedAt?: string;
  bookingUrl?: string;
  bookingProvider?: string;
}

export interface ExternalLink {
  label: string;
  url: string;
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export interface VacationBreakdown {
  calendarDays: number;
  nights: number;
  /** Dates within the trip that are working days for this user */
  workingDaysCovered: IsoDate[];
  /** Vacation days needed (date based) */
  vacationDays: number;
  nonWorkingDays: number;
  weekendDays: number;
  holidayDays: number;
  /** 0..1 */
  nonWorkingShare: number;
  days: DayInfo[];
}

export type ConflictSeverity = 'info' | 'warning';

export interface TimeConflict {
  leg: 'outbound' | 'inbound';
  severity: ConflictSeverity;
  message: string;
}

export interface TripResult {
  id: string;
  offer: FlightOffer;
  combination: DateCombination;
  airport: DepartureAirport;
  destination: Destination;
  flightPrice: number | null;
  airportCost: number;
  adjustedPrice: number | null;
  vacation: VacationBreakdown;
  conflicts: TimeConflict[];
  /** Local times at the relevant airports */
  outboundLocal: { depart: string; departDate: IsoDate; arrive?: string; arriveDate?: IsoDate };
  inboundLocal: { depart: string; departDate: IsoDate; arrive?: string; arriveDate?: IsoDate };
  preferenceMatches: string[];
  externalLinks: ExternalLink[];
}

export type SortKey =
  | 'adjusted_price'
  | 'flight_price'
  | 'vacation_days'
  | 'price_per_day'
  | 'shortest'
  | 'longest'
  | 'earliest_departure'
  | 'weekend_utilisation'
  | 'value_score';

export interface ResultFilters {
  maxAdjustedPrice: number | null;
  maxVacationDays: number | null;
  maxStops: number | null;
  directOnly: boolean;
  airports: string[];
  destinations: string[];
  minDuration: number | null;
  maxDuration: number | null;
  departFrom: IsoDate | null;
  departTo: IsoDate | null;
  hideConflicts: boolean;
}
