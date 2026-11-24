/**
 * DEMO provider — synthetic, deterministic sample data for trying the engine without
 * any flight API. Every offer is labelled `priceKind: 'demo'` and the UI marks it
 * "Sample data — not a real flight". Prices, times and routes are NOT real.
 */
import type { DateCombination, FlightOffer } from '../../domain/types';
import { DESTINATIONS, findDestination } from '../../data/airports';
import { monthsInRange, weekdayOf } from '../../lib/dates';
import { addMinutesToInstant, localToInstant } from '../../lib/time';
import type { FlightProvider, ProviderRequest, ProviderSearchQuery } from './types';

function hash(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic pseudo-random in [0, 1) for a key. */
function rand(key: string): number {
  let t = hash(key) + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const ORIGIN_TZ: Record<string, string> = {
  RIX: 'Europe/Riga',
  TLL: 'Europe/Tallinn',
  VNO: 'Europe/Vilnius',
  KUN: 'Europe/Vilnius',
  PLQ: 'Europe/Vilnius',
  HEL: 'Europe/Helsinki',
};

/** Share of destinations "served" from each origin in the demo network. */
const COVERAGE: Record<string, number> = { RIX: 0.75, TLL: 0.45, VNO: 0.6, KUN: 0.3 };

const BASE_MINUTES: Record<string, number> = {
  Nordics: 110,
  Baltics: 60,
  'Central Europe': 120,
  'Western Europe': 160,
  'British Isles': 170,
  'Southern Europe': 220,
  Balkans: 150,
  'Eastern Europe': 120,
  'Eastern Mediterranean': 210,
  'Middle East': 330,
  'North Africa': 330,
  Other: 180,
};

export function demoServesRoute(origin: string, destination: string): boolean {
  if (origin === destination) return false;
  return rand(`route:${origin}:${destination}`) < (COVERAGE[origin] ?? 0.4);
}

function buildOffer(origin: string, destCode: string, c: DateCombination, directOnly: boolean): FlightOffer | null {
  const dest = findDestination(destCode);
  const key = `${origin}:${destCode}:${c.departure}:${c.return}`;
  const stops = rand(`stops:${origin}:${destCode}`) < 0.55 ? 0 : 1;
  if (directOnly && stops > 0) return null;
  // Not every day has a flight
  if (rand(`out-day:${origin}:${destCode}:${c.departure}`) < 0.25) return null;
  if (rand(`ret-day:${origin}:${destCode}:${c.return}`) < 0.25) return null;

  const base = BASE_MINUTES[dest.region] ?? 180;
  const routeBase = 35 + base * 0.45 + rand(`base:${origin}:${destCode}`) * 120;
  const wd = weekdayOf(c.departure);
  const weekendPremium = wd === 5 || wd === 6 ? 1.18 : 1;
  const noise = 0.65 + rand(`price:${key}`) * 0.9;
  const price = Math.max(19, Math.round(routeBase * weekendPremium * noise + (stops ? 25 : 0)));

  const tz = ORIGIN_TZ[origin] ?? 'Europe/Riga';
  const outMinutes = (6 + Math.floor(rand(`t-out:${key}`) * 17)) * 60 + (rand(`tm-out:${key}`) < 0.5 ? 0 : 30);
  const inMinutes = (6 + Math.floor(rand(`t-in:${key}`) * 17)) * 60 + (rand(`tm-in:${key}`) < 0.5 ? 15 : 45);
  const outDur = Math.round(base + stops * (70 + rand(`lay-out:${key}`) * 120));
  const inDur = Math.round(base + 10 + stops * (70 + rand(`lay-in:${key}`) * 120));
  const outDepart = localToInstant(c.departure, outMinutes, tz);
  const inDepart = localToInstant(c.return, inMinutes, dest.timeZone === 'UTC' ? tz : dest.timeZone);

  return {
    id: `demo:${key}`,
    providerId: 'demo',
    providerName: 'Demo data',
    origin,
    destination: destCode,
    destinationAirport: dest.airports[0],
    outbound: { from: origin, to: dest.airports[0], departAt: outDepart, arriveAt: addMinutesToInstant(outDepart, outDur), durationMinutes: outDur, stops },
    inbound: { from: dest.airports[0], to: origin, departAt: inDepart, arriveAt: addMinutesToInstant(inDepart, inDur), durationMinutes: inDur, stops },
    price,
    currency: 'EUR',
    priceKind: 'demo',
    timesKnown: true,
    bookingProvider: 'Demo data — not bookable',
  };
}

export function createDemoProvider(): FlightProvider {
  return {
    id: 'demo',
    name: 'Demo mode (sample data)',
    description: 'Synthetic, deterministic sample fares for exploring the app. Not real flights or prices.',
    capabilities: {
      supportsAnywhere: true,
      priceKind: 'demo',
      maxConcurrency: 4,
      minIntervalMs: 0,
      cacheTtlMs: 0,
      canRevalidate: false,
    },
    isAvailable: () => true,
    planRequests(query: ProviderSearchQuery): ProviderRequest[] {
      if (!query.combinations.length) return [];
      const first = query.combinations.reduce((m, c) => (c.departure < m ? c.departure : m), query.combinations[0].departure);
      const last = query.combinations.reduce((m, c) => (c.departure > m ? c.departure : m), query.combinations[0].departure);
      const months = monthsInRange(first, last);
      const dests = query.destinations === 'anywhere' ? [undefined] : query.destinations;
      const out: ProviderRequest[] = [];
      for (const origin of query.origins)
        for (const destination of dests)
          for (const month of months) {
            const combinations = query.combinations.filter((c) => c.departure.startsWith(month));
            if (!combinations.length) continue;
            out.push({
              key: `demo|${origin}|${destination ?? '*'}|${month}|${query.directOnly ? 'd' : 'a'}`,
              label: `${origin} → ${destination ?? 'anywhere'} · ${month}`,
              origin,
              destination,
              month,
              combinations,
              directOnly: query.directOnly,
            });
          }
      return out;
    },
    async execute(req, signal) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      await new Promise((r) => setTimeout(r, 40)); // simulate latency, keep UI responsive
      const destinations = req.destination ? [req.destination] : DESTINATIONS.map((d) => d.code);
      const offers: FlightOffer[] = [];
      for (const d of destinations) {
        if (!demoServesRoute(req.origin, d)) continue;
        const perDest: FlightOffer[] = [];
        for (const c of req.combinations) {
          const o = buildOffer(req.origin, d, c, req.directOnly);
          if (o) perDest.push(o);
        }
        // Like real "anywhere" fare caches, only the cheapest few per destination are returned
        if (!req.destination) perDest.sort((a, b) => (a.price ?? 0) - (b.price ?? 0)).splice(12);
        offers.push(...perDest);
      }
      return offers;
    },
  };
}
