/**
 * Flags potential clashes between flight times and the user's working hours.
 *
 * This NEVER changes the date-based vacation-day count. It only surfaces
 * information (e.g. "06:00 departure on a working day" or "22:00 departure after
 * work — you may not need this day off").
 */
import type { FlightOffer, TimeConflict, WorkSchedule } from '../../domain/types';
import { formatHuman, type IsoDate } from '../../lib/dates';
import { formatMinutes, toLocal } from '../../lib/time';
import type { HolidayCalendar } from './holidayCalendar';

export interface ConflictContext {
  calendar: HolidayCalendar;
  schedule: WorkSchedule;
  /** Time zone of the departure (home) airport */
  homeTimeZone: string;
  /** Time zone of the airport you return to, if different */
  returnTimeZone?: string;
}

function workHours(calendar: HolidayCalendar, schedule: WorkSchedule, date: IsoDate) {
  const day = calendar.day(date);
  if (!day.isWorkingDay) return null;
  return { start: schedule.workStart, end: day.isShortened ? schedule.workEnd - 60 : schedule.workEnd, shortened: day.isShortened };
}

export function detectTimeConflicts(offer: FlightOffer, ctx: ConflictContext): TimeConflict[] {
  const { calendar, schedule, homeTimeZone } = ctx;
  const out: TimeConflict[] = [];
  const buffer = schedule.travelBufferMinutes;

  // Outbound departure, evaluated in the home airport's local time
  const dep = toLocal(offer.outbound.departAt, homeTimeZone);
  const depHours = workHours(calendar, schedule, dep.date);
  if (depHours) {
    const latestLeaveWork = dep.minutes - buffer;
    if (latestLeaveWork >= depHours.end) {
      out.push({
        leg: 'outbound',
        severity: 'info',
        message: `Departs ${dep.hhmm} on ${formatHuman(dep.date, { weekday: true })}, after working hours${depHours.shortened ? ' (shortened day)' : ''}. You may be able to work that day; it is still counted as a vacation day.`,
      });
    } else if (latestLeaveWork > depHours.start) {
      out.push({
        leg: 'outbound',
        severity: 'warning',
        message: `Departs ${dep.hhmm} on working day ${formatHuman(dep.date, { weekday: true })}; with a ${buffer} min travel buffer you would leave work at ${formatMinutes(Math.max(latestLeaveWork, 0))}, before ${formatMinutes(depHours.end)}.`,
      });
    } else {
      out.push({
        leg: 'outbound',
        severity: 'warning',
        message: `Departs ${dep.hhmm} on working day ${formatHuman(dep.date, { weekday: true })}: the whole day off is needed.`,
      });
    }
  }

  // Inbound arrival at home
  if (offer.inbound.arriveAt) {
    const backTz = ctx.returnTimeZone ?? homeTimeZone;
    const arr = toLocal(offer.inbound.arriveAt, backTz);
    const arrHours = workHours(calendar, schedule, arr.date);
    const retDate = toLocal(offer.inbound.departAt, backTz).date;
    if (arr.date > retDate) {
      out.push({
        leg: 'inbound',
        severity: arrHours ? 'warning' : 'info',
        message: `Overnight return: arrives ${arr.hhmm} on ${formatHuman(arr.date, { weekday: true })}${arrHours ? ', a working day not included in the trip dates' : ''}.`,
      });
    }
    if (arrHours) {
      const readyAt = arr.minutes + buffer;
      if (arr.minutes >= arrHours.end) {
        out.push({ leg: 'inbound', severity: 'info', message: `Arrives ${arr.hhmm} after working hours on ${formatHuman(arr.date, { weekday: true })}. This working day is still counted as a vacation day.` });
      } else if (readyAt > arrHours.start) {
        out.push({ leg: 'inbound', severity: 'warning', message: `Arrives ${arr.hhmm} on working day ${formatHuman(arr.date, { weekday: true })}, during/just before working hours (${formatMinutes(arrHours.start)}–${formatMinutes(arrHours.end)}).` });
      } else {
        out.push({ leg: 'inbound', severity: 'info', message: `Early arrival ${arr.hhmm} on working day ${formatHuman(arr.date, { weekday: true })}. Working that day is possible but tiring.` });
      }
    }
  } else {
    out.push({ leg: 'inbound', severity: 'info', message: 'Return arrival time is unknown; check it on the booking site.' });
  }

  return out;
}
