/**
 * Search orchestration:
 *  1. validate params and generate every date combination
 *  2. let the provider group combinations into as few requests as possible
 *  3. dedupe requests, serve from cache, run the rest through a throttled queue
 *  4. stream partial, evaluated results back via `onProgress`
 *  5. support cancellation and partial failure
 */
import type { DateCombination, DepartureAirport, FlightOffer, SearchParams, TripResult, WorkSchedule } from '../../domain/types';
import { DESTINATIONS } from '../../data/airports';
import { todayIso } from '../../lib/dates';
import { enabledAirports } from '../airports';
import type { HolidayCalendar } from '../calendar/holidayCalendar';
import type { FlightProvider, ProviderRequest } from '../providers/types';
import type { CacheStore } from './cache';
import { combinationKey, generateDateCombinations, validateWindow } from './dateCombinations';
import { isAbort, runQueue } from './requestQueue';
import { buildTripResult, dedupeResults, type TripBuildContext } from './tripBuilder';

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
  cache?: CacheStore<FlightOffer[]>;
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
  progress.totalRequests = requests.length;
  emit();

  const ctx: TripBuildContext = {
    params,
    calendar,
    schedule,
    airportsByCode: new Map(airports.map((a) => [a.code, a])),
    combinationsByKey: new Map(combinations.map((c) => [combinationKey(c), c])),
  };
  const regionFilter = params.mode === 'anywhere' && params.regions.length ? new Set(params.regions) : null;
  const excluded = params.mode === 'anywhere' ? new Set(params.excludedCountries ?? []) : new Set<string>();
  const collected = new Map<string, TripResult>();
  let truncated = false;

  const ingest = (req: ProviderRequest, offers: FlightOffer[]) => {
    progress.rawOffers += offers.length;
    for (const offer of offers) {
      if (collected.size >= maxResults) {
        truncated = true;
        break;
      }
      const r = buildTripResult(offer, req.origin, ctx);
      if (!r) continue;
      if (regionFilter && r.destination.code !== 'ANYWHERE' && !regionFilter.has(r.destination.region)) continue;
      if (excluded.size && excluded.has(r.destination.countryCode)) continue;
      collected.set(r.id, r);
    }
    progress.results = dedupeResults(collected.values());
  };

  // Serve cached requests immediately
  const pending: ProviderRequest[] = [];
  for (const req of requests) {
    const hit = cache?.get(req.key);
    if (hit) {
      ingest(req, hit);
      progress.cachedRequests++;
      progress.completedRequests++;
    } else pending.push(req);
  }
  emit();

  try {
    await runQueue(
      pending.map((req) => () => provider.execute(req, signal)),
      {
        concurrency: provider.capabilities.maxConcurrency,
        minIntervalMs: provider.capabilities.minIntervalMs,
        maxRetries: 3,
        baseBackoffMs: 1000,
        signal,
      },
      (index, outcome) => {
        const req = pending[index];
        progress.completedRequests++;
        if (outcome.ok) {
          cache?.set(req.key, outcome.value, provider.capabilities.cacheTtlMs);
          ingest(req, outcome.value);
        } else {
          progress.failedRequests++;
          progress.errors.push({ label: req.label, message: outcome.error.message });
        }
        emit();
      },
    );
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
