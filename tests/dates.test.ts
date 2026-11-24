import { describe, expect, it } from 'vitest';
import { addDays, daysInMonth, diffDays, easterSunday, eachDay, isValidIsoDate, monthsInRange, nthWeekdayOfMonth, weekdayOf } from '../src/lib/dates';
import { localToInstant, toLocal } from '../src/lib/time';

describe('date utilities', () => {
  it('adds days across month and year boundaries', () => {
    expect(addDays('2027-01-31', 1)).toBe('2027-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28');
  });

  it('handles leap years', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01');
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2100, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(isValidIsoDate('2027-02-29')).toBe(false);
    expect(isValidIsoDate('2028-02-29')).toBe(true);
  });

  it('is unaffected by DST transitions', () => {
    expect(diffDays('2027-03-27', '2027-03-29')).toBe(2);
    expect(eachDay('2026-10-24', '2026-10-26')).toEqual(['2026-10-24', '2026-10-25', '2026-10-26']);
  });

  it('computes weekdays', () => {
    expect(weekdayOf('2027-01-01')).toBe(5); // Friday
    expect(weekdayOf('2026-01-17')).toBe(6); // Saturday
  });

  it('lists months in a range', () => {
    expect(monthsInRange('2026-12-15', '2027-02-01')).toEqual(['2026-12', '2027-01', '2027-02']);
  });

  it('computes Easter Sunday', () => {
    expect(easterSunday(2026)).toBe('2026-04-05');
    expect(easterSunday(2027)).toBe('2027-03-28');
    expect(easterSunday(2028)).toBe('2028-04-16');
  });

  it("finds Mother's Day (2nd Sunday of May)", () => {
    expect(nthWeekdayOfMonth(2026, 5, 0, 2)).toBe('2026-05-10');
    expect(nthWeekdayOfMonth(2027, 5, 0, 2)).toBe('2027-05-09');
  });
});

describe('time zones', () => {
  it('converts instants to airport-local wall time', () => {
    expect(toLocal('2027-01-08T04:10:00Z', 'Europe/Riga')).toMatchObject({ date: '2027-01-08', hhmm: '06:10' });
    expect(toLocal('2027-07-08T22:30:00Z', 'Europe/Riga')).toMatchObject({ date: '2027-07-09', hhmm: '01:30' });
    expect(toLocal('2027-01-08T06:10:00+02:00', 'Europe/London')).toMatchObject({ hhmm: '04:10' });
  });

  it('round-trips local time through DST', () => {
    for (const d of ['2027-01-15', '2027-03-28', '2027-07-15', '2027-10-31']) {
      const inst = localToInstant(d, 9 * 60 + 30, 'Europe/Riga');
      expect(toLocal(inst, 'Europe/Riga')).toMatchObject({ date: d, hhmm: '09:30' });
    }
  });
});
