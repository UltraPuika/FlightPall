/**
 * Travelpayouts / Aviasales Data API provider (free with an affiliate account).
 *
 * Endpoint used: GET https://api.travelpayouts.com/aviasales/v3/prices_for_dates
 * - Returns the cheapest tickets *found by Aviasales users in the last ~48 hours*,
 *   i.e. CACHED, INDICATIVE prices — not live, not guaranteed bookable.
 * - `departure_at` accepts a month (YYYY-MM) or a date, which lets us fetch a whole
 *   month of round trips per origin × destination in ONE request.
 * - Omitting `destination` returns cheap fares to many destinations ("anywhere").
 *
 * The API token must never reach the browser, and the API does not send CORS headers,
 * so requests go through the user's own free Cloudflare Worker (see /worker).
 */
import type { FlightOffer } from '../../domain/types';
import { monthsInRange } from '../../lib/dates';
import { addMinutesToInstant } from '../../lib/time';
import { ProviderError, type FlightProvider, type ProviderRequest, type ProviderSearchQuery } from './types';

export interface TravelpayoutsRow {
  origin: string;
  destination: string;
  origin_airport?: string;
  destination_airport?: string;
  price: number;
  airline?: string;
  flight_number?: string | number;
  departure_at: string;
  return_at?: string;
  transfers?: number;
  return_transfers?: number;
  duration?: number;
  duration_to?: number;
  duration_back?: number;
  link?: string;
}

export interface TravelpayoutsResponse {
  success: boolean;
  data?: TravelpayoutsRow[];
  currency?: string;
  error?: string;
}

export function parseTravelpayoutsResponse(body: TravelpayoutsResponse, fetchedAt: string): FlightOffer[] {
  if (!body.success) throw new ProviderError(body.error || 'Provider returned an error', undefined, false);
  if ((body.currency ?? 'eur').toLowerCase() !== 'eur') throw new ProviderError(`Unexpected currency ${body.currency}`);
  const out: FlightOffer[] = [];
  for (const row of body.data ?? []) {
    if (!row.return_at || typeof row.price !== 'number') continue; // round trips only
    const outDur = row.duration_to;
    const backDur = row.duration_back;
    out.push({
      id: `tp:${row.origin_airport ?? row.origin}:${row.destination_airport ?? row.destination}:${row.departure_at}:${row.return_at}:${row.airline ?? ''}${row.flight_number ?? ''}`,
      providerId: 'travelpayouts',
      providerName: 'Aviasales (Travelpayouts Data API)',
      origin: row.origin_airport ?? row.origin,
      destination: row.destination,
      destinationAirport: row.destination_airport,
      outbound: {
        from: row.origin_airport ?? row.origin,
        to: row.destination_airport ?? row.destination,
        departAt: row.departure_at,
        arriveAt: outDur ? addMinutesToInstant(row.departure_at, outDur) : undefined,
        durationMinutes: outDur,
        stops: row.transfers ?? 0,
        airline: row.airline,
        flightNumber: row.flight_number !== undefined ? String(row.flight_number) : undefined,
      },
      inbound: {
        from: row.destination_airport ?? row.destination,
        to: row.origin_airport ?? row.origin,
        departAt: row.return_at,
        arriveAt: backDur ? addMinutesToInstant(row.return_at, backDur) : undefined,
        durationMinutes: backDur,
        stops: row.return_transfers ?? row.transfers ?? 0,
        airline: row.airline,
      },
      price: row.price,
      currency: 'EUR',
      priceKind: 'indicative',
      timesKnown: true,
      observedAt: fetchedAt,
      bookingUrl: row.link ? `https://www.aviasales.com${row.link}` : undefined,
      bookingProvider: 'Aviasales',
    });
  }
  return out;
}

export function createTravelpayoutsProvider(proxyUrl: string | undefined, fetchImpl: typeof fetch = (...a) => fetch(...a)): FlightProvider {
  const base = proxyUrl?.replace(/\/+$/, '');
  return {
    id: 'travelpayouts',
    name: 'Aviasales cached fares (Travelpayouts)',
    description: 'Real fares seen by Aviasales users in the last ~48 h. Indicative: verify on the booking site.',
    capabilities: {
      supportsAnywhere: true,
      priceKind: 'indicative',
      maxConcurrency: 3,
      minIntervalMs: 250,
      cacheTtlMs: 3 * 60 * 60 * 1000,
      canRevalidate: false,
    },
    isAvailable: () => !!base,
    unavailableReason: () => (base ? '' : 'No proxy URL configured. Deploy the free worker in /worker and enter its URL in Settings.'),
    planRequests(query: ProviderSearchQuery): ProviderRequest[] {
      if (!query.combinations.length) return [];
      const deps = query.combinations.map((c) => c.departure).sort();
      const months = monthsInRange(deps[0], deps[deps.length - 1]);
      const dests = query.destinations === 'anywhere' ? [undefined] : query.destinations;
      const out: ProviderRequest[] = [];
      for (const origin of query.origins)
        for (const destination of dests)
          for (const month of months) {
            const combinations = query.combinations.filter((c) => c.departure.startsWith(month));
            if (!combinations.length) continue;
            out.push({
              key: `tp|${origin}|${destination ?? '*'}|${month}|${query.directOnly ? 'd' : 'a'}`,
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
      if (!base) throw new ProviderError('Travelpayouts proxy URL is not configured');
      const params = new URLSearchParams({
        origin: req.origin,
        departure_at: req.month ?? '',
        one_way: 'false',
        direct: String(req.directOnly),
        currency: 'eur',
        sorting: 'price',
        unique: 'false',
        limit: '1000',
        page: '1',
      });
      if (req.destination) params.set('destination', req.destination);
      let res: Response;
      try {
        res = await fetchImpl(`${base}/prices_for_dates?${params}`, { signal, headers: { Accept: 'application/json' } });
      } catch (err) {
        if ((err as Error).name === 'AbortError') throw err;
        throw new ProviderError(`Network error contacting proxy: ${(err as Error).message}`, undefined, true);
      }
      if (res.status === 429) {
        const ra = Number(res.headers.get('Retry-After'));
        throw new ProviderError('Rate limited by provider', 429, true, Number.isFinite(ra) && ra > 0 ? ra * 1000 : undefined);
      }
      if (res.status >= 500) throw new ProviderError(`Provider error ${res.status}`, res.status, true);
      if (!res.ok) throw new ProviderError(`Provider rejected request (${res.status})`, res.status, false);
      const body = (await res.json()) as TravelpayoutsResponse;
      return parseTravelpayoutsResponse(body, new Date().toISOString());
    },
  };
}
