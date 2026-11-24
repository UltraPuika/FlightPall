import { useMemo, useState } from 'react';
import { Briefcase, CalendarRange, Clock, Globe2, MapPin, Plane, Search, Settings2, Square, Wallet, X } from 'lucide-react';
import type { DestinationRegion, SearchParams } from '../../domain/types';
import { DESTINATIONS, findDestination, REGIONS } from '../../data/airports';
import { diffDays, formatHuman, isValidIsoDate, monthsInRange, todayIso, WEEKDAY_SHORT } from '../../lib/dates';
import { formatMinutes } from '../../lib/time';
import { enabledAirports } from '../../services/airports';
import type { HolidayCalendar } from '../../services/calendar/holidayCalendar';
import { generateDateCombinations, returnDateFor } from '../../services/search/dateCombinations';
import { validateSearch } from '../../services/search/searchEngine';
import type { Preferences } from '../../services/storage';
import { MonthGrid } from '../calendar/MonthGrid';
import { Badge, Button, Card, Collapsible, cx, Field, inputBase, inputClass, NumberInput, Section, Segmented, Stepper, Toggle } from '../ui/primitives';
import { SavedSearches } from './SavedSearches';

interface Props {
  prefs: Preferences;
  update: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  calendar: HolidayCalendar;
  running: boolean;
  onSearch: () => void;
  onCancel: () => void;
  onOpenSettings: () => void;
}

