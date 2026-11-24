import { describe, expect, it } from 'vitest';
import { createTravelpayoutsProvider, parseTravelpayoutsResponse } from '../src/services/providers/travelpayoutsProvider';
import { externalSearchLinks } from '../src/services/providers/externalLinks';
import { detectTimeConflicts } from '../src/services/calendar/timeConflicts';
import { createCalendar, DEFAULT_CALENDAR_SETTINGS, DEFAULT_SCHEDULE } from '../src/services/calendar/holidayCalendar';
import type { FlightOffer } from '../src/domain/types';
import { localToInstant } from '../src/lib/time';
import { createTtlCache } from '../src/services/search/cache';

describe('Travelpayouts provider', () => {
  const sample = {
    success: true,
    currency: 'eur',
    data: [
      {
        origin: 'RIX',
        destination: 'ROM',
        origin_airport: 'RIX',
        destination_airport: 'FCO',
        price: 149,
        airline: 'BT',
        flight_number: '633',
        departure_at: '2027-01-15T06:10:00+02:00',
        return_at: '2027-01-18T20:40:00+01:00',
        transfers: 0,
        return_transfers: 0,
        duration_to: 185,
        duration_back: 175,
        link: '/search/RIX1501ROM18011?t=abc',
      },
      { origin: 'RIX', destination: 'ROM', price: 50, departure_at: '2027-01-15T06:10:00+02:00' }, // one-way: skipped
    ],
  };

  it('parses rows into indicative offers', () => {
    const offers = parseTravelpayoutsResponse(sample, '2026-11-24T12:00:00Z');
    expect(offers).toHaveLength(1);
    const o = offers[0];
    expect(o.priceKind).toBe('indicative');
    expect(o.price).toBe(149);
    expect(o.outbound.arriveAt).toBe('2027-01-15T07:15:00.000Z');
    expect(o.bookingUrl).toBe('https://www.aviasales.com/search/RIX1501ROM18011?t=abc');
  });

  it('requests a whole month per origin × destination through the proxy (no token in the browser)', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      return new Response(JSON.stringify(sample), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as unknown as typeof fetch;
    const p = createTravelpayoutsProvider('https://proxy.example.workers.dev/', fetchImpl);
    const [req] = p.planRequests({
      origins: ['RIX'],
      destinations: ['ROM'],
      combinations: [{ departure: '2027-01-15', return: '2027-01-18', duration: 4, calendarDays: 4, nights: 3 }],
      directOnly: false,
    });
    await p.execute(req, new AbortController().signal);
    expect(calls[0]).toContain('https://proxy.example.workers.dev/prices_for_dates?');
    expect(calls[0]).toContain('departure_at=2027-01');
    expect(calls[0]).toContain('destination=ROM');
    expect(calls[0]).not.toContain('token');
  });

  it('marks 429 responses as retryable', async () => {
    const fetchImpl = (async () => new Response('', { status: 429, headers: { 'Retry-After': '2' } })) as unknown as typeof fetch;
    const p = createTravelpayoutsProvider('https://proxy.example', fetchImpl);
    await expect(
      p.execute({ key: 'k', label: 'l', origin: 'RIX', month: '2027-01', combinations: [], directOnly: false }, new AbortController().signal),
    ).rejects.toMatchObject({ retryable: true, retryAfterMs: 2000 });
  });

  it('is unavailable without a proxy URL', () => {
    expect(createTravelpayoutsProvider(undefined).isAvailable()).toBe(false);
  });
});

describe('external links', () => {
  it('builds dated deep links', () => {
    const links = externalSearchLinks('RIX', 'ROM', '2027-01-15', '2027-01-18');
    expect(links.find((l) => l.label === 'Skyscanner')?.url).toBe('https://www.skyscanner.net/transport/flights/rix/rom/270115/270118/');
    expect(links.find((l) => l.label === 'Aviasales')?.url).toBe('https://www.aviasales.com/search/RIX1501ROM18011');
  });
});

describe('time conflicts', () => {
  const cal = createCalendar(DEFAULT_SCHEDULE, DEFAULT_CALENDAR_SETTINGS);
  const mk = (depDate: string, depMin: number, retDate: string, arrMin: number): FlightOffer => ({
    id: 'x',
    providerId: 't',
    providerName: 't',
    origin: 'RIX',
    destination: 'ROM',
    outbound: { from: 'RIX', to: 'FCO', departAt: localToInstant(depDate, depMin, 'Europe/Riga'), stops: 0 },
    inbound: {
      from: 'FCO',
      to: 'RIX',
      departAt: localToInstant(retDate, arrMin - 180, 'Europe/Riga'),
      arriveAt: localToInstant(retDate, arrMin, 'Europe/Riga'),
      stops: 0,
    },
    price: 1,
    currency: 'EUR',
    priceKind: 'demo',
    timesKnown: true,
  });
  const ctx = { calendar: cal, schedule: DEFAULT_SCHEDULE, homeTimeZone: 'Europe/Riga' };

  it('Friday 06:00 departure needs the day off', () => {
    const c = detectTimeConflicts(mk('2027-01-15', 6 * 60, '2027-01-17', 20 * 60), ctx);
    expect(c.find((x) => x.leg === 'outbound')).toMatchObject({ severity: 'warning' });
  });

  it('Friday 22:00 departure is after working hours (info only)', () => {
    const c = detectTimeConflicts(mk('2027-01-15', 22 * 60, '2027-01-17', 20 * 60), ctx);
    expect(c.find((x) => x.leg === 'outbound')).toMatchObject({ severity: 'info' });
  });

  it('Monday 08:00 arrival conflicts with work', () => {
    const c = detectTimeConflicts(mk('2027-01-16', 10 * 60, '2027-01-18', 8 * 60), ctx);
    expect(c.find((x) => x.leg === 'inbound')).toMatchObject({ severity: 'warning' });
  });

  it('weekend flights raise no conflicts', () => {
    expect(detectTimeConflicts(mk('2027-01-16', 6 * 60, '2027-01-17', 12 * 60), ctx)).toHaveLength(0);
  });

  it('shortened days end an hour earlier', () => {
    // Wed 17 Nov 2027 is a shortened pre-holiday day: work ends 16:00; 17:45 departure − 90 min buffer = 16:15 → after work
    const c = detectTimeConflicts(mk('2027-11-17', 17 * 60 + 45, '2027-11-21', 20 * 60), ctx);
    expect(c.find((x) => x.leg === 'outbound')).toMatchObject({ severity: 'info' });
  });
});

describe('TTL cache', () => {
  it('expires entries', () => {
    let t = 0;
    const c = createTtlCache<number>({ now: () => t });
    c.set('a', 1, 100);
    expect(c.get('a')).toBe(1);
    t = 101;
    expect(c.get('a')).toBeUndefined();
  });
});
