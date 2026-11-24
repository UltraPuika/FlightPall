import { useRef, useState } from 'react';
import { Database, Download, Plane, Plus, RotateCcw, Trash2, Upload, Briefcase, CalendarCheck } from 'lucide-react';
import type { DepartureAirport, EmploymentProfile, WorkSchedule } from '../../domain/types';
import { EXTRA_DEPARTURE_AIRPORTS } from '../../data/airports';
import { formatHuman, WEEKDAY_SHORT } from '../../lib/dates';
import { formatMinutes, parseHhmm } from '../../lib/time';
import { upsertAirport, validateAirport } from '../../services/airports';
import { resolveProxyUrl } from '../../services/providers';
import { defaultPreferences, exportPreferences, importPreferences, loadSavedSearches, storeSavedSearches, type Preferences, type ProviderChoice } from '../../services/storage';
import { Button, Card, cx, Field, inputBase, inputClass, NumberInput, Section, Toggle } from '../ui/primitives';

interface Props {
  prefs: Preferences;
  setPrefs: (p: Preferences) => void;
  update: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  onClearCache: () => void;
}

const PROVIDERS: { id: ProviderChoice; title: string; body: string }[] = [
  {
    id: 'travelpayouts',
    title: 'Aviasales cached fares (free, via Travelpayouts)',
    body: 'Real fares seen by Aviasales users in the last ~48 h. Indicative, not live. Needs a free Travelpayouts account and your own free Cloudflare Worker proxy (see worker/README.md).',
  },
  {
    id: 'links',
    title: 'No price data: date planner + external links',
    body: 'Ranks every date combination by vacation days and weekend use, with links to Google Flights, Skyscanner and Aviasales for prices. Needs no setup.',
  },
  {
    id: 'demo',
    title: 'Demo mode (sample data)',
    body: 'Synthetic, clearly labelled sample fares to explore the engine. Not real flights or prices.',
  },
];