export function SearchForm({ prefs, update, calendar, running, onSearch, onCancel, onOpenSettings }: Props) {
  const p = prefs.search;
  const set = (patch: Partial<SearchParams>) => update('search', { ...p, ...patch });
  const errors = useMemo(() => validateSearch(p, prefs.airports), [p, prefs.airports]);

  const combos = useMemo(() => {
    if (errors.length) return 0;
    try {
      return generateDateCombinations({ ...p, notBefore: todayIso() }).length;
    } catch {
      return 0;
    }
  }, [p, errors.length]);
  const airportsOn = enabledAirports(prefs.airports);
  const months = isValidIsoDate(p.earliestDeparture) && isValidIsoDate(p.latestDeparture) && p.latestDeparture >= p.earliestDeparture ? monthsInRange(p.earliestDeparture, p.latestDeparture) : [];
  const lastPossibleReturn = months.length
    ? (() => {
        const r = returnDateFor(p.latestDeparture, p.maxDuration, p.durationMode);
        return p.latestReturn && p.latestReturn < r ? p.latestReturn : r;
      })()
    : undefined;
  const previewMonths = lastPossibleReturn ? monthsInRange(p.earliestDeparture, lastPossibleReturn > p.earliestDeparture ? lastPossibleReturn : p.earliestDeparture) : [];
  const requestEstimate = prefs.provider === 'links' ? null : airportsOn.length * (p.mode === 'anywhere' ? 1 : Math.max(1, p.destinations.length)) * months.length;

  const setDuration = (patch: Partial<Pick<SearchParams, 'minDuration' | 'maxDuration' | 'preferredDuration'>>) => {
    const next = { minDuration: p.minDuration, maxDuration: p.maxDuration, preferredDuration: p.preferredDuration, ...patch };
    if (patch.minDuration !== undefined) {
      next.maxDuration = Math.max(next.maxDuration, next.minDuration);
      next.preferredDuration = Math.max(next.preferredDuration, next.minDuration);
    }
    if (patch.maxDuration !== undefined) {
      next.minDuration = Math.min(next.minDuration, next.maxDuration);
      next.preferredDuration = Math.min(next.preferredDuration, next.maxDuration);
    }
    if (patch.preferredDuration !== undefined) {
      next.minDuration = Math.min(next.minDuration, next.preferredDuration);
      next.maxDuration = Math.max(next.maxDuration, next.preferredDuration);
    }
    set(next);
  };

  const unit = p.durationMode === 'calendar_days' ? 'days' : 'nights';
  const floor = p.durationMode === 'calendar_days' ? 1 : 0;
  const exampleDep = p.earliestDeparture && isValidIsoDate(p.earliestDeparture) ? p.earliestDeparture : todayIso();
  const exampleRet = returnDateFor(exampleDep, p.preferredDuration, p.durationMode);
  const workDays = prefs.schedule.workingWeekdays.map((w, i) => (w ? WEEKDAY_SHORT[i] : null)).filter(Boolean).join(', ');
  const profileLabel = { private: 'Private sector', state_municipal: 'State / municipal', custom: 'Custom calendar' }[prefs.calendar.profile];

  return (
    <Card className="overflow-hidden">
      {/* 1. Destination */}
      <Section step={1} title="Where to?" icon={<Globe2 className="h-4 w-4 text-brand-600" />}>
        <Segmented
          label="Destination mode"
          value={p.mode}
          onChange={(mode) => set({ mode })}
          options={[
            { value: 'anywhere', label: 'Anywhere' },
            { value: 'specific', label: 'Specific destinations' },
          ]}
        />
        {p.mode === 'anywhere' ? (
          <div className="mt-3">
            <p className="mb-2 text-xs text-slate-500">Optional: limit to regions (none selected = all regions the provider returns).</p>
            <div className="flex flex-wrap gap-1.5">
              {REGIONS.map((r) => (
                <RegionChip key={r} region={r} active={p.regions.includes(r)} onClick={() => set({ regions: p.regions.includes(r) ? p.regions.filter((x) => x !== r) : [...p.regions, r] })} />
              ))}
            </div>
            <CountryExcluder
              excluded={p.excludedCountries ?? []}
              onChange={(excludedCountries) => set({ excludedCountries })}
              disabled={prefs.provider === 'links'}
            />
          </div>
        ) : (
          <DestinationPicker selected={p.destinations} onChange={(destinations) => set({ destinations })} />
        )}
      </Section>

      {/* 2. Airports */}
      <Section
        step={2}
        title="Departure airports"
        icon={<Plane className="h-4 w-4 text-brand-600" />}
        hint="Adjusted price = ticket price + your extra cost of reaching that airport (both ways). Negative values are allowed."
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {prefs.airports.map((a, i) => (
            <div key={a.code} className={cx('flex items-center gap-3 rounded-xl border p-2.5 transition', a.enabled ? 'border-brand-200 bg-brand-50/40' : 'border-slate-200 bg-slate-50 opacity-70')}>
              <input
                type="checkbox"
                className="h-4 w-4 accent-brand-600"
                checked={a.enabled}
                aria-label={`Search from ${a.city} (${a.code})`}
                onChange={(e) => {
                  const list = prefs.airports.slice();
                  list[i] = { ...a, enabled: e.target.checked };
                  update('airports', list);
                }}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-900">
                  {a.code} <span className="font-normal text-slate-600">{a.city}</span>
                </div>
                {a.costNote && <div className="truncate text-[11px] text-slate-500">{a.costNote}</div>}
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-slate-500">+€</span>
                <NumberInput
                  ariaLabel={`Additional cost for ${a.code}`}
                  className="w-20 text-right"
                  value={a.additionalCost}
                  step={5}
                  onChange={(v) => {
                    const list = prefs.airports.slice();
                    list[i] = { ...a, additionalCost: v ?? 0 };
                    update('airports', list);
                  }}
                />
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={onOpenSettings} className="mt-2 text-xs font-medium text-brand-700 hover:underline">
          Add or manage airports →
        </button>
      </Section>

      {/* 3. Dates */}
      <Section step={3} title="Departure period" icon={<CalendarRange className="h-4 w-4 text-brand-600" />} hint="Any range, across months and years. Every day in it is a possible departure date; return dates follow from the trip duration.">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Earliest departure">
            <input type="date" className={inputClass} value={p.earliestDeparture} min={todayIso()} onChange={(e) => e.target.value && set({ earliestDeparture: e.target.value })} />
          </Field>
          <Field label="Latest departure">
            <input type="date" className={inputClass} value={p.latestDeparture} min={p.earliestDeparture} onChange={(e) => e.target.value && set({ latestDeparture: e.target.value })} />
          </Field>
        </div>
        <div className="mt-3">
          {p.latestReturn === undefined ? (
            <button type="button" className="text-xs font-medium text-brand-700 hover:underline" onClick={() => set({ latestReturn: lastPossibleReturn ?? p.latestDeparture })}>
              + Must be back by a certain date
            </button>
          ) : (
            <Field label="Must be back by" hint="Trips returning later are skipped.">
              <div className="flex gap-2">
                <input type="date" className={inputClass} value={p.latestReturn} min={p.earliestDeparture} onChange={(e) => set({ latestReturn: e.target.value || undefined })} />
                <Button variant="ghost" onClick={() => set({ latestReturn: undefined })} title="Remove return limit">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </Field>
          )}
        </div>
        {months.length > 0 && lastPossibleReturn && (
          <>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-brand-50 px-2 py-2">
                <dt className="text-[11px] text-brand-800">Departure days</dt>
                <dd className="text-lg font-semibold text-brand-900 tabular">{diffDays(p.earliestDeparture, p.latestDeparture) + 1}</dd>
              </div>
              <div className="rounded-xl bg-slate-50 px-2 py-2">
                <dt className="text-[11px] text-slate-600">Latest return</dt>
                <dd className="text-sm font-semibold leading-7 text-slate-900">{formatHuman(lastPossibleReturn, { weekday: true })}</dd>
              </div>
              <div className="rounded-xl bg-slate-50 px-2 py-2">
                <dt className="text-[11px] text-slate-600">Date combinations</dt>
                <dd className="text-lg font-semibold text-slate-900 tabular">{combos.toLocaleString()}</dd>
              </div>
            </dl>
            <div className="mt-4 grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
              {previewMonths.slice(0, 4).map((m) => (
                <MonthGrid
                  key={m}
                  compact
                  year={Number(m.slice(0, 4))}
                  month={Number(m.slice(5))}
                  calendar={calendar}
                  rangeStart={p.earliestDeparture}
                  rangeEnd={p.latestDeparture}
                  returnEnd={lastPossibleReturn}
                />
              ))}
            </div>
            {previewMonths.length > 4 && <p className="mt-2 text-xs text-slate-500">+{previewMonths.length - 4} more months in the Calendar tab.</p>}
            <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600">
              <li className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-brand-100 ring-1 ring-brand-300" />Departure days</li>
              <li className="flex items-center gap-1"><span className="h-3 w-3 rounded border border-dashed border-brand-400" />Possible return days</li>
              <li className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-rose-500" />Holiday</li>
              <li className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />Shortened / transferred</li>
              <li className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-slate-100" />Weekend</li>
            </ul>
          </>
        )}
      </Section>

      {/* 4. Duration */}
      <Section step={4} title="Trip duration" icon={<Clock className="h-4 w-4 text-brand-600" />}>
        <Segmented
          label="Duration unit"
          value={p.durationMode}
          onChange={(durationMode) => {
            // Keep the same real trip length when switching units
            const delta = durationMode === 'nights' ? -1 : 1;
            const fl = durationMode === 'calendar_days' ? 1 : 0;
            set({
              durationMode,
              minDuration: Math.max(fl, p.minDuration + delta),
              maxDuration: Math.max(fl, p.maxDuration + delta),
              preferredDuration: Math.max(fl, p.preferredDuration + delta),
            });
          }}
          options={[
            { value: 'calendar_days', label: 'Calendar days' },
            { value: 'nights', label: 'Nights' },
          ]}
        />
        <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {p.durationMode === 'calendar_days'
            ? 'Calendar days count both the departure and the return day. '
            : 'Nights count the nights spent away. '}
          Example: {p.preferredDuration} {unit} leaving {formatHuman(exampleDep, { weekday: true })} returns {formatHuman(exampleRet, { weekday: true })}.
        </p>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-3">
          <Field label={`Minimum ${unit}`}>
            <Stepper label="minimum duration" value={p.minDuration} min={floor} max={60} onChange={(v) => setDuration({ minDuration: v })} />
          </Field>
          <Field label={`Preferred ${unit}`}>
            <Stepper label="preferred duration" value={p.preferredDuration} min={floor} max={60} onChange={(v) => setDuration({ preferredDuration: v })} />
          </Field>
          <Field label={`Maximum ${unit}`}>
            <Stepper label="maximum duration" value={p.maxDuration} min={floor} max={60} onChange={(v) => setDuration({ maxDuration: v })} />
          </Field>
        </div>
        <p className="mt-2 text-xs text-slate-500">All durations from minimum to maximum are searched. Trips matching the preferred duration get a badge.</p>
      </Section>

      {/* 5. Vacation */}
      <Section step={5} title="Vacation days" icon={<Briefcase className="h-4 w-4 text-brand-600" />} hint="Working days you would need to take off, based on your working week and the Latvian holiday calendar.">
        <div className="flex flex-wrap items-end gap-6">
          <Field label="Maximum vacation days">
            <div className="flex items-center gap-3">
              <Stepper label="maximum vacation days" value={p.maxVacationDays ?? 0} min={0} max={30} onChange={(v) => set({ maxVacationDays: v })} />
              <Toggle checked={p.maxVacationDays === null} onChange={(v) => set({ maxVacationDays: v ? null : 2 })} label="No limit" />
            </div>
          </Field>
        </div>
        <div className="mt-3">
          <Toggle
            checked={p.prioritiseFewestVacationDays}
            onChange={(v) => set({ prioritiseFewestVacationDays: v })}
            label="Prioritise fewest vacation days over price"
            description="Results are ranked by vacation days first, then by the selected sort."
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <Badge>Work week: {workDays || 'none'}</Badge>
          <Badge>
            Hours {formatMinutes(prefs.schedule.workStart)}–{formatMinutes(prefs.schedule.workEnd)}
          </Badge>
          <Badge tone="brand">{profileLabel}</Badge>
          <button type="button" onClick={onOpenSettings} className="font-medium text-brand-700 hover:underline">
            Change →
          </button>
        </div>
      </Section>

      {/* 6. Budget */}
      <Section step={6} title="Budget" icon={<Wallet className="h-4 w-4 text-brand-600" />} hint="Maximum adjusted price per person, including the airport cost. Leave empty for no limit.">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">€</span>
          <NumberInput ariaLabel="Maximum adjusted budget" className="w-32" value={p.budget} allowEmpty min={0} step={10} placeholder="No limit" onChange={(budget) => set({ budget })} />
        </div>
      </Section>

      {/* 7. Advanced */}
      <Collapsible title={<span className="flex items-center gap-2"><Settings2 className="h-4 w-4 text-brand-600" />Additional preferences</span>} badge={countPrefs(p) ? <Badge tone="brand">{countPrefs(p)} active</Badge> : null}>
        <div className="grid gap-1 sm:grid-cols-2">
          <Toggle checked={p.directOnly} onChange={(directOnly) => set({ directOnly })} label="Direct flights only" />
          <div className="flex items-center gap-2 py-1 text-sm">
            <span className="text-slate-800">Max stops</span>
            <select className={cx(inputBase, 'w-auto')} value={p.maxStops ?? ''} onChange={(e) => set({ maxStops: e.target.value === '' ? null : Number(e.target.value) })} disabled={p.directOnly}>
              <option value="">Any</option>
              <option value="0">0</option>
              <option value="1">1</option>
              <option value="2">2</option>
            </select>
          </div>
          <Toggle checked={p.preferWeekendDeparture} onChange={(v) => set({ preferWeekendDeparture: v })} label="Prefer weekend departures" description="Departure on a non-working day" />
          <Toggle checked={p.preferWeekendReturn} onChange={(v) => set({ preferWeekendReturn: v })} label="Prefer weekend returns" description="Return on a non-working day" />
          <Toggle checked={p.preferDepartureAfterWork} onChange={(v) => set({ preferDepartureAfterWork: v })} label="Prefer departures after working hours" />
          <Toggle checked={p.preferArrivalOutsideWork} onChange={(v) => set({ preferArrivalOutsideWork: v })} label="Prefer arrivals outside working hours" />
        </div>
        <p className="mt-2 text-xs text-slate-500">Preferences don't hide results. Matching trips get a badge and win ties in the ranking.</p>
      </Collapsible>

      {/* Submit */}
      <div className="sticky bottom-0 border-t border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
        {errors.length > 0 && (
          <ul className="mb-3 space-y-1 text-xs text-rose-700" role="alert">
            {errors.map((e) => (
              <li key={e}>• {e}</li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-3">
          {running ? (
            <Button variant="danger" onClick={onCancel} className="h-11 flex-1 text-base">
              <Square className="h-4 w-4" /> Cancel search
            </Button>
          ) : (
            <Button variant="primary" onClick={onSearch} disabled={errors.length > 0} className="h-11 flex-1 text-base">
              <Search className="h-4 w-4" /> Search {combos.toLocaleString()} date combinations
            </Button>
          )}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {airportsOn.length} airport{airportsOn.length === 1 ? '' : 's'} · {p.mode === 'anywhere' ? 'anywhere' : `${p.destinations.length} destination${p.destinations.length === 1 ? '' : 's'}`}
          {requestEstimate !== null && ` · about ${requestEstimate} grouped provider request${requestEstimate === 1 ? '' : 's'} (one per airport × destination × month)`}
        </p>
        <SavedSearches params={p} onLoad={(params) => update('search', params)} />
      </div>
    </Card>
  );
}

function countPrefs(p: SearchParams) {
  return [p.directOnly, p.maxStops !== null, p.preferWeekendDeparture, p.preferWeekendReturn, p.preferDepartureAfterWork, p.preferArrivalOutsideWork].filter(Boolean).length;
}

function RegionChip({ region, active, onClick }: { region: DestinationRegion; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx('rounded-full border px-3 py-1 text-xs font-medium transition', active ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400')}
    >
      {region}
    </button>
  );
}

function DestinationPicker({ selected, onChange }: { selected: string[]; onChange: (v: string[]) => void }) {
  const [q, setQ] = useState('');
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = DESTINATIONS.filter((d) => !selected.includes(d.code));
    if (!s) return list.slice(0, 12);
    return list.filter((d) => d.city.toLowerCase().includes(s) || d.country.toLowerCase().includes(s) || d.code.toLowerCase() === s || d.airports.some((a) => a.toLowerCase() === s) || d.region.toLowerCase().includes(s)).slice(0, 12);
  }, [q, selected]);
  const customCode = /^[a-z]{3}$/i.test(q.trim()) && !DESTINATIONS.some((d) => d.code === q.trim().toUpperCase() || d.airports.includes(q.trim().toUpperCase())) ? q.trim().toUpperCase() : null;

  return (
    <div className="mt-3">
      {selected.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selected.map((code) => {
            const d = findDestination(code);
            return (
              <span key={code} className="inline-flex items-center gap-1 rounded-full bg-brand-600 py-1 pl-3 pr-1 text-xs font-medium text-white">
                {d.city} <span className="opacity-70">{code}</span>
                <button type="button" aria-label={`Remove ${d.city}`} className="rounded-full p-0.5 hover:bg-white/20" onClick={() => onChange(selected.filter((x) => x !== code))}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-slate-400" />
        <input className={cx(inputClass, 'pl-8')} placeholder="Search city, country, region or IATA code…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search destinations" />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {matches.map((d) => (
          <button
            key={d.code}
            type="button"
            onClick={() => {
              onChange([...selected, d.code]);
              setQ('');
            }}
            className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:border-brand-500 hover:text-brand-700"
          >
            + {d.city} <span className="text-slate-400">{d.countryCode}</span>
          </button>
        ))}
        {customCode && (
          <button type="button" onClick={() => { onChange([...selected, customCode]); setQ(''); }} className="rounded-full border border-dashed border-slate-400 px-2.5 py-1 text-xs text-slate-700 hover:border-brand-500">
            + Use code {customCode}
          </button>
        )}
      </div>
      {selected.length === 0 && <p className="mt-2 text-xs text-slate-500">Pick one or more destinations. Unlisted IATA city or airport codes are accepted too.</p>}
    </div>
  );
}


const COUNTRIES = Array.from(new Map(DESTINATIONS.map((d) => [d.countryCode, d.country])).entries()).sort((a, b) => a[1].localeCompare(b[1]));

function CountryExcluder({ excluded, onChange, disabled }: { excluded: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  const [q, setQ] = useState('');
  const s = q.trim().toLowerCase();
  const matches = s ? COUNTRIES.filter(([code, name]) => !excluded.includes(code) && (name.toLowerCase().includes(s) || code.toLowerCase() === s)).slice(0, 8) : [];
  const name = (code: string) => COUNTRIES.find(([c]) => c === code)?.[1] ?? code;
  return (
    <div className="mt-4">
      <div className="mb-1.5 text-xs font-medium text-slate-600">Exclude countries</div>
      {excluded.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {excluded.map((code) => (
            <span key={code} className="inline-flex items-center gap-1 rounded-full bg-rose-50 py-1 pl-3 pr-1 text-xs font-medium text-rose-800 ring-1 ring-rose-200">
              <span className="line-through decoration-rose-400">{name(code)}</span>
              <button type="button" aria-label={`Include ${name(code)} again`} className="rounded-full p-0.5 hover:bg-rose-100" onClick={() => onChange(excluded.filter((x) => x !== code))}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <button type="button" className="text-xs text-slate-500 hover:text-slate-800" onClick={() => onChange([])}>
            Clear all
          </button>
        </div>
      )}
      <input className={inputClass} placeholder="Type a country to exclude, e.g. Türkiye" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Exclude a country" disabled={disabled} />
      {matches.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {matches.map(([code, n]) => (
            <button
              key={code}
              type="button"
              onClick={() => {
                onChange([...excluded, code]);
                setQ('');
              }}
              className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:border-rose-400 hover:text-rose-700"
            >
              − {n}
            </button>
          ))}
        </div>
      )}
      {disabled && <p className="mt-1 text-xs text-slate-500">Not available in "No price data" mode, which can't tell destinations apart. Use specific destinations instead.</p>}
    </div>
  );
}
