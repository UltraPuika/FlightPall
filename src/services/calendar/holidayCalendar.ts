/**
 * Holiday calendar service: resolves what a given date means for a given user.
 *
 * Precedence (highest first):
 *   1. Manual per-date override
 *   2. Personal day off
 *   3. Public holiday / statutory transferred holiday (applies to everyone)
 *   4. Cabinet transfer (state/municipal profile, or custom with transfers enabled)
 *   5. Regular weekly schedule
 * Shortened pre-holiday days remain working days (with shortened hours).
 */
import type {
  CalendarEntry,
  CalendarSettings,
  DayInfo,
  DayReason,
  WorkSchedule,
} from '../../domain/types';
import { LV_CALENDAR_YEARS, type YearCalendar } from '../../data/holidays/lv';
import { computeLatvianCalendar } from './lvRules';
import { eachDay, weekdayOf, type IsoDate } from '../../lib/dates';

export interface HolidaySource {
  /** Entries for a year; seeded data first, computed fallback otherwise */
  entriesForYear(year: number): CalendarEntry[];
  /** Whether the year has reviewed, seeded data */
  isSeeded(year: number): boolean;
  yearInfo(year: number): YearCalendar | undefined;
}

export function createLatvianHolidaySource(years: YearCalendar[] = LV_CALENDAR_YEARS, extra: CalendarEntry[] = []): HolidaySource {
  const byYear = new Map(years.map((y) => [y.year, y]));
  const computedCache = new Map<number, CalendarEntry[]>();
  return {
    entriesForYear(year) {
      const seeded = byYear.get(year);
      const extras = extra.filter((x) => x.year === year);
      if (seeded) return [...seeded.entries, ...extras];
      let c = computedCache.get(year);
      if (!c) {
        c = computeLatvianCalendar(year);
        computedCache.set(year, c);
      }
      return [...c, ...extras];
    },
    isSeeded: (year) => byYear.has(year),
    yearInfo: (year) => byYear.get(year),
  };
}

export const DEFAULT_SCHEDULE: WorkSchedule = {
  workingWeekdays: [false, true, true, true, true, true, false],
  workStart: 9 * 60,
  workEnd: 17 * 60,
  travelBufferMinutes: 90,
};

export const DEFAULT_CALENDAR_SETTINGS: CalendarSettings = {
  profile: 'private',
  customApplyStateTransfers: false,
  overrides: [],
  personalDaysOff: [],
};

const OFF_TYPES = new Set(['public_holiday', 'transferred_holiday']);

export function entryApplies(entry: CalendarEntry, settings: CalendarSettings): boolean {
  if (entry.type === 'observance') return true; // informational, never changes working status
  if (entry.scope === 'all') {
    // Under the state profile, a state transfer supersedes the private-sector shortened day
    return true;
  }
  // scope === 'state_municipal'
  if (settings.profile === 'state_municipal') return true;
  if (settings.profile === 'custom') return settings.customApplyStateTransfers;
  return false;
}

export class HolidayCalendar {
  private entriesByDate = new Map<IsoDate, CalendarEntry[]>();
  private loadedYears = new Set<number>();
  private overrides: Map<IsoDate, CalendarSettings['overrides'][number]>;
  private personal: Map<IsoDate, { date: IsoDate; note?: string }>;
  private dayCache = new Map<IsoDate, DayInfo>();

  constructor(
    private readonly source: HolidaySource,
    private readonly schedule: WorkSchedule,
    private readonly settings: CalendarSettings,
  ) {
    this.overrides = new Map(settings.overrides.map((o) => [o.date, o]));
    this.personal = new Map(settings.personalDaysOff.map((p) => [p.date, p]));
  }

  private ensureYear(year: number) {
    if (this.loadedYears.has(year)) return;
    this.loadedYears.add(year);
    for (const entry of this.source.entriesForYear(year)) {
      const list = this.entriesByDate.get(entry.date) ?? [];
      list.push(entry);
      this.entriesByDate.set(entry.date, list);
    }
  }