export function SettingsPanel({ prefs, setPrefs, update, onClearCache }: Props) {
  const proxy = resolveProxyUrl(prefs.proxyUrl);
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="overflow-hidden lg:col-span-2">
        <Section title="Flight data source" icon={<Database className="h-4 w-4 text-brand-600" />} hint="All options are free. See FREE_RESOURCES.md for limits and terms.">
          <div className="grid gap-2 md:grid-cols-3">
            {PROVIDERS.map((p) => (
              <label key={p.id} className={cx('cursor-pointer rounded-xl border p-3 transition', prefs.provider === p.id ? 'border-brand-500 bg-brand-50/50 ring-2 ring-brand-100' : 'border-slate-200 hover:border-slate-300')}>
                <div className="flex items-center gap-2">
                  <input type="radio" name="provider" className="accent-brand-600" checked={prefs.provider === p.id} onChange={() => update('provider', p.id)} />
                  <span className="text-sm font-semibold text-slate-900">{p.title}</span>
                </div>
                <p className="mt-1 text-xs text-slate-600">{p.body}</p>
              </label>
            ))}
          </div>
          {prefs.provider === 'travelpayouts' && <TravelpayoutsSetup proxyUrl={prefs.proxyUrl} resolved={proxy} onChange={(v) => update('proxyUrl', v)} />}
          <div className="mt-3">
            <Button variant="ghost" onClick={() => { onClearCache(); setMessage('Response cache cleared.'); }}>
              <Trash2 className="h-3.5 w-3.5" /> Clear cached flight responses
            </Button>
          </div>
        </Section>
      </Card>

      <Card className="overflow-hidden lg:col-span-2">
        <Section title="Departure airports" icon={<Plane className="h-4 w-4 text-brand-600" />} hint="The additional cost is your round-trip cost of reaching the airport (bus, fuel, parking, hotel). It is added to every fare from that airport.">
          <AirportsEditor airports={prefs.airports} onChange={(a) => update('airports', a)} />
        </Section>
      </Card>

      <Card className="overflow-hidden">
        <Section title="Working week & hours" icon={<Briefcase className="h-4 w-4 text-brand-600" />}>
          <ScheduleEditor schedule={prefs.schedule} onChange={(s) => update('schedule', s)} />
        </Section>
      </Card>

      <Card className="overflow-hidden">
        <Section title="Holiday calendar (Latvia)" icon={<CalendarCheck className="h-4 w-4 text-brand-600" />} hint="Cabinet working-day transfers apply to state and municipal institutions. Private employers are not obliged to follow them.">
          <div className="space-y-2">
            {(
              [
                ['private', 'Private-sector employee', 'Public holidays and statutory rules only. Cabinet transfers are ignored.'],
                ['state_municipal', 'State / municipal institution employee', 'Also applies Cabinet working-day transfers (e.g. 2 Jan 2026 off, Sat 17 Jan 2026 working).'],
                ['custom', 'Custom calendar', 'Choose whether transfers apply and fine-tune individual dates with overrides.'],
              ] as [EmploymentProfile, string, string][]
            ).map(([id, title, body]) => (
              <label key={id} className="flex cursor-pointer items-start gap-2 rounded-lg p-1.5 hover:bg-slate-50">
                <input type="radio" name="profile" className="mt-1 accent-brand-600" checked={prefs.calendar.profile === id} onChange={() => update('calendar', { ...prefs.calendar, profile: id })} />
                <span>
                  <span className="block text-sm font-medium text-slate-900">{title}</span>
                  <span className="block text-xs text-slate-500">{body}</span>
                </span>
              </label>
            ))}
            {prefs.calendar.profile === 'custom' && (
              <div className="pl-7">
                <Toggle checked={prefs.calendar.customApplyStateTransfers} onChange={(v) => update('calendar', { ...prefs.calendar, customApplyStateTransfers: v })} label="Apply state/municipal working-day transfers" />
              </div>
            )}
          </div>
          <PersonalDays prefs={prefs} update={update} />
          {prefs.calendar.overrides.length > 0 && (
            <div className="mt-4">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Date overrides</div>
              <ul className="space-y-1">
                {prefs.calendar.overrides.map((o) => (
                  <li key={o.date} className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1 text-sm">
                    <span>
                      {formatHuman(o.date, { weekday: true, year: true })}: <span className="text-slate-600">{o.kind.replace('_', ' ')}</span>
                    </span>
                    <button type="button" aria-label="Remove override" className="text-slate-400 hover:text-rose-600" onClick={() => update('calendar', { ...prefs.calendar, overrides: prefs.calendar.overrides.filter((x) => x.date !== o.date) })}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-3 text-xs text-slate-500">Add overrides by clicking any date in the Calendar tab.</p>
        </Section>
      </Card>

      <Card className="overflow-hidden lg:col-span-2">
        <Section title="Your data" hint="Everything is stored only in this browser (localStorage). Nothing is sent to a server.">
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                const blob = new Blob([exportPreferences(prefs, loadSavedSearches())], { type: 'application/json' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'flightpall-settings.json';
                a.click();
                URL.revokeObjectURL(a.href);
              }}
            >
              <Download className="h-3.5 w-3.5" /> Export settings
            </Button>
            <Button onClick={() => fileRef.current?.click()}>
              <Upload className="h-3.5 w-3.5" /> Import settings
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  const { preferences, savedSearches } = importPreferences(await f.text());
                  setPrefs(preferences);
                  storeSavedSearches(savedSearches);
                  setMessage('Settings imported.');
                } catch {
                  setMessage('Could not read that file.');
                }
                e.target.value = '';
              }}
            />
            <Button
              variant="danger"
              onClick={() => {
                if (confirm('Reset all settings to defaults? Saved searches are kept.')) {
                  setPrefs(defaultPreferences());
                  setMessage('Settings reset.');
                }
              }}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset to defaults
            </Button>
          </div>
          {message && <p className="mt-2 text-xs text-brand-700" role="status">{message}</p>}
        </Section>
      </Card>
    </div>
  );
}

function AirportsEditor({ airports, onChange }: { airports: DepartureAirport[]; onChange: (a: DepartureAirport[]) => void }) {
  const [draft, setDraft] = useState({ code: '', city: '', country: '', timeZone: 'Europe/Riga', additionalCost: 0 });
  const [errors, setErrors] = useState<string[]>([]);
  const available = EXTRA_DEPARTURE_AIRPORTS.filter((x) => !airports.some((a) => a.code === x.code));
  const patch = (i: number, p: Partial<DepartureAirport>) => {
    const list = airports.slice();
    list[i] = { ...list[i], ...p };
    onChange(list);
  };

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="py-1 font-medium">On</th>
              <th className="font-medium">Airport</th>
              <th className="font-medium">Time zone</th>
              <th className="font-medium">Additional cost (€)</th>
              <th className="font-medium">Note</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {airports.map((a, i) => (
              <tr key={a.code}>
                <td className="py-2">
                  <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={a.enabled} onChange={(e) => patch(i, { enabled: e.target.checked })} aria-label={`Enable ${a.code}`} />
                </td>
                <td>
                  <span className="font-semibold">{a.code}</span> <span className="text-slate-600">{a.city}</span>
                  <span className="text-xs text-slate-400">, {a.country}</span>
                </td>
                <td className="text-xs text-slate-500">{a.timeZone}</td>
                <td>
                  <NumberInput className="w-24" value={a.additionalCost} step={5} onChange={(v) => patch(i, { additionalCost: v ?? 0 })} ariaLabel={`Additional cost for ${a.code}`} />
                </td>
                <td>
                  <input className={cx(inputBase, 'w-48')} value={a.costNote ?? ''} placeholder="e.g. bus + parking" onChange={(e) => patch(i, { costNote: e.target.value })} aria-label={`Cost note for ${a.code}`} />
                </td>
                <td className="text-right">
                  <button type="button" aria-label={`Remove ${a.code}`} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => onChange(airports.filter((x) => x.code !== a.code))}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {available.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-500">Quick add:</span>
          {available.map((x) => (
            <button key={x.code} type="button" className="rounded-full border border-slate-300 px-2.5 py-1 text-xs hover:border-brand-500 hover:text-brand-700" onClick={() => onChange([...airports, { ...x, enabled: true, additionalCost: 150 }])}>
              + {x.code} {x.city}
            </button>
          ))}
        </div>
      )}

      <form
        className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-6"
        onSubmit={(e) => {
          e.preventDefault();
          const a: DepartureAirport = { ...draft, code: draft.code.toUpperCase(), countryCode: '', enabled: true };
          const errs = validateAirport(a);
          if (airports.some((x) => x.code === a.code)) errs.push('That airport is already in the list.');
          setErrors(errs);
          if (errs.length) return;
          onChange(upsertAirport(airports, a));
          setDraft({ code: '', city: '', country: '', timeZone: 'Europe/Riga', additionalCost: 0 });
        }}
      >
        <Field label="IATA code">
          <input className={inputClass} maxLength={3} value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })} />
        </Field>
        <Field label="City">
          <input className={inputClass} value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} />
        </Field>
        <Field label="Country">
          <input className={inputClass} value={draft.country} onChange={(e) => setDraft({ ...draft, country: e.target.value })} />
        </Field>
        <Field label="Time zone (IANA)">
          <input className={inputClass} value={draft.timeZone} onChange={(e) => setDraft({ ...draft, timeZone: e.target.value })} />
        </Field>
        <Field label="Additional cost €">
          <NumberInput value={draft.additionalCost} onChange={(v) => setDraft({ ...draft, additionalCost: v ?? 0 })} />
        </Field>
        <div className="flex items-end">
          <Button type="submit" className="w-full">
            <Plus className="h-3.5 w-3.5" /> Add airport
          </Button>
        </div>
        {errors.length > 0 && <p className="col-span-full text-xs text-rose-700">{errors.join(' ')}</p>}
      </form>
    </div>
  );
}

