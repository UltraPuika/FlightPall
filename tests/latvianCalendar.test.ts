import { describe, expect, it } from 'vitest';
import { LV_2026, LV_2027 } from '../src/data/holidays/lv';
import { computeLatvianCalendar } from '../src/services/calendar/lvRules';
import { createCalendar, createLatvianHolidaySource, DEFAULT_CALENDAR_SETTINGS, DEFAULT_SCHEDULE } from '../src/services/calendar/holidayCalendar';
import type { CalendarSettings } from '../src/domain/types';

const privateCal = () => createCalendar(DEFAULT_SCHEDULE, DEFAULT_CALENDAR_SETTINGS);
const stateCal = () => createCalendar(DEFAULT_SCHEDULE, { ...DEFAULT_CALENDAR_SETTINGS, profile: 'state_municipal' });

const holidays = (y: { entries: { type: string; date: string }[] }) =>
  y.entries.filter((e) => e.type === 'public_holiday').map((e) => e.date);

describe('Latvian calendar 2026', () => {
  it('contains the official public holidays', () => {
    expect(holidays(LV_2026)).toEqual(
      expect.arrayContaining([
        '2026-01-01', '2026-04-03', '2026-04-05', '2026-04-06', '2026-05-01', '2026-05-04',
        '2026-06-23', '2026-06-24', '2026-11-18', '2026-12-24', '2026-12-25', '2026-12-26', '2026-12-31',
      ]),
    );
  });

  it('marks state-sector transferred days only for state/municipal employees', () => {
    const p = privateCal();
    const s = stateCal();
    // 2 Jan (Fri) → worked on Sat 17 Jan
    expect(p.day('2026-01-02').isWorkingDay).toBe(true);
    expect(s.day('2026-01-02').isWorkingDay).toBe(false);
    expect(s.day('2026-01-02').category).toBe('transferred_day_off');
    expect(p.day('2026-01-17').isWorkingDay).toBe(false);
    expect(s.day('2026-01-17').isWorkingDay).toBe(true);
    expect(s.day('2026-01-17').category).toBe('transferred_working_day');
    // 22 Jun (Mon) → worked on Sat 27 Jun
    expect(p.day('2026-06-22').isWorkingDay).toBe(true);
    expect(p.day('2026-06-22').isShortened).toBe(true);
    expect(s.day('2026-06-22').isWorkingDay).toBe(false);
    expect(s.day('2026-06-27').isWorkingDay).toBe(true);
    expect(p.day('2026-06-27').isWorkingDay).toBe(false);
  });

  it('reports ignored state entries to private-sector users', () => {
    const d = privateCal().day('2026-01-02');
    expect(d.ignoredEntries.map((e) => e.type)).toContain('transferred_day_off');
  });

  it('treats shortened pre-holiday days as working days, not days off', () => {
    const p = privateCal();
    for (const d of ['2026-04-02', '2026-04-30', '2026-11-17', '2026-12-23', '2026-12-30']) {
      expect(p.day(d).isWorkingDay, d).toBe(true);
      expect(p.day(d).isShortened, d).toBe(true);
    }
  });
});

