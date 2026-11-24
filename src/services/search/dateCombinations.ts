/**
 * Generates every valid (departure, return) pair for a flexible search.
 *
 * Duration semantics:
 *  - `calendar_days` (default): departure and return dates are both counted,
 *    so a 4-day trip leaving Fri 8 Jan returns Mon 11 Jan.
 *  - `nights`: number of nights away, so 4 nights leaving Fri 8 Jan returns Tue 12 Jan.
 */
import type { DateCombination, DurationMode } from '../../domain/types';
import { addDays, diffDays, eachDay, isValidIsoDate, type IsoDate } from '../../lib/dates';

export interface DateSearchWindow {
  earliestDeparture: IsoDate;
  latestDeparture: IsoDate;
  minDuration: number;
  maxDuration: number;
  durationMode: DurationMode;
  /** Optional hard limit; combinations returning later are dropped */
  latestReturn?: IsoDate;
  /** Optional: never generate departures before this date (e.g. today) */
  notBefore?: IsoDate;
}

export function returnDateFor(departure: IsoDate, duration: number, mode: DurationMode): IsoDate {
  return addDays(departure, mode === 'calendar_days' ? duration - 1 : duration);
}

/** Last departure date that still lets a trip of `minDuration` end on or before `latestReturn`. */
export function latestDepartureFor(latestReturn: IsoDate, minDuration: number, mode: DurationMode): IsoDate {
  return addDays(latestReturn, -(mode === 'calendar_days' ? minDuration - 1 : minDuration));
}

/**
 * The user picks a travel window [earliestDeparture, latestReturn]; the latest
 * departure is derived from it so that even the shortest trip still fits.
 */
export function normalizeTravelWindow<T extends { earliestDeparture: IsoDate; latestDeparture: IsoDate; latestReturn?: IsoDate; minDuration: number; maxDuration: number; durationMode: DurationMode }>(p: T): T {
  if (!isValidIsoDate(p.earliestDeparture)) return p;
  const latestReturn = p.latestReturn && isValidIsoDate(p.latestReturn) ? p.latestReturn : isValidIsoDate(p.latestDeparture) ? returnDateFor(p.latestDeparture, p.maxDuration, p.durationMode) : undefined;
  if (!latestReturn) return p;
  const derived = latestDepartureFor(latestReturn, Math.max(p.minDuration, p.durationMode === 'calendar_days' ? 1 : 0), p.durationMode);
  return { ...p, latestReturn, latestDeparture: derived < p.earliestDeparture ? p.earliestDeparture : derived };
}

export function durationOf(departure: IsoDate, returnDate: IsoDate, mode: DurationMode): number {
  const nights = diffDays(departure, returnDate);
  return mode === 'calendar_days' ? nights + 1 : nights;
}

export function validateWindow(w: DateSearchWindow): string[] {
  const errors: string[] = [];
  if (!isValidIsoDate(w.earliestDeparture)) errors.push('Earliest departure date is invalid.');
  if (!isValidIsoDate(w.latestDeparture)) errors.push('Latest departure date is invalid.');
  if (errors.length) return errors;
  if (w.latestDeparture < w.earliestDeparture) errors.push('Latest departure must be on or after the earliest departure.');
  if (w.latestReturn && !isValidIsoDate(w.latestReturn)) errors.push('Latest return date is invalid.');
  if (!Number.isInteger(w.minDuration) || !Number.isInteger(w.maxDuration)) errors.push('Durations must be whole numbers.');
  const floor = w.durationMode === 'calendar_days' ? 1 : 0;
  if (w.minDuration < floor) errors.push(`Minimum duration must be at least ${floor} ${w.durationMode === 'calendar_days' ? 'day' : 'nights'}.`);
  if (w.maxDuration < w.minDuration) errors.push('Maximum duration must be at least the minimum duration.');
  if (w.maxDuration > 60) errors.push('Maximum duration is limited to 60.');
  if (diffDays(w.earliestDeparture, w.latestDeparture) > 366) errors.push('The departure period is limited to one year.');
  return errors;
}

/**
 * All combinations, sorted by departure then duration. Each (departure, return)
 * pair appears exactly once.
 */
export function generateDateCombinations(w: DateSearchWindow): DateCombination[] {
  const errors = validateWindow(w);
  if (errors.length) throw new Error(errors.join(' '));
  const start = w.notBefore && w.notBefore > w.earliestDeparture ? w.notBefore : w.earliestDeparture;
  if (start > w.latestDeparture) return [];
  const seen = new Set<string>();
  const out: DateCombination[] = [];
  for (const departure of eachDay(start, w.latestDeparture)) {
    for (let duration = w.minDuration; duration <= w.maxDuration; duration++) {
      const ret = returnDateFor(departure, duration, w.durationMode);
      if (w.latestReturn && ret > w.latestReturn) continue;
      const key = `${departure}|${ret}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const nights = diffDays(departure, ret);
      out.push({ departure, return: ret, duration, calendarDays: nights + 1, nights });
    }
  }
  return out;
}

export function combinationKey(c: Pick<DateCombination, 'departure' | 'return'>): string {
  return `${c.departure}|${c.return}`;
}
