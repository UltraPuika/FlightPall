/**
 * Search orchestration:
 *  1. validate params and generate every date combination
 *  2. let the provider group combinations into as few requests as possible
 *  3. dedupe requests, serve from cache, run the rest through a throttled queue
 *  4. stream partial, evaluated results back via `onProgress`
 *  5. support cancellation and partial failure
 */
import type { DateCombination, DepartureAirport, FlightOffer, OneWayFare, SearchParams, TripResult, WorkSchedule } from '../../domain/types';
import { DESTINATIONS, findDestination } from '../../data/airports';
import { monthsInRange, todayIso } from '../../lib/dates';
import { enabledAirports } from '../airports';
import type { HolidayCalendar } from '../calendar/holidayCalendar';
import type { FlightProvider, ProviderRequest } from '../providers/types';
import type { CacheStore } from './cache';
import { combinationKey, generateDateCombinations, returnDateFor, validateWindow } from './dateCombinations';
import { isAbort, runQueue } from './requestQueue';
import { combineOneWayFares } from './openJaw';
import { buildTripResult, dedupeResults, type TripBuildContext } from './tripBuilder';

/** In "anywhere" mode, return flights to other airports are checked for this many cheapest destinations. */
export const OPEN_JAW_ANYWHERE_DESTINATIONS = 12;

export type SearchStatus = 'idle' | 'running' | 'done' | 'cancelled' | 'error';

export interface SearchProgress {
  status: SearchStatus;
  totalRequests: number;
  completedRequests: number;
  cachedRequests: number;
  failedRequests: number;
  combinations: number;
  rawOffers: number;
  results: TripResult[];
  errors: { label: string; message: string }[];
  warnings: string[];
}

export interface SearchInput {
  params: SearchParams;
  airports: DepartureAirport[];
  provider: FlightProvider;
  calendar: HolidayCalendar;
  schedule: WorkSchedule;
  cache?: CacheStore<unknown>;
  signal: AbortSignal;
  onProgress?: (p: SearchProgress) => void;
  today?: string;
  /** Hard cap on result count to keep the UI responsive */
  maxResults?: number;
}

export function validateSearch(params: SearchParams, airports: DepartureAirport[]): string[] {
  const errors = validateWindow({
    earliestDeparture: params.earliestDeparture,
    latestDeparture: params.latestDeparture,
    minDuration: params.minDuration,
    maxDuration: params.maxDuration,
    durationMode: params.durationMode,
    latestReturn: params.latestReturn,
  });
  if (params.latestReturn && params.earliestDeparture <= params.latestReturn && returnDateFor(params.earliestDeparture, params.minDuration, params.durationMode) > params.latestReturn)
    errors.push('The travel window is shorter than the minimum trip duration.');
  if (!enabledAirports(airports).length) errors.push('Enable at least one departure airport.');
  if (params.mode === 'specific' && !params.destinations.length) errors.push('Choose at least one destination, or switch to "Anywhere".');
  if (params.preferredDuration < params.minDuration || params.preferredDuration > params.maxDuration)
    errors.push('Preferred duration must be between the minimum and maximum.');
  return errors;
}

