import { describe, expect, it, vi } from 'vitest';
import type { DepartureAirport, FlightOffer, SearchParams } from '../src/domain/types';
import { DEFAULT_DEPARTURE_AIRPORTS } from '../src/data/airports';
import { adjustedPrice, enabledAirports, formatEuro } from '../src/services/airports';
import { createCalendar, DEFAULT_CALENDAR_SETTINGS, DEFAULT_SCHEDULE } from '../src/services/calendar/holidayCalendar';
import { calculateVacation } from '../src/services/calendar/vacationDays';
import { createDemoProvider } from '../src/services/providers/demoProvider';
import { createLinksOnlyProvider } from '../src/services/providers/linksOnlyProvider';
import { ProviderError, type FlightProvider } from '../src/services/providers/types';
import { applyFilters, EMPTY_FILTERS, explainRank, sortResults, valueScore } from '../src/services/ranking';
import { createTtlCache } from '../src/services/search/cache';
import { runSearch } from '../src/services/search/searchEngine';
import { localToInstant } from '../src/lib/time';
import { defaultSearchParams } from '../src/services/storage';

const TODAY = '2026-11-24';
const calendar = () => createCalendar(DEFAULT_SCHEDULE, DEFAULT_CALENDAR_SETTINGS);
const airports = (): DepartureAirport[] => DEFAULT_DEPARTURE_AIRPORTS.map((a) => ({ ...a }));

function params(over: Partial<SearchParams> = {}): SearchParams {
  return {
    ...defaultSearchParams(TODAY),
    mode: 'specific',
    destinations: ['ROM'],
    earliestDeparture: '2027-01-01',
    latestDeparture: '2027-02-28',
    preferredDuration: 4,
    minDuration: 3,
    maxDuration: 5,
    maxVacationDays: null,
    ...over,
  };
}

function offer(origin: string, dest: string, dep: string, ret: string, price: number, opts: Partial<FlightOffer> = {}): FlightOffer {
  const depAt = localToInstant(dep, 10 * 60, 'Europe/Riga');
  const retAt = localToInstant(ret, 18 * 60, 'Europe/Rome');
  return {
    id: `t:${origin}:${dest}:${dep}:${ret}:${price}`,
    providerId: 'test',
    providerName: 'Test',
    origin,
    destination: dest,
    outbound: { from: origin, to: dest, departAt: depAt, arriveAt: new Date(new Date(depAt).getTime() + 180 * 60000).toISOString(), stops: 0 },
    inbound: { from: dest, to: origin, departAt: retAt, arriveAt: new Date(new Date(retAt).getTime() + 180 * 60000).toISOString(), stops: 0 },
    price,
    currency: 'EUR',
    priceKind: 'indicative',
    timesKnown: true,
    ...opts,
  };
}

function staticProvider(offers: FlightOffer[], extra: Partial<FlightProvider> = {}): FlightProvider {
  return {
    id: 'test',
    name: 'Test provider',
    description: '',
    capabilities: { supportsAnywhere: true, priceKind: 'indicative', maxConcurrency: 2, minIntervalMs: 0, cacheTtlMs: 60_000, canRevalidate: false },
    isAvailable: () => true,
    planRequests: (q) =>
      q.origins.map((o) => ({ key: `k|${o}`, label: o, origin: o, combinations: q.combinations, directOnly: q.directOnly })),
    execute: async (req) => offers.filter((x) => x.origin === req.origin),
    ...extra,
  };
}