describe('Latvian calendar 2027', () => {
  it('contains the official public holidays', () => {
    expect(holidays(LV_2027)).toEqual(
      expect.arrayContaining([
        '2027-01-01', '2027-03-26', '2027-03-28', '2027-03-29', '2027-05-01', '2027-05-04',
        '2027-06-23', '2027-06-24', '2027-11-18', '2027-12-24', '2027-12-25', '2027-12-26', '2027-12-31',
      ]),
    );
  });

  it('resolves 2027 days correctly', () => {
    const p = privateCal();
    expect(p.day('2027-03-26').category).toBe('public_holiday');
    expect(p.day('2027-03-29').isWorkingDay).toBe(false);
    expect(p.day('2027-05-04').isWorkingDay).toBe(false);
    expect(p.day('2027-05-03').isShortened).toBe(true);
    expect(p.day('2027-11-18').isWorkingDay).toBe(false);
    expect(p.day('2027-11-19').isWorkingDay).toBe(true); // no transfer seeded
    // 25 Dec 2027 is a Saturday: holiday on a weekend stays a single non-working day
    const sat = p.day('2027-12-25');
    expect(sat.isWorkingDay).toBe(false);
    expect(sat.category).toBe('public_holiday');
  });

  it('does not seed unconfirmed 2027 transfers', () => {
    expect(LV_2027.entries.some((e) => e.type === 'transferred_day_off' || e.type === 'transferred_working_day')).toBe(false);
  });

  it('observances never change working status', () => {
    const p = privateCal();
    expect(p.day('2027-11-11').isWorkingDay).toBe(true); // Lāčplēsis Day, Thursday
    expect(p.day('2027-11-11').entries.some((e) => e.type === 'observance')).toBe(true);
  });
});

describe('every seeded entry is well-formed', () => {
  it('has a source, year and status', () => {
    for (const e of [...LV_2026.entries, ...LV_2027.entries]) {
      expect(e.source).toBeTruthy();
      expect(e.year).toBe(Number(e.date.slice(0, 4)));
      expect(e.status).toBe('official');
    }
  });
});

describe('computed fallback for unseeded years', () => {
  it('matches seeded holidays for 2026 and 2027', () => {
    for (const y of [LV_2026, LV_2027]) {
      const computed = computeLatvianCalendar(y.year).filter((e) => e.type === 'public_holiday').map((e) => e.date);
      expect(computed.sort()).toEqual(holidays(y).sort());
    }
  });

  it('matches seeded shortened days for 2026 and 2027', () => {
    for (const y of [LV_2026, LV_2027]) {
      const computed = computeLatvianCalendar(y.year).filter((e) => e.type === 'shortened_day').map((e) => e.date);
      const seeded = y.entries.filter((e) => e.type === 'shortened_day').map((e) => e.date);
      expect(computed.sort()).toEqual(seeded.sort());
    }
  });

  it('moves 18 Nov 2028 (Saturday) to Monday 20 Nov and flags it as computed', () => {
    const c = computeLatvianCalendar(2028);
    const moved = c.find((e) => e.type === 'transferred_holiday');
    expect(moved?.date).toBe('2028-11-20');
    expect(c.every((e) => e.status === 'computed')).toBe(true);
    const src = createLatvianHolidaySource();
    expect(src.isSeeded(2028)).toBe(false);
    expect(createCalendar(DEFAULT_SCHEDULE, DEFAULT_CALENDAR_SETTINGS).day('2028-11-20').isWorkingDay).toBe(false);
  });
});

describe('profiles and overrides', () => {
  it('custom profile can opt into state transfers', () => {
    const settings: CalendarSettings = { ...DEFAULT_CALENDAR_SETTINGS, profile: 'custom', customApplyStateTransfers: true };
    expect(createCalendar(DEFAULT_SCHEDULE, settings).day('2026-01-02').isWorkingDay).toBe(false);
    expect(createCalendar(DEFAULT_SCHEDULE, { ...settings, customApplyStateTransfers: false }).day('2026-01-02').isWorkingDay).toBe(true);
  });

  it('manual overrides take precedence', () => {
    const cal = createCalendar(DEFAULT_SCHEDULE, {
      ...DEFAULT_CALENDAR_SETTINGS,
      overrides: [
        { date: '2027-01-01', kind: 'working_day' },
        { date: '2027-01-05', kind: 'day_off' },
      ],
    });
    expect(cal.day('2027-01-01').isWorkingDay).toBe(true);
    expect(cal.day('2027-01-05').isWorkingDay).toBe(false);
  });

  it('lists upcoming holidays for the profile', () => {
    const list = privateCal().upcomingHolidays('2026-12-01', 5).map((e) => e.date);
    expect(list).toEqual(['2026-12-24', '2026-12-25', '2026-12-26', '2026-12-31', '2027-01-01']);
  });
});
