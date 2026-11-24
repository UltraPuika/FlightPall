/**
 * Transparent ranking and filtering of trip results.
 *
 * No hidden weights: every sort key is a single, explainable number, and
 * `explainRank` produces the human-readable reason shown on each result card.
 */
import type { ResultFilters, SortKey, TripResult } from '../domain/types';
import { formatEuro } from './airports';

export interface RankingOptions {
  sortKey: SortKey;
  /** Vacation days first, then the chosen sort key */
  prioritiseFewestVacationDays: boolean;
  /** EUR value the user assigns to one vacation day (used by value_score only) */
  vacationDayValue: number;
}

export const SORT_LABELS: Record<SortKey, string> = {
  adjusted_price: 'Lowest adjusted price',
  flight_price: 'Lowest ticket price',
  vacation_days: 'Fewest vacation days',
  price_per_day: 'Best price per trip day',
  shortest: 'Shortest trip',
  longest: 'Longest trip',
  earliest_departure: 'Earliest departure',
  weekend_utilisation: 'Best weekend utilisation',
  value_score: 'Best value (price + vacation days)',
};

/**
 * Value score = (adjusted price + vacation days × vacation-day value) ÷ calendar days.
 * In EUR per trip day. Lower is better. Null when the price is unknown.
 */
export function valueScore(r: TripResult, vacationDayValue: number): number | null {
  if (r.adjustedPrice === null) return null;
  return (r.adjustedPrice + r.vacation.vacationDays * vacationDayValue) / r.vacation.calendarDays;
}

export function pricePerDay(r: TripResult): number | null {
  return r.adjustedPrice === null ? null : r.adjustedPrice / r.vacation.calendarDays;
}

/** Primary numeric metric for a sort key — lower is always better. */
export function metric(r: TripResult, key: SortKey, vacationDayValue: number): number | null {
  switch (key) {
    case 'adjusted_price':
      return r.adjustedPrice;
    case 'flight_price':
      return r.flightPrice;
    case 'vacation_days':
      return r.vacation.vacationDays;
    case 'price_per_day':
      return pricePerDay(r);
    case 'shortest':
      return r.vacation.calendarDays;
    case 'longest':
      return -r.vacation.calendarDays;
    case 'earliest_departure':
      return new Date(r.offer.outbound.departAt).getTime();
    case 'weekend_utilisation':
      return -r.vacation.nonWorkingShare;
    case 'value_score':
      return valueScore(r, vacationDayValue);
  }
}

function cmpNullable(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1; // unknown values go last
  if (b === null) return -1;
  return a - b;
}