describe('airport adjusted prices', () => {
  it('adds the airport cost to the ticket price', () => {
    expect(adjustedPrice(150, { additionalCost: 0 })).toBe(150);
    expect(adjustedPrice(60, { additionalCost: 100 })).toBe(160);
    expect(adjustedPrice(60, { additionalCost: -20 })).toBe(40);
    expect(adjustedPrice(null, { additionalCost: 100 })).toBeNull();
    expect(formatEuro(-20)).toBe('−€20');
  });

  it('disabled airports are excluded', () => {
    const list = airports();
    list[1].enabled = false;
    expect(enabledAirports(list).map((a) => a.code)).toEqual(['RIX', 'VNO', 'KUN']);
  });

  it('Riga €150 + €0 ranks above Kaunas €60 + €100', async () => {
    const p = staticProvider([offer('RIX', 'ROM', '2027-01-15', '2027-01-18', 150), offer('KUN', 'ROM', '2027-01-15', '2027-01-18', 60)]);
    const res = await runSearch({ params: params(), airports: airports(), provider: p, calendar: calendar(), schedule: DEFAULT_SCHEDULE, signal: new AbortController().signal, today: TODAY });
    const sorted = sortResults(res.results, { sortKey: 'adjusted_price', prioritiseFewestVacationDays: false, vacationDayValue: 100 });
    expect(sorted.map((r) => [r.airport.code, r.flightPrice, r.airportCost, r.adjustedPrice])).toEqual([
      ['RIX', 150, 0, 150],
      ['KUN', 60, 100, 160],
    ]);
    // Sorting by raw ticket price reverses the order
    const byTicket = sortResults(res.results, { sortKey: 'flight_price', prioritiseFewestVacationDays: false, vacationDayValue: 100 });
    expect(byTicket[0].airport.code).toBe('KUN');
    expect(explainRank(sorted[0], { sortKey: 'adjusted_price', prioritiseFewestVacationDays: false, vacationDayValue: 100 })).toContain('€150 adjusted');
  });

  it('a disabled airport is never searched', async () => {
    const list = airports();
    list.find((a) => a.code === 'KUN')!.enabled = false;
    const p = staticProvider([offer('RIX', 'ROM', '2027-01-15', '2027-01-18', 150), offer('KUN', 'ROM', '2027-01-15', '2027-01-18', 60)]);
    const res = await runSearch({ params: params(), airports: list, provider: p, calendar: calendar(), schedule: DEFAULT_SCHEDULE, signal: new AbortController().signal, today: TODAY });
    expect(res.results.map((r) => r.airport.code)).toEqual(['RIX']);
  });
});

