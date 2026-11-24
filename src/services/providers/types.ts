import type { DateCombination, FlightOffer, PriceKind } from '../../domain/types';

/** A search, as handed to a provider for planning. */
export interface ProviderSearchQuery {
  origins: string[];
  /** 'anywhere' lets the provider choose destinations; otherwise city codes */
  destinations: string[] | 'anywhere';
  combinations: DateCombination[];
  directOnly: boolean;
}

/**
 * One grouped provider request. Providers decide the grouping: e.g. one request per
 * origin × destination × departure month rather than one per date combination.
 */
export interface ProviderRequest {
  /** Stable cache key — identical keys are deduplicated */
  key: string;
  label: string;
  origin: string;
  destination?: string;
  /** YYYY-MM */
  month?: string;
  /** Combinations this request is expected to cover */
  combinations: DateCombination[];
  directOnly: boolean;
}

export interface ProviderCapabilities {
  supportsAnywhere: boolean;
  /** Cached / indicative / live etc. */
  priceKind: PriceKind;
  /** Maximum concurrent requests the client should issue */
  maxConcurrency: number;
  /** Minimum delay between request starts (ms) */
  minIntervalMs: number;
  /** How long responses may be cached client-side (ms) */
  cacheTtlMs: number;
  /** Whether offers can be re-checked for a live bookable price */
  canRevalidate: boolean;
}

export interface FlightProvider {
  id: string;
  name: string;
  description: string;
  capabilities: ProviderCapabilities;
  /** Configured and usable (e.g. proxy URL set) */
  isAvailable(): boolean;
  unavailableReason?(): string;
  planRequests(query: ProviderSearchQuery): ProviderRequest[];
  execute(request: ProviderRequest, signal: AbortSignal): Promise<FlightOffer[]>;
  /** Optional live re-check; returns an updated offer or null if no longer available */
  revalidate?(offer: FlightOffer, signal: AbortSignal): Promise<FlightOffer | null>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryable: boolean = false,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
