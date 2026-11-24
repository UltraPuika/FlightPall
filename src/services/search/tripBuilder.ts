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
import { adjustedPrice, round2 } from '../airports';
import type { HolidayCalendar } from '../calendar/holidayCalendar';
import { detectTimeConflicts } from '../calendar/timeConflicts';
import { calculateVacation } from '../calendar/vacationDays';
import { externalSearchLinks, openJawSearchLinks } from '../providers/externalLinks';
import { combinationKey, durationOf } from './dateCombinations';

export interface TripBuildContext {
  params: SearchParams;
  calendar: HolidayCalendar;
  schedule: WorkSchedule;
  /** Enabled departure airports */
  airportsByCode: Map<string, DepartureAirport>;
  combinationsByKey: Map<string, DateCombination>;
  /** Codes that must never appear as destinations (all configured departure airports) */
  excludedDestinations?: Set<string>;
}

/**
 * Airport cost of a trip. A normal round trip pays the airport's (round-trip) cost once.
 * Flying out of A and back into B pays half of each: ½·cost(A) + ½·cost(B).
 */
export function tripAirportCost(out: Pick<DepartureAirport, 'code' | 'additionalCost'>, back: Pick<DepartureAirport, 'code' | 'additionalCost'>): number {
  if (out.code === back.code) return out.additionalCost;
  return round2(out.additionalCost / 2 + back.additionalCost / 2);
}

function localDates(offer: FlightOffer, homeTz: string, returnTz: string, destTz: string) {
  const destZone = destTz === 'UTC' ? homeTz : destTz;
  const od = toLocal(offer.outbound.departAt, homeTz);
  const oa = offer.outbound.arriveAt ? toLocal(offer.outbound.arriveAt, destZone) : undefined;
  const id = toLocal(offer.inbound.departAt, destZone);
  const ia = offer.inbound.arriveAt ? toLocal(offer.inbound.arriveAt, returnTz) : undefined;
  return {
    outboundLocal: { depart: od.hhmm, departDate: od.date, arrive: oa?.hhmm, arriveDate: oa?.date },
    inboundLocal: { depart: id.hhmm, departDate: id.date, arrive: ia?.hhmm, arriveDate: ia?.date },
  };
}

/**
 * Returns null when the offer falls outside the search window or violates hard
 * constraints (budget, vacation-day limit, stops, excluded destination).
 */
export function buildTripResult(offer: FlightOffer, requestOrigin: string, ctx: TripBuildContext): TripResult | null {
  const airport = ctx.airportsByCode.get(offer.origin) ?? ctx.airportsByCode.get(requestOrigin);
  if (!airport) return null;
  const backCode = offer.inbound.to;
  const returnAirport = !backCode || backCode === offer.origin || backCode === airport.code ? airport : ctx.airportsByCode.get(backCode);
  if (!returnAirport) return null; // returns to an airport that isn't enabled
  const differentReturnAirport = returnAirport.code !== airport.code;
  if (differentReturnAirport && !ctx.params.allowDifferentReturnAirport) return null;

  const destination = findDestination(offer.destination);
  const ex = ctx.excludedDestinations;
  if (ex && (ex.has(destination.code) || (offer.destinationAirport && ex.has(offer.destinationAirport)))) return null;

  const { outboundLocal, inboundLocal } = localDates(offer, airport.timeZone, returnAirport.timeZone, destination.timeZone);
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

  const airportCost = tripAirportCost(airport, returnAirport);
  const pax = Math.max(1, Math.floor(p.passengers ?? 1));
  const airportCostTotal = round2(airportCost * ((p.airportCostPerPerson ?? true) ? pax : 1));
  const ticketTotal = offer.price === null ? null : round2(offer.price * pax);
  const adj = adjustedPrice(ticketTotal, { additionalCost: airportCostTotal });
  if (p.budget !== null && adj !== null && adj > p.budget) return null;

  const conflicts = offer.timesKnown
    ? detectTimeConflicts(offer, { calendar: ctx.calendar, schedule: ctx.schedule, homeTimeZone: airport.timeZone, returnTimeZone: returnAirport.timeZone })
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
    id: `${airport.code}|${destination.code}|${returnAirport.code}|${departure}|${ret}|${offer.id}`,
    offer,
    combination: { ...combination, duration: durationOf(departure, ret, p.durationMode) },
    airport,
    returnAirport,
    differentReturnAirport,
    destination,
    flightPrice: offer.price,
    passengers: pax,
    ticketTotal,
    airportCostTotal,
    airportCost,
    adjustedPrice: adj,
    vacation,
    conflicts,
    outboundLocal,
    inboundLocal,
    preferenceMatches,
    externalLinks: differentReturnAirport
      ? openJawSearchLinks(airport.code, destination.code, returnAirport.code, departure, ret, pax)
      : externalSearchLinks(airport.code, destination.code, departure, ret, pax),
  };
}

/** Keep the cheapest result per outbound airport × destination × return airport × date pair. */
export function dedupeResults(results: Iterable<TripResult>): TripResult[] {
  const best = new Map<string, TripResult>();
  for (const r of results) {
    const key = `${r.airport.code}|${r.destination.code}|${r.returnAirport.code}|${r.combination.departure}|${r.combination.return}`;
    const cur = best.get(key);
    if (!cur || (r.flightPrice ?? Infinity) < (cur.flightPrice ?? Infinity)) best.set(key, r);
  }
  return Array.from(best.values());
}
