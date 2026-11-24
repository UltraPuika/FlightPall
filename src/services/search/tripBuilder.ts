/**
 * Converts raw provider offers into fully-evaluated TripResults:
 * adjusted price, vacation days, time conflicts, preference matches and links.
 */
import type {
  DateCombination,
  DepartureAirport,
  FlightOffer,
  SearchParams,
  TripResult,
  WorkSchedule,
} from '../../domain/types';
import { findDestination } from '../../data/airports';
import { type IsoDate } from '../../lib/dates';
import { toLocal } from '../../lib/time';
import { adjustedPrice } from '../airports';
import type { HolidayCalendar } from '../calendar/holidayCalendar';
import { detectTimeConflicts } from '../calendar/timeConflicts';
import { calculateVacation } from '../calendar/vacationDays';
import { externalSearchLinks } from '../providers/externalLinks';
import { combinationKey, durationOf } from './dateCombinations';

export interface TripBuildContext {
  params: SearchParams;
  calendar: HolidayCalendar;
  schedule: WorkSchedule;
  airportsByCode: Map<string, DepartureAirport>;
  combinationsByKey: Map<string, DateCombination>;
}

function localDates(offer: FlightOffer, homeTz: string, destTz: string) {
  const destZone = destTz === 'UTC' ? homeTz : destTz;
  const od = toLocal(offer.outbound.departAt, homeTz);
  const oa = offer.outbound.arriveAt ? toLocal(offer.outbound.arriveAt, destZone) : undefined;
  const id = toLocal(offer.inbound.departAt, destZone);
  const ia = offer.inbound.arriveAt ? toLocal(offer.inbound.arriveAt, homeTz) : undefined;
  return {
    outboundLocal: { depart: od.hhmm, departDate: od.date, arrive: oa?.hhmm, arriveDate: oa?.date },
    inboundLocal: { depart: id.hhmm, departDate: id.date, arrive: ia?.hhmm, arriveDate: ia?.date },
  };
}

/**
 * Returns null when the offer falls outside the search window or violates hard
 * constraints (budget, vacation-day limit, stops).
 */
export function buildTripResult(offer: FlightOffer, requestOrigin: string, ctx: TripBuildContext): TripResult | null {
  const airport = ctx.airportsByCode.get(offer.origin) ?? ctx.airportsByCode.get(requestOrigin);
  if (!airport) return null;
  const destination = findDestination(offer.destination);
  const { outboundLocal, inboundLocal } = localDates(offer, airport.timeZone, destination.timeZone);
  const departure: IsoDate = outboundLocal.departDate;
  const ret: IsoDate = inboundLocal.departDate;
  if (ret < departure) return null;
  const combination = ctx.combinationsByKey.get(combinationKey({ departure, return: ret }));
  if (!combination) return null; // not one of the requested date combinations

  const p = ctx.params;
  const stops = Math.max(offer.outbound.stops, offer.inbound.stops);
  if (p.directOnly && stops > 0) return null;
  if (p.maxStops !== null && stops > p.maxStops) return null;

  const vacation = calculateVacation(ctx.calendar, departure, ret);
  if (p.maxVacationDays !== null && vacation.vacationDays > p.maxVacationDays) return null;

  const adj = adjustedPrice(offer.price, airport);
  if (p.budget !== null && adj !== null && adj > p.budget) return null;

  const conflicts = offer.timesKnown
    ? detectTimeConflicts(offer, { calendar: ctx.calendar, schedule: ctx.schedule, homeTimeZone: airport.timeZone })
    : [];

  const preferenceMatches: string[] = [];
  const depDay = vacation.days[0];
  const retDay = vacation.days[vacation.days.length - 1];
  if (p.preferWeekendDeparture && !depDay.isWorkingDay) preferenceMatches.push('Departs on a non-working day');
  if (p.preferWeekendReturn && !retDay.isWorkingDay) preferenceMatches.push('Returns on a non-working day');
  if (offer.timesKnown) {
    const outConflict = conflicts.find((c) => c.leg === 'outbound');
    const inWarning = conflicts.some((c) => c.leg === 'inbound' && c.severity === 'warning');
    if (p.preferDepartureAfterWork && (!depDay.isWorkingDay || (outConflict && outConflict.severity === 'info')))
      preferenceMatches.push('Departure outside working hours');
    if (p.preferArrivalOutsideWork && offer.inbound.arriveAt && !inWarning) preferenceMatches.push('Arrival outside working hours');
  }

  return {
    id: `${airport.code}|${destination.code}|${departure}|${ret}|${offer.id}`,
    offer,
    combination: { ...combination, duration: durationOf(departure, ret, p.durationMode) },
    airport,
    destination,
    flightPrice: offer.price,
    airportCost: airport.additionalCost,
    adjustedPrice: adj,
    vacation,
    conflicts,
    outboundLocal,
    inboundLocal,
    preferenceMatches,
    externalLinks: externalSearchLinks(airport.code, destination.code, departure, ret),
  };
}

/** Keep the cheapest result per airport × destination × date pair. */
export function dedupeResults(results: Iterable<TripResult>): TripResult[] {
  const best = new Map<string, TripResult>();
  for (const r of results) {
    const key = `${r.airport.code}|${r.destination.code}|${r.combination.departure}|${r.combination.return}`;
    const cur = best.get(key);
    if (!cur || (r.flightPrice ?? Infinity) < (cur.flightPrice ?? Infinity)) best.set(key, r);
  }
  return Array.from(best.values());
}