export async function runSearch(input: SearchInput): Promise<SearchProgress> {
  const { params, provider, calendar, schedule, signal, cache } = input;
  const maxResults = input.maxResults ?? 20_000;
  const progress: SearchProgress = {
    status: 'running',
    totalRequests: 0,
    completedRequests: 0,
    cachedRequests: 0,
    failedRequests: 0,
    combinations: 0,
    rawOffers: 0,
    results: [],
    errors: [],
    warnings: [],
  };
  const emit = () => input.onProgress?.({ ...progress, results: progress.results.slice(), errors: progress.errors.slice(), warnings: progress.warnings.slice() });

  const errors = validateSearch(params, input.airports);
  if (errors.length) {
    progress.status = 'error';
    progress.errors = errors.map((message) => ({ label: 'Search settings', message }));
    emit();
    return progress;
  }
  if (!provider.isAvailable()) {
    progress.status = 'error';
    progress.errors = [{ label: provider.name, message: provider.unavailableReason?.() ?? 'Provider unavailable' }];
    emit();
    return progress;
  }

  const today = input.today ?? todayIso();
  const combinations: DateCombination[] = generateDateCombinations({
    earliestDeparture: params.earliestDeparture,
    latestDeparture: params.latestDeparture,
    minDuration: params.minDuration,
    maxDuration: params.maxDuration,
    durationMode: params.durationMode,
    latestReturn: params.latestReturn,
    notBefore: today,
  });
  if (params.earliestDeparture < today) progress.warnings.push(`Departures before today (${today}) were skipped.`);
  progress.combinations = combinations.length;
  if (!combinations.length) {
    progress.status = 'done';
    progress.warnings.push('No valid date combinations in the selected window.');
    emit();
    return progress;
  }

  const airports = enabledAirports(input.airports);
  let destinations: string[] | 'anywhere' = params.mode === 'anywhere' ? 'anywhere' : Array.from(new Set(params.destinations));
  if (params.mode === 'anywhere' && !provider.capabilities.supportsAnywhere) {
    destinations = DESTINATIONS.map((d) => d.code);
    progress.warnings.push(`${provider.name} cannot search "anywhere"; searching ${destinations.length} known destinations instead.`);
  }

  const planned = provider.planRequests({ origins: airports.map((a) => a.code), destinations, combinations, directOnly: params.directOnly });
  const unique = new Map<string, ProviderRequest>();
  for (const r of planned) if (!unique.has(r.key)) unique.set(r.key, r);
  const requests = Array.from(unique.values());

  const ctx: TripBuildContext = {
    params,
    calendar,
    schedule,
    airportsByCode: new Map(airports.map((a) => [a.code, a])),
    combinationsByKey: new Map(combinations.map((c) => [combinationKey(c), c])),
    // Never suggest flying to one of your own departure airports (enabled or not)
    excludedDestinations: new Set(input.airports.map((a) => a.code)),
  };
  const regionFilter = params.mode === 'anywhere' && params.regions.length ? new Set(params.regions) : null;
  const excluded = params.mode === 'anywhere' ? new Set(params.excludedCountries ?? []) : new Set<string>();
  const destinationAllowed = (code: string) => {
    if (ctx.excludedDestinations?.has(code)) return false;
    const d = findDestination(code);
    if (regionFilter && d.code !== 'ANYWHERE' && !regionFilter.has(d.region)) return false;
    if (excluded.size && excluded.has(d.countryCode)) return false;
    return true;
  };
  const collected = new Map<string, TripResult>();
  let truncated = false;

  const ingest = (origin: string, offers: FlightOffer[]) => {
    progress.rawOffers += offers.length;
    for (const offer of offers) {
      if (collected.size >= maxResults) {
        truncated = true;
        break;
      }
      const r = buildTripResult(offer, origin, ctx);
      if (!r || !destinationAllowed(r.destination.code)) continue;
      collected.set(r.id, r);
    }
    progress.results = dedupeResults(collected.values());
  };

  /** Runs a batch of requests with cache, throttling, retries and progress reporting. */
  async function runBatch<T>(reqs: ProviderRequest[], exec: (r: ProviderRequest) => Promise<T[]>, onResult: (r: ProviderRequest, v: T[]) => void) {
    progress.totalRequests += reqs.length;
    const pending: ProviderRequest[] = [];
    for (const req of reqs) {
      const hit = cache?.get(req.key) as T[] | undefined;
      if (hit) {
        onResult(req, hit);
        progress.cachedRequests++;
        progress.completedRequests++;
      } else pending.push(req);
    }
    emit();
    await runQueue(
      pending.map((req) => () => exec(req)),
      { concurrency: provider.capabilities.maxConcurrency, minIntervalMs: provider.capabilities.minIntervalMs, maxRetries: 3, baseBackoffMs: 1000, signal },
      (index, outcome) => {
        const req = pending[index];
        progress.completedRequests++;
        if (outcome.ok) {
          cache?.set(req.key, outcome.value, provider.capabilities.cacheTtlMs);
          onResult(req, outcome.value);
        } else {
          progress.failedRequests++;
          progress.errors.push({ label: req.label, message: outcome.error.message });
        }
        emit();
      },
    );
  }

  try {
    // Phase 1: round trips (same airport out and back)
    await runBatch(requests, (r) => provider.execute(r, signal), (r, offers) => ingest(r.origin, offers));

    // Phase 2: trips returning to a different departure airport, from pairs of one-way fares
    const executeOneWay = provider.executeOneWay?.bind(provider);
    if (params.allowDifferentReturnAirport && executeOneWay && airports.length > 1) {
      const deps = combinations.map((c) => c.departure).sort();
      const rets = combinations.map((c) => c.return).sort();
      const depMonths = monthsInRange(deps[0], deps[deps.length - 1]);
      const retMonths = monthsInRange(rets[0], rets[rets.length - 1]);
      const dir = params.directOnly ? 'd' : 'a';
      const outDests = destinations === 'anywhere' ? [undefined] : destinations.filter(destinationAllowed);
      const outReqs: ProviderRequest[] = airports.flatMap((a) =>
        outDests.flatMap((d) =>
          depMonths.map((m) => ({ key: `ow|${provider.id}|${a.code}|${d ?? '*'}|${m}|${dir}`, label: `${a.code} → ${d ?? 'anywhere'} (one-way) · ${m}`, origin: a.code, destination: d, month: m, combinations: [], directOnly: params.directOnly, oneWay: true })),
        ),
      );
      const outFares: OneWayFare[] = [];
      await runBatch(outReqs, (r) => executeOneWay(r, signal), (_r, fares) => outFares.push(...fares));

      // Which destinations to check return flights for
      let backDests: string[];
      if (destinations === 'anywhere') {
        const cheapest = new Map<string, number>();
        for (const f of outFares) {
          const code = findDestination(f.to).code;
          if (!destinationAllowed(code)) continue;
          cheapest.set(code, Math.min(cheapest.get(code) ?? Infinity, f.price));
        }
        backDests = Array.from(cheapest.entries()).sort((x, y) => x[1] - y[1]).slice(0, OPEN_JAW_ANYWHERE_DESTINATIONS).map(([c]) => c);
        if (cheapest.size > backDests.length)
          progress.warnings.push(`Different return airports were checked for the ${backDests.length} cheapest destinations only (to limit requests). Pick specific destinations to check others.`);
      } else backDests = outDests as string[];

      const inReqs: ProviderRequest[] = backDests.flatMap((d) =>
        airports.flatMap((b) =>
          retMonths.map((m) => ({ key: `ow|${provider.id}|${d}|${b.code}|${m}|${dir}`, label: `${d} → ${b.code} (one-way) · ${m}`, origin: d, destination: b.code, month: m, combinations: [], directOnly: params.directOnly, oneWay: true })),
        ),
      );
      const inFares: OneWayFare[] = [];
      await runBatch(inReqs, (r) => executeOneWay(r, signal), (_r, fares) => inFares.push(...fares));

      const pairs = combineOneWayFares(outFares, inFares, combinations, ctx.airportsByCode);
      ingest('', pairs);
      emit();
    }
    progress.status = 'done';
  } catch (err) {
    if (isAbort(err) || signal.aborted) progress.status = 'cancelled';
    else {
      progress.status = 'error';
      progress.errors.push({ label: 'Search', message: (err as Error).message });
    }
  }

  if (truncated) progress.warnings.push(`Showing the first ${maxResults.toLocaleString()} results; narrow the search for complete coverage.`);
  if (progress.failedRequests) progress.warnings.push(`${progress.failedRequests} of ${progress.totalRequests} requests failed; results may be incomplete.`);
  emit();
  return progress;
}
