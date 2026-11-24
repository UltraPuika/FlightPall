import { useMemo, useState } from 'react';
import { AlertCircle, Filter, LayoutList, Loader2, MapPinned, RotateCcw, Square } from 'lucide-react';
import type { ResultFilters, SortKey, TripResult } from '../../domain/types';
import type { SearchProgress } from '../../services/search/searchEngine';
import type { Preferences } from '../../services/storage';
import { applyFilters, EMPTY_FILTERS, groupByDestination, SORT_LABELS, sortResults, type RankingOptions } from '../../services/ranking';
import { formatEuro } from '../../services/airports';
import { Badge, Button, cx, Field, inputBase, inputClass, NumberInput, Segmented, Toggle } from '../ui/primitives';
import { PRICE_KIND_INFO, ResultCard } from './ResultCard';

interface Props {
  progress: SearchProgress;
  prefs: Preferences;
  update: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  onCancel: () => void;
  onShowCalendar: (r: TripResult) => void;
}

const PAGE = 40;

export function ResultsPanel({ progress, prefs, update, onCancel, onShowCalendar }: Props) {
  const [filters, setFilters] = useState<ResultFilters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [view, setView] = useState<'list' | 'grouped'>('list');
  const [limit, setLimit] = useState(PAGE);
  const ranking: RankingOptions = { sortKey: prefs.sortKey, prioritiseFewestVacationDays: prefs.search.prioritiseFewestVacationDays, vacationDayValue: prefs.vacationDayValue };

  const filtered = useMemo(() => applyFilters(progress.results, filters), [progress.results, filters]);
  const sorted = useMemo(() => sortResults(filtered, ranking), [filtered, ranking.sortKey, ranking.prioritiseFewestVacationDays, ranking.vacationDayValue]); // eslint-disable-line react-hooks/exhaustive-deps
  const groups = useMemo(() => (view === 'grouped' ? groupByDestination(sorted) : []), [sorted, view]);
  const kinds = useMemo(() => Array.from(new Set(progress.results.map((r) => r.offer.priceKind))), [progress.results]);
  const airportCodes = useMemo(() => Array.from(new Set(progress.results.map((r) => r.airport.code))), [progress.results]);
  const destCodes = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of progress.results) m.set(r.destination.code, r.destination.city);
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [progress.results]);
  const activeFilters = Object.entries(filters).filter(([k, v]) => (Array.isArray(v) ? v.length : v !== null && v !== false && v !== EMPTY_FILTERS[k as keyof ResultFilters])).length;

  if (progress.status === 'idle') {
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white/60 p-8 text-center">
        <MapPinned className="h-10 w-10 text-brand-500" />
        <h3 className="mt-3 text-lg font-semibold text-slate-900">Find trips that fit your calendar</h3>
        <p className="mt-1 max-w-md text-sm text-slate-600">
          Choose airports, a departure period and a trip length. FlightPall checks every departure and return combination and ranks trips by total cost, including getting to the airport, and by vacation days used.
        </p>
      </div>
    );
  }

  const pct = progress.totalRequests ? Math.round((progress.completedRequests / progress.totalRequests) * 100) : progress.status === 'running' ? 0 : 100;

  return (
    <div className="space-y-3">
      {/* Progress */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-live="polite">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
            {progress.status === 'running' ? <Loader2 className="h-4 w-4 animate-spin text-brand-600" /> : progress.status === 'error' ? <AlertCircle className="h-4 w-4 text-rose-600" /> : null}
            {progress.status === 'running' && `Searching… ${progress.completedRequests}/${progress.totalRequests} requests`}
            {progress.status === 'done' && `${progress.results.length.toLocaleString()} trips found`}
            {progress.status === 'cancelled' && `Search cancelled. Showing ${progress.results.length.toLocaleString()} partial results.`}
            {progress.status === 'error' && 'Search could not run'}
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>{progress.combinations.toLocaleString()} date combinations</span>
            {progress.cachedRequests > 0 && <Badge>{progress.cachedRequests} cached</Badge>}
            {progress.status === 'running' && (
              <Button variant="ghost" onClick={onCancel}>
                <Square className="h-3.5 w-3.5" /> Cancel
              </Button>
            )}
          </div>
        </div>
        {(progress.status === 'running' || progress.totalRequests > 0) && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-brand-500 transition-all duration-300" style={{ width: `${pct}%` }} />
          </div>
        )}
        {progress.warnings.map((w) => (
          <p key={w} className="mt-2 text-xs text-amber-800">⚠ {w}</p>
        ))}
        {progress.errors.length > 0 && (
          <details className="mt-2 text-xs text-rose-700" open={progress.status === 'error'}>
            <summary className="cursor-pointer">{progress.errors.length} error(s)</summary>
            <ul className="mt-1 space-y-0.5">
              {progress.errors.slice(0, 20).map((e, i) => (
                <li key={i}>
                  <span className="font-medium">{e.label}:</span> {e.message}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {/* Data-quality banner */}
      {kinds.map((k) => (
        <div
          key={k}
          className={cx(
            'rounded-xl px-4 py-2.5 text-sm',
            k === 'demo' ? 'bg-amber-50 text-amber-900 ring-1 ring-amber-200' : k === 'indicative' ? 'bg-sky-50 text-sky-900 ring-1 ring-sky-200' : 'bg-slate-100 text-slate-700',
          )}
        >
          <strong>{PRICE_KIND_INFO[k].label}:</strong> {PRICE_KIND_INFO[k].description}
          {k === 'demo' && ' Connect a free flight-data source in Settings for real prices.'}
        </div>
      ))}

      {progress.results.length > 0 && (
        <>
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              <span className="text-slate-600">Sort</span>
              <select className={cx(inputBase, 'w-auto')} value={prefs.sortKey} onChange={(e) => update('sortKey', e.target.value as SortKey)}>
                {Object.entries(SORT_LABELS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            {prefs.sortKey === 'value_score' && (
              <label className="flex items-center gap-1 text-sm text-slate-600">
                1 vacation day = €
                <NumberInput ariaLabel="Value of one vacation day" className="w-20" value={prefs.vacationDayValue} min={0} step={10} onChange={(v) => update('vacationDayValue', v ?? 0)} />
              </label>
            )}
            <Button variant={showFilters ? 'primary' : 'secondary'} onClick={() => setShowFilters(!showFilters)}>
              <Filter className="h-3.5 w-3.5" /> Filters{activeFilters ? ` (${activeFilters})` : ''}
            </Button>
            <div className="ml-auto">
              <Segmented
                label="Result view"
                value={view}
                onChange={setView}
                options={[
                  { value: 'list', label: <span className="flex items-center gap-1"><LayoutList className="h-3.5 w-3.5" />All trips</span> },
                  { value: 'grouped', label: <span className="flex items-center gap-1"><MapPinned className="h-3.5 w-3.5" />By destination</span> },
                ]}
              />
            </div>
          </div>
          {prefs.search.prioritiseFewestVacationDays && <p className="text-xs text-violet-700">Ranking prioritises fewest vacation days, then {SORT_LABELS[prefs.sortKey].toLowerCase()}.</p>}

          {showFilters && (
            <div className="animate-fade-in grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Max adjusted price (€)">
                <NumberInput allowEmpty value={filters.maxAdjustedPrice} min={0} placeholder="Any" onChange={(v) => setFilters({ ...filters, maxAdjustedPrice: v })} />
              </Field>
              <Field label="Max vacation days">
                <NumberInput allowEmpty value={filters.maxVacationDays} min={0} placeholder="Any" onChange={(v) => setFilters({ ...filters, maxVacationDays: v })} />
              </Field>
              <Field label="Max stops">
                <select className={inputClass} value={filters.maxStops ?? ''} onChange={(e) => setFilters({ ...filters, maxStops: e.target.value === '' ? null : Number(e.target.value) })}>
                  <option value="">Any</option>
                  <option value="0">Direct</option>
                  <option value="1">Up to 1</option>
                  <option value="2">Up to 2</option>
                </select>
              </Field>
              <Field label="Trip duration">
                <div className="flex items-center gap-1">
                  <NumberInput allowEmpty value={filters.minDuration} min={0} placeholder="min" onChange={(v) => setFilters({ ...filters, minDuration: v })} />
                  <span className="text-slate-400">–</span>
                  <NumberInput allowEmpty value={filters.maxDuration} min={0} placeholder="max" onChange={(v) => setFilters({ ...filters, maxDuration: v })} />
                </div>
              </Field>
              <Field label="Departure between">
                <div className="flex items-center gap-1">
                  <input type="date" className={inputClass} value={filters.departFrom ?? ''} onChange={(e) => setFilters({ ...filters, departFrom: e.target.value || null })} />
                  <input type="date" className={inputClass} value={filters.departTo ?? ''} onChange={(e) => setFilters({ ...filters, departTo: e.target.value || null })} />
                </div>
              </Field>
              <div className="space-y-1">
                <Toggle checked={filters.directOnly} onChange={(v) => setFilters({ ...filters, directOnly: v })} label="Direct flights only" />
                <Toggle checked={filters.hideConflicts} onChange={(v) => setFilters({ ...filters, hideConflicts: v })} label="Hide work-hour conflicts" />
              </div>
              <ChipFilter label="Departure airports" options={airportCodes.map((c) => [c, c])} selected={filters.airports} onChange={(airports) => setFilters({ ...filters, airports })} />
              <ChipFilter className="sm:col-span-2" label="Destinations" options={destCodes} selected={filters.destinations} onChange={(destinations) => setFilters({ ...filters, destinations })} />
              <div className="sm:col-span-2 lg:col-span-3">
                <Button variant="ghost" onClick={() => setFilters(EMPTY_FILTERS)}>
                  <RotateCcw className="h-3.5 w-3.5" /> Reset filters
                </Button>
              </div>
            </div>
          )}

          <p className="text-xs text-slate-500">
            Showing {Math.min(limit, view === 'grouped' ? groups.length : sorted.length).toLocaleString()} of {(view === 'grouped' ? groups.length : sorted.length).toLocaleString()} {view === 'grouped' ? 'destinations' : 'trips'}
            {filtered.length !== progress.results.length && ` (${progress.results.length - filtered.length} hidden by filters)`}
          </p>

          {view === 'list' ? (
            <div className="space-y-3">
              {sorted.slice(0, limit).map((r, i) => (
                <ResultCard key={r.id} r={r} rank={i + 1} ranking={ranking} preferredDuration={prefs.search.preferredDuration} onShowCalendar={onShowCalendar} />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {groups.slice(0, limit).map((g, i) => (
                <div key={g.destination.code}>
                  <div className="mb-1 flex items-baseline justify-between px-1 text-xs text-slate-500">
                    <span>
                      <strong className="text-slate-800">{g.destination.city}</strong>, {g.destination.country} · {g.destination.region}
                    </span>
                    <span>
                      {g.count} option{g.count === 1 ? '' : 's'}
                      {g.best.adjustedPrice !== null && ` · from ${formatEuro(g.best.adjustedPrice)}`}
                    </span>
                  </div>
                  <ResultCard r={g.best} rank={i + 1} ranking={ranking} preferredDuration={prefs.search.preferredDuration} onShowCalendar={onShowCalendar} />
                </div>
              ))}
            </div>
          )}
          {limit < (view === 'grouped' ? groups.length : sorted.length) && (
            <div className="flex justify-center">
              <Button onClick={() => setLimit(limit + PAGE)}>Show more</Button>
            </div>
          )}
        </>
      )}

      {progress.status === 'done' && progress.results.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600">
          No trips matched. Try a wider date range, more airports, a higher budget or more vacation days.
          {progress.rawOffers > 0 && ` (${progress.rawOffers} raw offers were outside your constraints.)`}
        </div>
      )}
    </div>
  );
}

function ChipFilter({ label, options, selected, onChange, className }: { label: string; options: [string, string][]; selected: string[]; onChange: (v: string[]) => void; className?: string }) {
  return (
    <div className={className}>
      <div className="mb-1 text-xs font-medium text-slate-600">{label}</div>
      <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
        {options.map(([code, name]) => {
          const on = selected.includes(code);
          return (
            <button
              key={code}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? selected.filter((x) => x !== code) : [...selected, code])}
              className={cx('rounded-full border px-2 py-0.5 text-xs', on ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 text-slate-700 hover:border-slate-400')}
            >
              {name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
