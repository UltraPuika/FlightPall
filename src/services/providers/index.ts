import type { ProviderChoice } from '../storage';
import { createDemoProvider } from './demoProvider';
import { createLinksOnlyProvider } from './linksOnlyProvider';
import { createTravelpayoutsProvider } from './travelpayoutsProvider';
import type { FlightProvider } from './types';

export function resolveProxyUrl(userUrl: string): string | undefined {
  const env = (import.meta.env?.VITE_TRAVELPAYOUTS_PROXY_URL as string | undefined) ?? '';
  return normalizeProxyUrl(userUrl) || normalizeProxyUrl(env);
}

/** Accepts "name.workers.dev" or a full URL; always returns an absolute https URL without a trailing slash. */
export function normalizeProxyUrl(raw: string): string | undefined {
  const v = raw.trim().replace(/\/+$/, '');
  if (!v) return undefined;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

export function createProvider(choice: ProviderChoice, proxyUrl: string): FlightProvider {
  switch (choice) {
    case 'travelpayouts':
      return createTravelpayoutsProvider(resolveProxyUrl(proxyUrl));
    case 'links':
      return createLinksOnlyProvider();
    case 'demo':
    default:
      return createDemoProvider();
  }
}

export type { FlightProvider } from './types';
