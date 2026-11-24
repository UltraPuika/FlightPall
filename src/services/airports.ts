/**
 * Departure-airport configuration and adjusted-price arithmetic.
 *
 *   Adjusted price = Flight price + Airport additional cost
 *
 * The airport cost is a per-trip (return) amount configured by the user. It may be
 * zero or negative. It is applied once per booking, independent of passengers.
 */
import type { DepartureAirport } from '../domain/types';

export function enabledAirports(airports: DepartureAirport[]): DepartureAirport[] {
  return airports.filter((a) => a.enabled);
}

export function adjustedPrice(flightPrice: number | null, airport: Pick<DepartureAirport, 'additionalCost'>): number | null {
  if (flightPrice === null || !Number.isFinite(flightPrice)) return null;
  return round2(flightPrice + (Number.isFinite(airport.additionalCost) ? airport.additionalCost : 0));
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function formatEuro(n: number | null, opts: { signed?: boolean } = {}): string {
  if (n === null) return '—';
  const abs = Math.abs(n);
  const str = Number.isInteger(abs) ? abs.toFixed(0) : abs.toFixed(2);
  const sign = n < 0 ? '−' : opts.signed ? '+' : '';
  return `${sign}€${str}`;
}

export function validateAirport(a: Partial<DepartureAirport>): string[] {
  const errors: string[] = [];
  if (!a.code || !/^[A-Z]{3}$/.test(a.code)) errors.push('Airport code must be 3 uppercase letters (IATA).');
  if (!a.city?.trim()) errors.push('City is required.');
  if (a.additionalCost === undefined || !Number.isFinite(a.additionalCost)) errors.push('Additional cost must be a number.');
  if (a.timeZone) {
    try {
      new Intl.DateTimeFormat('en', { timeZone: a.timeZone });
    } catch {
      errors.push('Unknown time zone.');
    }
  }
  return errors;
}

/** Insert or replace an airport by code, preserving order. */
export function upsertAirport(list: DepartureAirport[], airport: DepartureAirport): DepartureAirport[] {
  const idx = list.findIndex((a) => a.code === airport.code);
  if (idx === -1) return [...list, airport];
  const copy = list.slice();
  copy[idx] = airport;
  return copy;
}