describe('search engine', () => {
  it('drops offers outside the requested date combinations', async () => {
    const p = staticProvider([
      offer('RIX', 'ROM', '2027-01-15', '2027-01-18', 100), // 4 days ✓
      offer('RIX', 'ROM', '2027-01-15', '2027-01-25', 90), // 11 days ✗
      offer('RIX', 'ROM', '2027-03-15', '2027-03-18', 80), // outside window ✗
    ]);
    const res = await runSearch({ params: params(), airports: airports(), provider: p, calendar: calendar(), schedule: DEFAULT_SCHEDULE, signal: new AbortController().signal, today: TODAY });
    expect(res.results).toHaveLength(1);
    expect(res.results[0].combination).toMatchObject({ departure: '2027-01-15', return: '2027-01-18', duration: 4 });
  });

  it('enforces budget and vacation-day limits on adjusted price', async () => {
    const p = staticProvider([
      offer('RIX', 'ROM', '2027-01-16', '2027-01-18', 120), // Sat–Mon: 1 vacation day
      offer('KUN', 'ROM', '2027-01-16', '2027-01-18', 60), // 160 adjusted
      offer('RIX', 'ROM', '2027-01-13', '2027-01-17', 50), // Wed–Sun: 3 vacation days
    ]);
    const res = await runSearch({ params: params({ budget: 150, maxVacationDays: 2 }), airports: airports(), provider: p, calendar: calendar(), schedule: DEFAULT_SCHEDULE, signal: new AbortController().signal, today: TODAY });
    expect(res.results.map((r) => [r.airport.code, r.adjustedPrice])).toEqual([['RIX', 120]]);
  });

  it('every displayed vacation-day count matches the underlying calculation (demo data)', async () => {
    const cal = calendar();
    const res = await runSearch({
      params: params({ mode: 'anywhere', destinations: [] }),
      airports: airports(),
      provider: createDemoProvider(),
      calendar: cal,
      schedule: DEFAULT_SCHEDULE,
      signal: new AbortController().signal,
      today: TODAY,
    });
    expect(res.status).toBe('done');
    expect(res.results.length).toBeGreaterThan(100);
    const fresh = calendar();
    for (const r of res.results) {
      const v = calculateVacation(fresh, r.combination.departure, r.combination.return);
      expect(r.vacation.vacationDays).toBe(v.vacationDays);
      expect(r.adjustedPrice).toBe((r.flightPrice ?? 0) + r.airportCost);
      expect(r.offer.priceKind).toBe('demo');
      expect(r.combination.duration).toBeGreaterThanOrEqual(3);
      expect(r.combination.duration).toBeLessThanOrEqual(5);
    }
  });

  it('excludes countries in anywhere mode', async () => {
    const base = { airports: airports(), provider: createDemoProvider(), calendar: calendar(), schedule: DEFAULT_SCHEDULE, today: TODAY };
    const all = await runSearch({ ...base, params: params({ mode: 'anywhere', destinations: [] }), signal: new AbortController().signal });
    expect(all.results.some((r) => r.destination.countryCode === 'IT')).toBe(true);
    const res = await runSearch({ ...base, params: params({ mode: 'anywhere', destinations: [], excludedCountries: ['IT', 'ES'] }), signal: new AbortController().signal });
    expect(res.results.length).toBeGreaterThan(0);
    expect(res.results.some((r) => ['IT', 'ES'].includes(r.destination.countryCode))).toBe(false);
  });

  it('demo data is deterministic', async () => {
    const run = () =>
      runSearch({ params: params(), airports: airports(), provider: createDemoProvider(), calendar: calendar(), schedule: DEFAULT_SCHEDULE, signal: new AbortController().signal, today: TODAY });
    const [a, b] = await Promise.all([run(), run()]);
    expect(a.results.map((r) => r.adjustedPrice)).toEqual(b.results.map((r) => r.adjustedPrice));
  });

  it('groups requests per origin × destination × month', async () => {
    const provider = createDemoProvider();
    const spy = vi.spyOn(provider, 'execute');
    const res = await runSearch({ params: params({ destinations: ['ROM', 'BCN'] }), airports: airports(), provider, calendar: calendar(), schedule: DEFAULT_SCHEDULE, signal: new AbortController().signal, today: TODAY });
    expect(res.totalRequests).toBe(4 * 2 * 2);
    expect(spy).toHaveBeenCalledTimes(16);
  });

  it('serves repeated searches from cache', async () => {
    const execute = vi.fn(async () => [offer('RIX', 'ROM', '2027-01-15', '2027-01-18', 150)]);
    const p = staticProvider([], { execute });
    const cache = createTtlCache<FlightOffer[]>();
    const input = { params: params(), airports: airports(), provider: p, calendar: calendar(), schedule: DEFAULT_SCHEDULE, cache, today: TODAY };
    await runSearch({ ...input, signal: new AbortController().signal });
    const second = await runSearch({ ...input, signal: new AbortController().signal });
    expect(execute).toHaveBeenCalledTimes(4);
    expect(second.cachedRequests).toBe(4);
  });

  it('retries retryable errors and reports permanent failures as partial results', async () => {
    let calls = 0;
    const p = staticProvider([], {
      execute: async (req) => {
        if (req.origin === 'TLL') throw new ProviderError('bad request', 400, false);
        if (req.origin === 'RIX' && calls++ === 0) throw new ProviderError('rate limited', 429, true, 1);
        return req.origin === 'RIX' ? [offer('RIX', 'ROM', '2027-01-15', '2027-01-18', 150)] : [];
      },
    });
    const res = await runSearch({ params: params(), airports: airports(), provider: p, calendar: calendar(), schedule: DEFAULT_SCHEDULE, signal: new AbortController().signal, today: TODAY });
    expect(res.status).toBe('done');
    expect(res.results).toHaveLength(1);
    expect(res.failedRequests).toBe(1);
    expect(res.errors[0].label).toBe('TLL');
  });

  it('can be cancelled', async () => {
    const ctrl = new AbortController();
    const p = staticProvider([], {
      execute: (_req, signal) =>
        new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))),
    });
    const promise = runSearch({ params: params(), airports: airports(), provider: p, calendar: calendar(), schedule: DEFAULT_SCHEDULE, signal: ctrl.signal, today: TODAY });
    setTimeout(() => ctrl.abort(), 10);
    expect((await promise).status).toBe('cancelled');
  });

  it('reports progress incrementally', async () => {
    const seen: number[] = [];
    await runSearch({
      params: params(),
      airports: airports(),
      provider: createDemoProvider(),
      calendar: calendar(),
      schedule: DEFAULT_SCHEDULE,
      signal: new AbortController().signal,
      today: TODAY,
      onProgress: (p) => seen.push(p.completedRequests),
    });
    expect(seen.at(-1)).toBe(8);
    expect(new Set(seen).size).toBeGreaterThan(2);
  });

  it('works without any price data (links-only mode)', async () => {
    const res = await runSearch({ params: params({ maxVacationDays: 1 }), airports: airports(), provider: createLinksOnlyProvider(), calendar: calendar(), schedule: DEFAULT_SCHEDULE, signal: new AbortController().signal, today: TODAY });
    expect(res.results.length).toBeGreaterThan(0);
    for (const r of res.results) {
      expect(r.adjustedPrice).toBeNull();
      expect(r.offer.priceKind).toBe('unpriced');
      expect(r.vacation.vacationDays).toBeLessThanOrEqual(1);
      expect(r.externalLinks.length).toBeGreaterThan(0);
    }
    const sorted = sortResults(res.results, { sortKey: 'weekend_utilisation', prioritiseFewestVacationDays: true, vacationDayValue: 100 });
    expect(sorted[0].vacation.vacationDays).toBe(0);
  });

  it('rejects invalid searches', async () => {
    const res = await runSearch({ params: params({ minDuration: 6 }), airports: airports(), provider: createDemoProvider(), calendar: calendar(), schedule: DEFAULT_SCHEDULE, signal: new AbortController().signal, today: TODAY });
    expect(res.status).toBe('error');
  });
});