export function compareResults(a: TripResult, b: TripResult, opts: RankingOptions): number {
  if (opts.prioritiseFewestVacationDays) {
    const v = a.vacation.vacationDays - b.vacation.vacationDays;
    if (v !== 0) return v;
  }
  const primary = cmpNullable(metric(a, opts.sortKey, opts.vacationDayValue), metric(b, opts.sortKey, opts.vacationDayValue));
  if (primary !== 0) return primary;
  // Deterministic tie-breakers: adjusted price, vacation days, preference matches, departure
  const t1 = cmpNullable(a.adjustedPrice, b.adjustedPrice);
  if (t1 !== 0) return t1;
  const t2 = a.vacation.vacationDays - b.vacation.vacationDays;
  if (t2 !== 0) return t2;
  const t3 = b.preferenceMatches.length - a.preferenceMatches.length;
  if (t3 !== 0) return t3;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function sortResults(results: TripResult[], opts: RankingOptions): TripResult[] {
  return results.slice().sort((a, b) => compareResults(a, b, opts));
}

export function explainRank(r: TripResult, opts: RankingOptions): string {
  const parts: string[] = [];
  if (opts.prioritiseFewestVacationDays) parts.push(`${r.vacation.vacationDays} vacation day(s) (prioritised)`);
  const price =
    r.adjustedPrice === null
      ? 'price unknown'
      : `${formatEuro(r.adjustedPrice)} adjusted (ticket ${formatEuro(r.flightPrice)} ${r.airportCost >= 0 ? '+' : '−'} ${r.airport.code} cost ${formatEuro(Math.abs(r.airportCost))})`;
  switch (opts.sortKey) {
    case 'adjusted_price':
      parts.push(price);
      break;
    case 'flight_price':
      parts.push(`ticket ${formatEuro(r.flightPrice)} (airport cost ignored for this sort)`);
      break;
    case 'vacation_days':
      parts.push(`${r.vacation.vacationDays} vacation day(s), then ${price}`);
      break;
    case 'price_per_day': {
      const ppd = pricePerDay(r);
      parts.push(ppd === null ? 'price unknown' : `${formatEuro(Math.round(ppd * 10) / 10)}/day = ${formatEuro(r.adjustedPrice)} ÷ ${r.vacation.calendarDays} days`);
      break;
    }
    case 'shortest':
    case 'longest':
      parts.push(`${r.vacation.calendarDays} calendar days, then ${price}`);
      break;
    case 'earliest_departure':
      parts.push(`departs ${r.outboundLocal.departDate} ${r.outboundLocal.depart}`);
      break;
    case 'weekend_utilisation':
      parts.push(`${Math.round(r.vacation.nonWorkingShare * 100)}% of trip days are non-working (${r.vacation.nonWorkingDays}/${r.vacation.calendarDays})`);
      break;
    case 'value_score': {
      const vs = valueScore(r, opts.vacationDayValue);
      parts.push(
        vs === null
          ? 'price unknown'
          : `${formatEuro(Math.round(vs * 10) / 10)}/day = (${formatEuro(r.adjustedPrice)} + ${r.vacation.vacationDays} vacation day(s) × ${formatEuro(opts.vacationDayValue)}) ÷ ${r.vacation.calendarDays} days`,
      );
      break;
    }
  }
  return parts.join(' · ');
}

export const EMPTY_FILTERS: ResultFilters = {
  maxAdjustedPrice: null,
  maxVacationDays: null,
  maxStops: null,
  directOnly: false,
  airports: [],
  destinations: [],
  minDuration: null,
  maxDuration: null,
  departFrom: null,
  departTo: null,
  hideConflicts: false,
};

export function applyFilters(results: TripResult[], f: ResultFilters): TripResult[] {
  return results.filter((r) => {
    if (f.maxAdjustedPrice !== null && (r.adjustedPrice === null || r.adjustedPrice > f.maxAdjustedPrice)) return false;
    if (f.maxVacationDays !== null && r.vacation.vacationDays > f.maxVacationDays) return false;
    const stops = Math.max(r.offer.outbound.stops, r.offer.inbound.stops);
    if (f.directOnly && stops > 0) return false;
    if (f.maxStops !== null && stops > f.maxStops) return false;
    if (f.airports.length && !f.airports.includes(r.airport.code)) return false;
    if (f.destinations.length && !f.destinations.includes(r.destination.code)) return false;
    if (f.minDuration !== null && r.combination.duration < f.minDuration) return false;
    if (f.maxDuration !== null && r.combination.duration > f.maxDuration) return false;
    if (f.departFrom && r.combination.departure < f.departFrom) return false;
    if (f.departTo && r.combination.departure > f.departTo) return false;
    if (f.hideConflicts && r.conflicts.some((c) => c.severity === 'warning')) return false;
    return true;
  });
}

/** Cheapest (by current sort) result per destination — for "Anywhere" grouping. */
export function groupByDestination(sorted: TripResult[]): { destination: TripResult['destination']; best: TripResult; count: number }[] {
  const map = new Map<string, { destination: TripResult['destination']; best: TripResult; count: number }>();
  for (const r of sorted) {
    const g = map.get(r.destination.code);
    if (g) g.count++;
    else map.set(r.destination.code, { destination: r.destination, best: r, count: 1 });
  }
  return Array.from(map.values());
}
