/**
 * Builds trips that return to a different home airport (e.g. RIX → BUD → VNO) by
 * pairing two one-way fares. Same-airport pairs are kept too: two one-ways are
 * sometimes cheaper than a round trip; deduplication later keeps the cheapest.
 */
import type { DateCombination, DepartureAirport, FlightOffer, OneWayFare } from '../../domain/types';
import { findDestination } from '../../data/airports';
import { toLocal } from '../../lib/time';

export function combineOneWayFares(
  outbound: OneWayFare[],
  inbound: OneWayFare[],
  combinations: DateCombination[],
  airportsByCode: Map<string, DepartureAirport>,
): FlightOffer[] {
  const combosByDeparture = new Map<string, DateCombination[]>();
  for (const c of combinations) {
    const list = combosByDeparture.get(c.departure) ?? [];
    list.push(c);
    combosByDeparture.set(c.departure, list);
  }

  // Cheapest inbound fare per destination city → local departure date → home airport
  const inIndex = new Map<string, Map<string, Map<string, OneWayFare>>>();
  for (const f of inbound) {
    const home = airportsByCode.get(f.leg.to) ?? airportsByCode.get(f.to);
    if (!home) continue;
    const dest = findDestination(f.from);
    const city = dest.code;
    const date = toLocal(f.leg.departAt, dest.timeZone === 'UTC' ? home.timeZone : dest.timeZone).date;
    const byDate = inIndex.get(city) ?? new Map<string, Map<string, OneWayFare>>();
    const byHome = byDate.get(date) ?? new Map<string, OneWayFare>();
    const cur = byHome.get(home.code);
    if (!cur || f.price < cur.price) byHome.set(home.code, f);
    byDate.set(date, byHome);
    inIndex.set(city, byDate);
  }

  // Cheapest outbound fare per origin × destination × local date
  const outBest = new Map<string, OneWayFare>();
  for (const f of outbound) {
    const origin = airportsByCode.get(f.leg.from) ?? airportsByCode.get(f.from);
    if (!origin) continue;
    const date = toLocal(f.leg.departAt, origin.timeZone).date;
    const key = `${origin.code}|${findDestination(f.to).code}|${date}`;
    const cur = outBest.get(key);
    if (!cur || f.price < cur.price) outBest.set(key, f);
  }

  const offers: FlightOffer[] = [];
  for (const [key, out] of outBest) {
    const [originCode, city, date] = key.split('|');
    const byDate = inIndex.get(city);
    if (!byDate) continue;
    for (const c of combosByDeparture.get(date) ?? []) {
      const byHome = byDate.get(c.return);
      if (!byHome) continue;
      for (const [homeCode, back] of byHome) {
        offers.push({
          id: `ow:${out.id}|${back.id}`,
          providerId: out.providerId,
          providerName: `${out.providerName}, 2 one-way tickets`,
          origin: originCode,
          destination: city,
          destinationAirport: out.toAirport,
          outbound: out.leg,
          inbound: { ...back.leg, to: homeCode },
          price: Math.round((out.price + back.price) * 100) / 100,
          currency: 'EUR',
          priceKind: out.priceKind === 'demo' || back.priceKind === 'demo' ? 'demo' : 'indicative',
          timesKnown: true,
          observedAt: out.observedAt,
          bookingProvider: out.providerId === 'demo' ? 'Demo data, not bookable' : 'Aviasales',
          legLinks: [
            ...(out.bookingUrl ? [{ label: `Book ${originCode}→${city}`, url: out.bookingUrl }] : []),
            ...(back.bookingUrl ? [{ label: `Book ${city}→${homeCode}`, url: back.bookingUrl }] : []),
          ],
        });
      }
    }
  }
  return offers;
}