describe('ranking', () => {
  it('value score is transparent', async () => {
    const p = staticProvider([offer('RIX', 'ROM', '2027-01-16', '2027-01-19', 100)]); // Sat–Tue: 2 vacation days, 4 days
    const res = await runSearch({ params: params(), airports: airports(), provider: p, calendar: calendar(), schedule: DEFAULT_SCHEDULE, signal: new AbortController().signal, today: TODAY });
    const r = res.results[0];
    expect(valueScore(r, 100)).toBe((100 + 2 * 100) / 4);
    expect(explainRank(r, { sortKey: 'value_score', prioritiseFewestVacationDays: false, vacationDayValue: 100 })).toContain('2 vacation day(s) × €100');
  });

  it('prioritising vacation days puts fewer days first regardless of price', async () => {
    const p = staticProvider([offer('RIX', 'ROM', '2027-01-13', '2027-01-17', 40), offer('RIX', 'ROM', '2027-01-16', '2027-01-18', 200)]);
    const res = await runSearch({ params: params(), airports: airports(), provider: p, calendar: calendar(), schedule: DEFAULT_SCHEDULE, signal: new AbortController().signal, today: TODAY });
    expect(sortResults(res.results, { sortKey: 'adjusted_price', prioritiseFewestVacationDays: false, vacationDayValue: 0 })[0].flightPrice).toBe(40);
    expect(sortResults(res.results, { sortKey: 'adjusted_price', prioritiseFewestVacationDays: true, vacationDayValue: 0 })[0].flightPrice).toBe(200);
  });

  it('filters by airport, stops and price', async () => {
    const p = staticProvider([
      offer('RIX', 'ROM', '2027-01-15', '2027-01-18', 150),
      offer('VNO', 'ROM', '2027-01-15', '2027-01-18', 50, { outbound: { ...offer('VNO', 'ROM', '2027-01-15', '2027-01-18', 50).outbound, stops: 1 } }),
    ]);
    const res = await runSearch({ params: params(), airports: airports(), provider: p, calendar: calendar(), schedule: DEFAULT_SCHEDULE, signal: new AbortController().signal, today: TODAY });
    expect(applyFilters(res.results, { ...EMPTY_FILTERS, directOnly: true }).map((r) => r.airport.code)).toEqual(['RIX']);
    expect(applyFilters(res.results, { ...EMPTY_FILTERS, airports: ['VNO'] }).map((r) => r.airport.code)).toEqual(['VNO']);
    expect(applyFilters(res.results, { ...EMPTY_FILTERS, maxAdjustedPrice: 149 })).toHaveLength(0);
  });
});
