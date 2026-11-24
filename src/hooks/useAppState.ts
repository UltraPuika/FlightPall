import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FlightOffer } from '../domain/types';
import { createCalendar } from '../services/calendar/holidayCalendar';
import { createProvider } from '../services/providers';
import { createTtlCache } from '../services/search/cache';
import { runSearch, type SearchProgress } from '../services/search/searchEngine';
import {
  loadPreferences,
  loadSavedSearches,
  savePreferences,
  storeSavedSearches,
  type Preferences,
  type SavedSearch,
} from '../services/storage';

export function usePreferences() {
  const [prefs, setPrefs] = useState<Preferences>(() => loadPreferences());
  useEffect(() => {
    const t = setTimeout(() => savePreferences(prefs), 300);
    return () => clearTimeout(t);
  }, [prefs]);
  const update = useCallback(<K extends keyof Preferences>(key: K, value: Preferences[K]) => setPrefs((p) => ({ ...p, [key]: value })), []);
  return { prefs, setPrefs, update };
}

export function useSavedSearches() {
  const [saved, setSaved] = useState<SavedSearch[]>(() => loadSavedSearches());
  const persist = useCallback((list: SavedSearch[]) => {
    setSaved(list);
    storeSavedSearches(list);
  }, []);
  return { saved, persist };
}

function safeLocalStorage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

const IDLE: SearchProgress = {
  status: 'idle',
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

export function useCalendar(prefs: Preferences) {
  return useMemo(() => createCalendar(prefs.schedule, prefs.calendar), [prefs.schedule, prefs.calendar]);
}

export function useSearch(prefs: Preferences) {
  const [progress, setProgress] = useState<SearchProgress>(IDLE);
  const [searchedAt, setSearchedAt] = useState<string | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const cache = useMemo(() => createTtlCache<FlightOffer[]>({ storage: safeLocalStorage(), prefix: 'flightpall:cache:' }), []);
  const calendar = useCalendar(prefs);

  const start = useCallback(async () => {
    ctrl.current?.abort();
    const controller = new AbortController();
    ctrl.current = controller;
    setSearchedAt(new Date().toISOString());
    let pending: SearchProgress | null = null;
    let frame = 0;
    const flush = () => {
      frame = 0;
      if (pending && ctrl.current === controller) setProgress(pending);
    };
    const provider = createProvider(prefs.provider, prefs.proxyUrl);
    const final = await runSearch({
      params: prefs.search,
      airports: prefs.airports,
      provider,
      calendar,
      schedule: prefs.schedule,
      cache,
      signal: controller.signal,
      onProgress: (p) => {
        pending = p;
        if (!frame) frame = requestAnimationFrame(flush);
      },
    });
    if (frame) cancelAnimationFrame(frame);
    if (ctrl.current === controller) setProgress(final);
  }, [prefs, calendar, cache]);

  const cancel = useCallback(() => ctrl.current?.abort(), []);
  const clearCache = useCallback(() => cache.clear(), [cache]);
  useEffect(() => () => ctrl.current?.abort(), []);

  return { progress, start, cancel, clearCache, searchedAt, calendar };
}
