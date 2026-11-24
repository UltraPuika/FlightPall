/**
 * Vacation-day calculation (date based).
 *
 * Every calendar date from departure to return INCLUSIVE is considered "away".
 * A date counts as a vacation day when the user would otherwise be scheduled to
 * work it (after applying weekends, public holidays, transfers, personal days off
 * and manual overrides). A holiday on a weekend is non-working once — never twice.
 */
import type { VacationBreakdown } from '../../domain/types';
import { diffDays, type IsoDate } from '../../lib/dates';
import type { HolidayCalendar } from './holidayCalendar';

export function calculateVacation(calendar: HolidayCalendar, departure: IsoDate, returnDate: IsoDate): VacationBreakdown {
  if (returnDate < departure) throw new Error(`Return ${returnDate} is before departure ${departure}`);
  const days = calendar.range(departure, returnDate);
  const workingDaysCovered = days.filter((d) => d.isWorkingDay).map((d) => d.date);
  const nonWorking = days.filter((d) => !d.isWorkingDay);
  const weekendDays = days.filter((d) => d.weekday === 0 || d.weekday === 6).length;
  const holidayDays = days.filter((d) => d.category === 'public_holiday' || d.category === 'transferred_day_off').length;
  return {
    calendarDays: days.length,
    nights: diffDays(departure, returnDate),
    workingDaysCovered,
    vacationDays: workingDaysCovered.length,
    nonWorkingDays: nonWorking.length,
    weekendDays,
    holidayDays,
    nonWorkingShare: days.length ? nonWorking.length / days.length : 0,
    days,
  };
}
