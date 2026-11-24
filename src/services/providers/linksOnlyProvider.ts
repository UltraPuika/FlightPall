/**
 * "No price data" provider. Produces one unpriced entry per airport × destination ×
 * date combination so the engine can still rank trips by vacation days and weekend
 * utilisation, with deep links to free flight-search sites for real prices.
 *
 * Nothing is fetched; no prices or times are invented.
 */
import type { FlightOffer } from '../../domain/types';
import { ANYWHERE } from './externalLinks';
import type { FlightProvider, ProviderRequest, ProviderSearchQuery } from './types';

export function createLinksOnlyProvider(): FlightProvider {
  return {
    id: 'links',
    name: 'No price data (date planner + external links)',
    description: 'Ranks date windows by vacation days and links to Google Flights, Skyscanner and Aviasales for prices.',
    capabilities: {
      supportsAnywhere: true,
      priceKind: 'unpriced',
      maxConcurrency: 8,
      minIntervalMs: 0,
      cacheTtlMs: 0,
      canRevalidate: false,
    },
    isAvailable: () => true,
    planRequests(query: ProviderSearchQuery): ProviderRequest[] {
      const dests = query.destinations === 'anywhere' ? [ANYWHERE] : query.destinations;
      return query.origins.flatMap((origin) =>
        dests.map((destination) => ({
          key: `links|${origin}|${destination}`,
          label: `${origin} → ${destination === ANYWHERE ? 'anywhere' : destination}`,
          origin,
          destination,
          combinations: query.combinations,
          directOnly: query.directOnly,
        })),
      );
    },
    async execute(req: ProviderRequest) {
      const dest = req.destination ?? ANYWHERE;
      return req.combinations.map<FlightOffer>((c) => ({
        id: `links:${req.origin}:${dest}:${c.departure}:${c.return}`,
        providerId: 'links',
        providerName: 'External search links',
        origin: req.origin,
        destination: dest,
        // Date-only placeholders (noon UTC keeps the calendar date in European zones); timesKnown=false hides them
        outbound: { from: req.origin, to: dest, departAt: `${c.departure}T10:00:00Z`, stops: 0 },
        inbound: { from: dest, to: req.origin, departAt: `${c.return}T10:00:00Z`, stops: 0 },
        price: null,
        currency: 'EUR',
        priceKind: 'unpriced',
        timesKnown: false,
      }));
    },
  };
}
