/**
 * Persistent preferences and saved searches (browser localStorage, versioned).
 * Every access is wrapped: storage can be unavailable (private mode, blocked).
 */
import type { CalendarSettings, DepartureAirport, SearchParams, SortKey, WorkSchedule } from '../domain/types';
import { DEFAULT_DEPARTURE_AIRPORTS } from '../data/airports';
import { DEFAULT_CALENDAR_SETTINGS, DEFAULT_SCHEDULE } from './calendar/holidayCalendar';
import { addDays, todayIso } from '../lib/dates';

export type ProviderChoice = 'demo' | 'travelpayouts' | 'links';

export interface Preferences {
  version: 1;
  airports: DepartureAirport[];
  schedule: WorkSchedule;
  calendar: CalendarSettings;
  search: SearchParams;
  provider: ProviderChoice;
  /** User-supplied proxy URL (overrides the build-time VITE_TRAVELPAYOUTS_PROXY_URL) */
  proxyUrl: string;
  sortKey: SortKey;
  vacationDayValue: number;
}

export interface SavedSearch {
  id: string;
  name: string;
  createdAt: string;
  params: SearchParams;
}

const PREFS_KEY = 'flightpall:prefs:v1';
const SAVED_KEY = 'flightpall:saved:v1';

export function defaultSearchParams(today = todayIso()): SearchParams {
  const start = addDays(today, 14);
  return {
    mode: 'anywhere',
    destinations: [],
    regions: [],
    earliestDeparture: start,
    latestDeparture: addDays(start, 59),
    latestReturn: undefined,
    durationMode: 'calendar_days',
    preferredDuration: 4,
    minDuration: 3,
    maxDuration: 5,
    maxVacationDays: 2,
    budget: null,
    maxStops: null,
    directOnly: false,
    preferWeekendDeparture: false,
    preferWeekendReturn: false,
    preferDepartureAfterWork: false,
    preferArrivalOutsideWork: false,
    prioritiseFewestVacationDays: false,
  };
}

export function defaultPreferences(): Preferences {
  const envProxy = (import.meta.env?.VITE_TRAVELPAYOUTS_PROXY_URL as string | undefined) ?? '';
  return {
    version: 1,
    airports: DEFAULT_DEPARTURE_AIRPORTS.map((a) => ({ ...a })),
    schedule: { ...DEFAULT_SCHEDULE, workingWeekdays: [...DEFAULT_SCHEDULE.workingWeekdays] },
    calendar: { ...DEFAULT_CALENDAR_SETTINGS, overrides: [], personalDaysOff: [] },
    search: defaultSearchParams(),
    provider: envProxy ? 'travelpayouts' : 'demo',
    proxyUrl: '',
    sortKey: 'adjusted_price',
    vacationDayValue: 100,
  };
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** Merge stored prefs onto defaults so new fields get sensible values. */
export function mergePreferences(stored: Partial<Preferences> | null | undefined, defaults = defaultPreferences()): Preferences {
  if (!stored || stored.version !== 1) return defaults;
  const search = { ...defaults.search, ...(stored.search ?? {}) };
  // Never resume a search window that has already passed
  const today = todayIso();
  if (search.latestDeparture < today) {
    search.earliestDeparture = defaults.search.earliestDeparture;
    search.latestDeparture = defaults.search.latestDeparture;
    search.latestReturn = undefined;
  }
  return {
    ...defaults,
    ...stored,
    airports: Array.isArray(stored.airports) && stored.airports.length ? stored.airports : defaults.airports,
    schedule: { ...defaults.schedule, ...(stored.schedule ?? {}) },
    calendar: { ...defaults.calendar, ...(stored.calendar ?? {}) },
    search,
  } as Preferences;
}

export function loadPreferences(): Preferences {
  const s = safeStorage();
  try {
    const raw = s?.getItem(PREFS_KEY);
    return mergePreferences(raw ? JSON.parse(raw) : null);
  } catch {
    return defaultPreferences();
  }
}

export function savePreferences(p: Preferences): void {
  try {
    safeStorage()?.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* storage full or blocked — preferences stay in memory */
  }
}

export function loadSavedSearches(): SavedSearch[] {
  try {
    const raw = safeStorage()?.getItem(SAVED_KEY);
    const list = raw ? (JSON.parse(raw) as SavedSearch[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function storeSavedSearches(list: SavedSearch[]): void {
  try {
    safeStorage()?.setItem(SAVED_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export function exportPreferences(p: Preferences, saved: SavedSearch[]): string {
  return JSON.stringify({ preferences: p, savedSearches: saved }, null, 2);
}

export function importPreferences(json: string): { preferences: Preferences; savedSearches: SavedSearch[] } {
  const parsed = JSON.parse(json);
  return {
    preferences: mergePreferences(parsed.preferences),
    savedSearches: Array.isArray(parsed.savedSearches) ? parsed.savedSearches : [],
  };
}
