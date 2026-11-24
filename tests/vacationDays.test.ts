import { describe, expect, it } from 'vitest';
import { createCalendar, DEFAULT_CALENDAR_SETTINGS, DEFAULT_SCHEDULE } from '../src/services/calendar/holidayCalendar';
import { calculateVacation } from '../src/services/calendar/vacationDays';
import type { CalendarSettings, WorkSchedule } from '../src/domain/types';

const cal = (settings: Partial<CalendarSettings> = {}, schedule: Partial<WorkSchedule> = {}) =>
  createCalendar({ ...DEFAULT_SCHEDULE, ...schedule }, { ...DEFAULT_CALENDAR_SETTINGS, ...settings });

describe('vacation-day calculation', () => {
  it('Friday → Monday needs Friday and Monday off', () => {
    // 15 Jan 2027 is a Friday
    const v = calculateVacation(cal(), '2027-01-15', '2027-01-18');
    expect(v.calendarDays).toBe(4);
    expect(v.nights).toBe(3);
    expect(v.workingDaysCovered).toEqual(['2027-01-15', '2027-01-18']);
    expect(v.vacationDays).toBe(2);
    expect(v.weekendDays).toBe(2);
    expect(v.nonWorkingShare).toBe(0.5);
  });

  it('Saturday → Monday needs only Monday', () => {
    const v = calculateVacation(cal(), '2027-01-16', '2027-01-18');
    expect(v.vacationDays).toBe(1);
  });

  it('Thursday → Monday needs Thu, Fri and Mon', () => {
    const v = calculateVacation(cal(), '2027-01-14', '2027-01-18');
    expect(v.workingDaysCovered).toEqual(['2027-01-14', '2027-01-15', '2027-01-18']);
    expect(v.vacationDays).toBe(3);
  });

  it('counts multiple weekends', () => {
    // Sat 9 Jan → Sun 24 Jan 2027: 16 days, three weekends (6 weekend days), 10 working days
    const v = calculateVacation(cal(), '2027-01-09', '2027-01-24');
    expect(v.calendarDays).toBe(16);
    expect(v.weekendDays).toBe(6);
    expect(v.vacationDays).toBe(10);
  });

  it('excludes public holidays (Easter 2027)', () => {
    // Thu 25 Mar → Tue 30 Mar 2027: Thu (shortened working), Fri holiday, Sat, Sun holiday, Mon holiday, Tue
    const v = calculateVacation(cal(), '2027-03-25', '2027-03-30');
    expect(v.workingDaysCovered).toEqual(['2027-03-25', '2027-03-30']);
    expect(v.vacationDays).toBe(2);
    expect(v.holidayDays).toBe(3);
  });

  it('does not double count a holiday on a weekend', () => {
    // Christmas 2027: Fri 24 (holiday), Sat 25 (holiday), Sun 26 (holiday), Mon 27
    const v = calculateVacation(cal(), '2027-12-24', '2027-12-27');
    expect(v.nonWorkingDays).toBe(3);
    expect(v.vacationDays).toBe(1);
    expect(v.calendarDays).toBe(4);
  });

  it('applies transferred working days and days off for the state profile', () => {
    // 2 Jan 2026 (Fri) is a transferred day off for state employees
    expect(calculateVacation(cal(), '2026-01-01', '2026-01-04').vacationDays).toBe(1);
    expect(calculateVacation(cal({ profile: 'state_municipal' }), '2026-01-01', '2026-01-04').vacationDays).toBe(0);
    // Sat 27 Jun 2026 is a working Saturday for state employees
    expect(calculateVacation(cal(), '2026-06-26', '2026-06-28').vacationDays).toBe(1);
    expect(calculateVacation(cal({ profile: 'state_municipal' }), '2026-06-26', '2026-06-28').vacationDays).toBe(2);
  });

  it('Līgo week 2026 differs between profiles', () => {
    // Sat 20 → Wed 24 Jun 2026
    expect(calculateVacation(cal(), '2026-06-20', '2026-06-24').vacationDays).toBe(1); // Mon 22 (shortened) only
    expect(calculateVacation(cal({ profile: 'state_municipal' }), '2026-06-20', '2026-06-24').vacationDays).toBe(0);
  });

  it('respects custom working schedules', () => {
    // Four-day week Mon–Thu
    const fourDay = cal({}, { workingWeekdays: [false, true, true, true, true, false, false] });
    expect(calculateVacation(fourDay, '2027-01-15', '2027-01-18').vacationDays).toBe(1);
    // Works Saturdays
    const sixDay = cal({}, { workingWeekdays: [false, true, true, true, true, true, true] });
    expect(calculateVacation(sixDay, '2027-01-15', '2027-01-18').vacationDays).toBe(3);
  });

  it('excludes personal days off', () => {
    const c = cal({ personalDaysOff: [{ date: '2027-01-15' }] });
    expect(calculateVacation(c, '2027-01-15', '2027-01-18').vacationDays).toBe(1);
  });

  it('crosses the year boundary using both years of data', () => {
    // Wed 30 Dec 2026 (shortened) → Sun 3 Jan 2027: 30 working, 31 holiday, 1 Jan holiday, Sat, Sun
    const v = calculateVacation(cal(), '2026-12-30', '2027-01-03');
    expect(v.workingDaysCovered).toEqual(['2026-12-30']);
    expect(v.vacationDays).toBe(1);
  });

  it('single-day trips count the day itself', () => {
    expect(calculateVacation(cal(), '2027-01-13', '2027-01-13')).toMatchObject({ calendarDays: 1, nights: 0, vacationDays: 1 });
  });

  it('rejects return before departure', () => {
    expect(() => calculateVacation(cal(), '2027-01-13', '2027-01-12')).toThrow();
  });
});