function ScheduleEditor({ schedule, onChange }: { schedule: WorkSchedule; onChange: (s: WorkSchedule) => void }) {
  // Display Monday-first
  const order = [1, 2, 3, 4, 5, 6, 0];
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 text-xs font-medium text-slate-600">Working days</div>
        <div className="flex flex-wrap gap-1.5">
          {order.map((d) => {
            const on = schedule.workingWeekdays[d];
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  const w = [...schedule.workingWeekdays] as WorkSchedule['workingWeekdays'];
                  w[d] = !on;
                  onChange({ ...schedule, workingWeekdays: w });
                }}
                className={cx('w-12 rounded-lg border py-1.5 text-sm font-medium', on ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white text-slate-600')}
              >
                {WEEKDAY_SHORT[d]}
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Work starts">
          <input type="time" className={inputClass} value={formatMinutes(schedule.workStart)} onChange={(e) => e.target.value && onChange({ ...schedule, workStart: parseHhmm(e.target.value) })} />
        </Field>
        <Field label="Work ends">
          <input type="time" className={inputClass} value={formatMinutes(schedule.workEnd)} onChange={(e) => e.target.value && onChange({ ...schedule, workEnd: parseHhmm(e.target.value) })} />
        </Field>
        <Field label="Travel buffer (min)" hint="Office ⇄ airport">
          <NumberInput value={schedule.travelBufferMinutes} min={0} step={15} onChange={(v) => onChange({ ...schedule, travelBufferMinutes: Math.max(0, v ?? 0) })} />
        </Field>
      </div>
      {schedule.workEnd <= schedule.workStart && <p className="text-xs text-rose-700">Work must end after it starts.</p>}
      <p className="text-xs text-slate-500">Hours are only used to flag possible conflicts with flight times. Vacation days are always counted by date.</p>
    </div>
  );
}

function PersonalDays({ prefs, update }: { prefs: Preferences; update: Props['update'] }) {
  const [date, setDate] = useState('');
  const list = prefs.calendar.personalDaysOff;
  return (
    <div className="mt-4">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Personal days off</div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!date || list.some((p) => p.date === date)) return;
          update('calendar', { ...prefs.calendar, personalDaysOff: [...list, { date }].sort((a, b) => (a.date < b.date ? -1 : 1)) });
          setDate('');
        }}
      >
        <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Personal day off" />
        <Button type="submit">Add</Button>
      </form>
      <div className="mt-2 flex flex-wrap gap-1">
        {list.map((p) => (
          <span key={p.date} className="inline-flex items-center gap-1 rounded-full bg-sky-100 py-0.5 pl-2 pr-1 text-xs text-sky-800">
            {formatHuman(p.date, { weekday: true, year: true })}
            <button type="button" aria-label="Remove" className="rounded-full p-0.5 hover:bg-sky-200" onClick={() => update('calendar', { ...prefs.calendar, personalDaysOff: list.filter((x) => x.date !== p.date) })}>
              ×
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

const WORKER_CODE_URL = 'https://raw.githubusercontent.com/UltraPuika/FlightPall/main/worker/src.js';

function TravelpayoutsSetup({ proxyUrl, resolved, onChange }: { proxyUrl: string; resolved?: string; onChange: (v: string) => void }) {
  const [test, setTest] = useState<{ state: 'idle' | 'running' | 'ok' | 'error'; text?: string }>({ state: 'idle' });
  const [copied, setCopied] = useState(false);

  const runTest = async () => {
    if (!resolved) return;
    setTest({ state: 'running' });
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const month = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
    try {
      const res = await fetch(`${resolved}/prices_for_dates?origin=RIX&departure_at=${month}&one_way=false&currency=eur&sorting=price&limit=5`);
      const text = await res.text();
      let body: { success?: boolean; error?: string; data?: { destination: string; price: number; departure_at: string }[] } = {};
      try {
        body = JSON.parse(text);
      } catch {
        /* not JSON */
      }
      if (/^\s*</.test(text)) {
        setTest({ state: 'error', text: `HTTP ${res.status}: got a web page instead of fare data. Check the Worker URL, and make sure you replaced the Hello World code with the FlightPall worker code and clicked Deploy.` });
        return;
      }
      if (!res.ok || body.success === false) {
        const msg = body.error ?? text.slice(0, 200);
        const hint = /TRAVELPAYOUTS_TOKEN/.test(msg)
          ? ' Add the secret in Cloudflare: worker → Settings → Variables and Secrets.'
          : res.status === 401 || /unauthori|invalid token|token/i.test(msg)
            ? ' The token looks wrong. Check the TRAVELPAYOUTS_TOKEN secret in Cloudflare, and that you joined the Aviasales program.'
            : res.status === 403
              ? ' The worker rejected this site. Check ALLOWED_ORIGINS.'
              : '';
        setTest({ state: 'error', text: `HTTP ${res.status}: ${msg}${hint}` });
        return;
      }
      const rows = body.data ?? [];
      setTest({
        state: 'ok',
        text: rows.length
          ? `Connected. ${rows.length} sample fares from Riga in ${month}, e.g. ${rows.slice(0, 3).map((r) => `${r.destination} €${r.price}`).join(', ')}.`
          : `Connected, but no cached fares from Riga for ${month}. That's normal for quiet months. Try a search.`,
      });
    } catch (err) {
      setTest({ state: 'error', text: `Could not reach the worker (${(err as Error).message}). Check the URL. It should start with https:// and end with .workers.dev` });
    }
  };

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <ol className="space-y-3 text-sm text-slate-700">
        <li>
          <span className="font-semibold text-slate-900">1. Get a free API token.</span> Sign up at{' '}
          <a className="text-brand-700 underline" href="https://www.travelpayouts.com/" target="_blank" rel="noopener noreferrer">travelpayouts.com</a>, join the <b>Aviasales</b> program, and copy your <b>API token</b> from the dashboard's API / developer section.
        </li>
        <li>
          <span className="font-semibold text-slate-900">2. Create a free Cloudflare account</span> at{' '}
          <a className="text-brand-700 underline" href="https://dash.cloudflare.com/sign-up" target="_blank" rel="noopener noreferrer">dash.cloudflare.com</a>. No card is needed.
        </li>
        <li>
          <span className="font-semibold text-slate-900">3. Create the worker in your browser.</span> In Cloudflare go to <b>Workers &amp; Pages → Create → Create Worker</b>, name it <code>flightpall-proxy</code> and click <b>Deploy</b>. Then click <b>Edit code</b>, replace everything with the{' '}
          <a className="text-brand-700 underline" href={WORKER_CODE_URL} target="_blank" rel="noopener noreferrer">worker code</a>{' '}
          <button
            type="button"
            className="rounded border border-slate-300 px-1.5 text-xs hover:bg-slate-50"
            onClick={async () => {
              try {
                const code = await (await fetch(WORKER_CODE_URL)).text();
                await navigator.clipboard.writeText(code);
                setCopied(true);
              } catch {
                window.open(WORKER_CODE_URL, '_blank');
              }
            }}
          >
            {copied ? 'Copied ✓' : 'Copy code'}
          </button>{' '}
          and click <b>Deploy</b>.
        </li>
        <li>
          <span className="font-semibold text-slate-900">4. Add the token as a secret.</span> In the worker go to <b>Settings → Variables and Secrets → Add</b>. Choose type <b>Secret</b>, name <code>TRAVELPAYOUTS_TOKEN</code>, paste the token as the value, and save.
        </li>
        <li>
          <span className="font-semibold text-slate-900">5. Paste the worker URL below</span> (shown on the worker page, like <code>https://flightpall-proxy.yourname.workers.dev</code>) and click <b>Test connection</b>.
        </li>
      </ol>
      <div className="space-y-3">
        <Field label="Worker URL" hint={resolved ? `Using: ${resolved}` : 'The API token stays inside the worker and is never sent to the browser.'}>
          <input className={inputClass} placeholder="https://flightpall-proxy.yourname.workers.dev" value={proxyUrl} onChange={(e) => onChange(e.target.value.trim())} />
        </Field>
        <Button variant="primary" onClick={runTest} disabled={!resolved || test.state === 'running'}>
          {test.state === 'running' ? 'Testing…' : 'Test connection'}
        </Button>
        {test.state === 'ok' && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-emerald-200">✓ {test.text}</p>}
        {test.state === 'error' && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200">✗ {test.text}</p>}
        <p className="text-xs text-slate-500">
          Prices are fares Aviasales users found in the last ~48 h. They're shown as <b>Indicative</b>, so always confirm the final price on Aviasales before booking.
        </p>
      </div>
    </div>
  );
}
