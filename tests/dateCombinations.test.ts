import { describe, expect, it } from 'vitest';
import { durationOf, generateDateCombinations, returnDateFor, validateWindow } from '../src/services/search/dateCombinations';

describe('date combination generator', () => {
  it('calendar-day durations count departure and return inclusively', () => {
    expect(returnDateFor('2027-01-08', 4, 'calendar_days')).toBe('2027-01-11');
    expect(returnDateFor('2027-01-08', 4, 'nights')).toBe('2027-01-12');
    expect(durationOf('2027-01-08', '2027-01-11', 'calendar_days')).toBe(4);
    expect(durationOf('2027-01-08', '2027-01-11', 'nights')).toBe(3);
  });

  it('covers every departure × duration over multiple months', () => {
    const combos = generateDateCombinations({
      earliestDeparture: '2027-01-01',
      latestDeparture: '2027-02-28',
      minDuration: 3,
      maxDuration: 5,
      durationMode: 'calendar_days',
    });
    expect(combos).toHaveLength(59 * 3);
    expect(combos[0]).toMatchObject({ departure: '2027-01-01', return: '2027-01-03', duration: 3 });
    expect(combos.at(-1)).toMatchObject({ departure: '2027-02-28', return: '2027-03-04', duration: 5 });
  });

  it('crosses month boundaries and leap days', () => {
    const combos = generateDateCombinations({
      earliestDeparture: '2028-02-27',
      latestDeparture: '2028-02-29',
      minDuration: 2,
      maxDuration: 2,
      durationMode: 'calendar_days',
    });
    expect(combos.map((c) => c.return)).toEqual(['2028-02-28', '2028-02-29', '2028-03-01']);
  });

  it('respects the latest return limit', () => {
    const combos = generateDateCombinations({
      earliestDeparture: '2027-02-20',
      latestDeparture: '2027-02-28',
      minDuration: 3,
      maxDuration: 5,
      durationMode: 'calendar_days',
      latestReturn: '2027-02-28',
    });
    expect(combos.every((c) => c.return <= '2027-02-28')).toBe(true);
    expect(combos.some((c) => c.departure === '2027-02-26' && c.duration === 3)).toBe(true);
    expect(combos.some((c) => c.departure === '2027-02-27')).toBe(false);
  });

  it('never produces duplicate combinations', () => {
    const combos = generateDateCombinations({
      earliestDeparture: '2027-01-01',
      latestDeparture: '2027-03-31',
      minDuration: 1,
      maxDuration: 10,
      durationMode: 'nights',
    });
    const keys = combos.map((c) => `${c.departure}|${c.return}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('skips departures before notBefore', () => {
    const combos = generateDateCombinations({
      earliestDeparture: '2027-01-01',
      latestDeparture: '2027-01-10',
      minDuration: 3,
      maxDuration: 3,
      durationMode: 'calendar_days',
      notBefore: '2027-01-05',
    });
    expect(combos[0].departure).toBe('2027-01-05');
    expect(combos).toHaveLength(6);
  });

  it('validates input', () => {
    expect(validateWindow({ earliestDeparture: '2027-02-01', latestDeparture: '2027-01-01', minDuration: 3, maxDuration: 5, durationMode: 'calendar_days' })).not.toHaveLength(0);
    expect(validateWindow({ earliestDeparture: '2027-01-01', latestDeparture: '2027-01-31', minDuration: 5, maxDuration: 3, durationMode: 'calendar_days' })).not.toHaveLength(0);
    expect(validateWindow({ earliestDeparture: '2027-01-01', latestDeparture: '2027-01-31', minDuration: 0, maxDuration: 3, durationMode: 'calendar_days' })).not.toHaveLength(0);
    expect(validateWindow({ earliestDeparture: '2027-01-01', latestDeparture: '2027-01-31', minDuration: 0, maxDuration: 3, durationMode: 'nights' })).toHaveLength(0);
  });
});