  entriesOn(date: IsoDate): CalendarEntry[] {
    this.ensureYear(Number(date.slice(0, 4)));
    return this.entriesByDate.get(date) ?? [];
  }

  isSeeded(year: number): boolean {
    return this.source.isSeeded(year);
  }

  day(date: IsoDate): DayInfo {
    const cached = this.dayCache.get(date);
    if (cached) return cached;
    const info = this.resolve(date);
    this.dayCache.set(date, info);
    return info;
  }

  range(start: IsoDate, end: IsoDate): DayInfo[] {
    return eachDay(start, end).map((d) => this.day(d));
  }

  private resolve(date: IsoDate): DayInfo {
    const weekday = weekdayOf(date);
    const all = this.entriesOn(date);
    const applied = all.filter((x) => entryApplies(x, this.settings));
    const ignored = all.filter((x) => !applied.includes(x));
    const reasons: DayReason[] = [];

    const scheduledWorking = this.schedule.workingWeekdays[weekday];
    let isWorkingDay = scheduledWorking;
    let isShortened = false;
    let category: DayInfo['category'] = scheduledWorking ? 'working' : 'weekend';

    const holiday = applied.find((x) => OFF_TYPES.has(x.type));
    const transferOff = applied.find((x) => x.type === 'transferred_day_off');
    const transferWork = applied.find((x) => x.type === 'transferred_working_day');
    const shortened = applied.find((x) => x.type === 'shortened_day');

    if (holiday) {
      isWorkingDay = false;
      category = 'public_holiday';
      reasons.push(holiday.type === 'transferred_holiday' ? 'transferred_holiday' : 'public_holiday');
      if (!scheduledWorking) reasons.push('weekend'); // shown, but never counted twice
    } else if (transferOff) {
      isWorkingDay = false;
      category = 'transferred_day_off';
      reasons.push('transferred_day_off');
    } else if (transferWork) {
      isWorkingDay = true;
      category = 'transferred_working_day';
      reasons.push('transferred_working_day');
    } else if (scheduledWorking) {
      reasons.push('scheduled_working_day');
      if (shortened) {
        isShortened = true;
        category = 'shortened';
        reasons.push('shortened_day');
      }
    } else {
      reasons.push('weekend');
    }

    // Personal day off
    const personal = this.personal.get(date);
    if (personal && isWorkingDay) {
      isWorkingDay = false;
      isShortened = false;
      category = 'personal_day_off';
      reasons.unshift('personal_day_off');
    }

    // Manual override has the final word
    const override = this.overrides.get(date);
    if (override) {
      if (override.kind === 'day_off') {
        isWorkingDay = false;
        isShortened = false;
        category = 'personal_day_off';
        reasons.unshift('override_day_off');
      } else {
        isWorkingDay = true;
        isShortened = override.kind === 'shortened_day';
        category = isShortened ? 'shortened' : 'working';
        reasons.unshift('override_working_day');
      }
    }

    return {
      date,
      weekday,
      isWorkingDay,
      isShortened,
      reasons,
      entries: applied,
      ignoredEntries: ignored,
      override,
      category,
    };
  }

  /** Upcoming public holidays (and statutory transfers) applied to the user. */
  upcomingHolidays(from: IsoDate, count: number): CalendarEntry[] {
    const out: CalendarEntry[] = [];
    let year = Number(from.slice(0, 4));
    while (out.length < count && year < Number(from.slice(0, 4)) + 3) {
      const list = this.source
        .entriesForYear(year)
        .filter((x) => x.date >= from && (OFF_TYPES.has(x.type) || x.type === 'transferred_day_off') && entryApplies(x, this.settings))
        .sort((a, b) => (a.date < b.date ? -1 : 1));
      out.push(...list);
      year++;
    }
    return out.slice(0, count);
  }
}

export function createCalendar(schedule: WorkSchedule, settings: CalendarSettings, source: HolidaySource = createLatvianHolidaySource()): HolidayCalendar {
  return new HolidayCalendar(source, schedule, settings);
}
