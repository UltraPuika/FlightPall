import type { ProviderChoice } from '../storage';
import { createDemoProvider } from './demoProvider';
import { createLinksOnlyProvider } from './linksOnlyProvider';
import { createTravelpayoutsProvider } from './travelpayoutsProvider';
import type { FlightProvider } from './types';

export function resolveProxyUrl(userUrl: string): string | undefined {
  const env = (import.meta.env?.VITE_TRAVELPAYOUTS_PROXY_URL as string | undefined) ?? '';
  const url = userUrl.trim() || env.trim();
  return url || undefined;
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
