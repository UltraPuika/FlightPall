/**
 * Calendar-date utilities based on ISO `YYYY-MM-DD` strings.
 *
 * All arithmetic is performed on UTC epoch days, so it is immune to DST shifts and
 * local browser time zones. A calendar date is never converted to a local `Date`.
 */

export type IsoDate = string; // YYYY-MM-DD

const MS_PER_DAY = 86_400_000;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 0 = Sunday ... 6 = Saturday (same as Date#getUTCDay). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

export function isValidIsoDate(value: string): boolean {
  const m = ISO_RE.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  return d <= daysInMonth(y, mo);
}

export function parseIso(value: IsoDate): { year: number; month: number; day: number } {
  const m = ISO_RE.exec(value);
  if (!m) throw new Error(`Invalid ISO date: ${value}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

export function toEpochDay(value: IsoDate): number {
  const { year, month, day } = parseIso(value);
  return Math.round(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

export function fromEpochDay(epochDay: number): IsoDate {
  const d = new Date(epochDay * MS_PER_DAY);
  return formatYmd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function formatYmd(year: number, month: number, day: number): IsoDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function addDays(value: IsoDate, days: number): IsoDate {
  return fromEpochDay(toEpochDay(value) + days);
}

/** Signed number of days from `a` to `b` (b - a). */
export function diffDays(a: IsoDate, b: IsoDate): number {
  return toEpochDay(b) - toEpochDay(a);
}

export function weekdayOf(value: IsoDate): Weekday {
  const { year, month, day } = parseIso(value);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay() as Weekday;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

/** Inclusive list of dates from `start` to `end`. Empty when end < start. */
export function eachDay(start: IsoDate, end: IsoDate): IsoDate[] {
  const s = toEpochDay(start);
  const e = toEpochDay(end);
  const out: IsoDate[] = [];
  for (let d = s; d <= e; d++) out.push(fromEpochDay(d));
  return out;
}

/** Distinct `YYYY-MM` months touched by an inclusive date range. */
export function monthsInRange(start: IsoDate, end: IsoDate): string[] {
  const out: string[] = [];
  let { year, month } = parseIso(start);
  const last = parseIso(end);
  while (year < last.year || (year === last.year && month <= last.month)) {
    out.push(`${year}-${String(month).padStart(2, '0')}`);
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }
  return out;
}

export function compareIso(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function minIso(a: IsoDate, b: IsoDate): IsoDate {
  return a <= b ? a : b;
}

export function todayIso(now: Date = new Date()): IsoDate {
  return formatYmd(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function formatHuman(value: IsoDate, opts: { weekday?: boolean; year?: boolean } = {}): string {
  const { year, month, day } = parseIso(value);
  const wd = opts.weekday ? `${WEEKDAY_SHORT[weekdayOf(value)]} ` : '';
  const yr = opts.year ? ` ${year}` : '';
  return `${wd}${day} ${MONTH_NAMES[month - 1].slice(0, 3)}${yr}`;
}

/** Western (Gregorian) Easter Sunday — anonymous Gregorian algorithm (Meeus/Jones/Butcher). */
export function easterSunday(year: number): IsoDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return formatYmd(year, month, day);
}

/** n-th (1-based) occurrence of a weekday in a month. */
export function nthWeekdayOfMonth(year: number, month: number, weekday: Weekday, n: number): IsoDate {
  const first = formatYmd(year, month, 1);
  const offset = (weekday - weekdayOf(first) + 7) % 7;
  return addDays(first, offset + (n - 1) * 7);
}
