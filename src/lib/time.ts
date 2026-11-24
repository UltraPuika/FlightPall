/**
 * Time-zone helpers built on the browser/Node `Intl` API (no dependency).
 *
 * Flight times are stored as absolute instants (ISO 8601 with offset or `Z`).
 * They are always *displayed* and *evaluated against working hours* in the
 * airport's local IANA time zone, never in the browser's zone.
 */
import { formatYmd, type IsoDate } from './dates';

export interface LocalDateTime {
  date: IsoDate;
  /** Minutes after local midnight, 0..1439 */
  minutes: number;
  /** HH:MM */
  hhmm: string;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

/** Wall-clock date/time of an instant in an IANA time zone. */
export function toLocal(instant: string | number | Date, timeZone: string): LocalDateTime {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid instant: ${String(instant)}`);
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(date).map((p) => [p.type, p.value]));
  const hour = Number(parts.hour) % 24;
  const minute = Number(parts.minute);
  return {
    date: formatYmd(Number(parts.year), Number(parts.month), Number(parts.day)),
    minutes: hour * 60 + minute,
    hhmm: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
  };
}

/** Offset (minutes, east positive) of a zone at a given instant. */
export function zoneOffsetMinutes(utcMs: number, timeZone: string): number {
  const local = toLocal(utcMs, timeZone);
  const [y, m, d] = local.date.split('-').map(Number);
  const asUtc = Date.UTC(y, m - 1, d, Math.floor(local.minutes / 60), local.minutes % 60);
  return Math.round((asUtc - Math.floor(utcMs / 60_000) * 60_000) / 60_000);
}

/**
 * Convert a local wall time in `timeZone` to an absolute ISO instant (UTC, `Z`).
 * Handles DST by re-evaluating the offset at the candidate instant.
 */
export function localToInstant(date: IsoDate, minutes: number, timeZone: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const naive = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
  let utc = naive - zoneOffsetMinutes(naive, timeZone) * 60_000;
  utc = naive - zoneOffsetMinutes(utc, timeZone) * 60_000;
  return new Date(utc).toISOString();
}

export function addMinutesToInstant(instant: string, minutes: number): string {
  return new Date(new Date(instant).getTime() + minutes * 60_000).toISOString();
}

export function parseHhmm(value: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) throw new Error(`Invalid time: ${value}`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) throw new Error(`Invalid time: ${value}`);
  return h * 60 + min;
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}
