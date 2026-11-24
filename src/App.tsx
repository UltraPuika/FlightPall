import { useEffect, useState } from 'react';
import { CalendarDays, Plane, Search, Settings } from 'lucide-react';
import type { TripResult } from './domain/types';
import { usePreferences, useSearch } from './hooks/useAppState';
import { SearchForm } from './components/search/SearchForm';
import { ResultsPanel } from './components/results/ResultsPanel';
import { CalendarView } from './components/calendar/CalendarView';
import { SettingsPanel } from './components/settings/SettingsPanel';
import { cx } from './components/ui/primitives';

type Tab = 'search' | 'calendar' | 'settings';
const TABS: { id: Tab; label: string; icon: typeof Search }[] = [
  { id: 'search', label: 'Search', icon: Search },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'settings', label: 'Settings', icon: Settings },
];

// Hash-based navigation works on GitHub Pages without server-side rewrites.
function readTab(): Tab {
  const h = window.location.hash.replace('#/', '').replace('#', '');
  return (TABS.some((t) => t.id === h) ? h : 'search') as Tab;
}

const PROVIDER_PILL = {
  demo: { label: 'Demo data', cls: 'bg-amber-100 text-amber-900' },
  travelpayouts: { label: 'Aviasales cached fares', cls: 'bg-sky-100 text-sky-900' },
  links: { label: 'No price data', cls: 'bg-slate-200 text-slate-700' },
} as const;

export default function App() {
  const { prefs, setPrefs, update } = usePreferences();
  const { progress, start, cancel, clearCache, calendar } = useSearch(prefs);
  const [tab, setTab] = useState<Tab>(readTab);
  const [highlight, setHighlight] = useState<TripResult | null>(null);

  useEffect(() => {
    const onHash = () => setTab(readTab());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const go = (t: Tab) => {
    window.location.hash = `/${t}`;
    setTab(t);
    window.scrollTo({ top: 0 });
  };

  const pill = PROVIDER_PILL[prefs.provider];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
              <Plane className="h-4 w-4 -rotate-45" />
            </span>
            <div className="leading-tight">
              <div className="text-base font-bold tracking-tight text-slate-900">FlightPall</div>
              <div className="hidden text-[11px] text-slate-500 sm:block">Cheap trips, fewer vacation days</div>
            </div>
          </div>
          <nav className="ml-auto flex gap-1" aria-label="Main">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => go(t.id)}
                aria-current={tab === t.id ? 'page' : undefined}
                className={cx('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition', tab === t.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100')}
              >
                <t.icon className="h-4 w-4" />
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            ))}
          </nav>
          <button type="button" onClick={() => go('settings')} className={cx('hidden rounded-full px-2.5 py-1 text-xs font-medium md:block', pill.cls)} title="Flight data source">
            {pill.label}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5">
        {tab === 'search' && (
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(380px,460px)_1fr]">
            <SearchForm
              prefs={prefs}
              update={update}
              calendar={calendar}
              running={progress.status === 'running'}
              onSearch={start}
              onCancel={cancel}
              onOpenSettings={() => go('settings')}
            />
            <ResultsPanel
              progress={progress}
              prefs={prefs}
              update={update}
              onCancel={cancel}
              onShowCalendar={(r) => {
                setHighlight(r);
                go('calendar');
              }}
            />
          </div>
        )}
        {tab === 'calendar' && (
          <CalendarView
            calendar={calendar}
            settings={prefs.calendar}
            onChange={(c) => update('calendar', c)}
            range={{ start: prefs.search.earliestDeparture, end: prefs.search.latestReturn ?? prefs.search.latestDeparture }}
            trip={highlight}
            onClearTrip={() => setHighlight(null)}
          />
        )}
        {tab === 'settings' && <SettingsPanel prefs={prefs} setPrefs={setPrefs} update={update} onClearCache={clearCache} />}
      </main>

      <footer className="mx-auto max-w-7xl px-4 pb-8 pt-2 text-xs text-slate-500">
        Prices are never invented. Demo data is labelled as such, and cached fares are marked indicative. Always confirm the price on the booking site. Holiday data: Latvian law (likumi.lv) and reviewed working-time calendars.
        Runs entirely in your browser at no cost.
      </footer>
    </div>
  );
}
