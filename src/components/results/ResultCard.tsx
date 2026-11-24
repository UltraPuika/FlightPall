import { useState } from 'react';
import { AlertTriangle, ArrowRight, CalendarDays, ChevronDown, ExternalLink, Info, Plane } from 'lucide-react';
import type { PriceKind, TripResult } from '../../domain/types';
import { formatHuman, WEEKDAY_SHORT } from '../../lib/dates';
import { formatDuration } from '../../lib/time';
import { formatEuro } from '../../services/airports';
import { explainRank, type RankingOptions } from '../../services/ranking';
import { CATEGORY_STYLE } from '../calendar/MonthGrid';
import { Badge, cx } from '../ui/primitives';

export const PRICE_KIND_INFO: Record<PriceKind, { label: string; tone: 'emerald' | 'sky' | 'slate' | 'amber' | 'violet'; description: string }> = {
  live_verified: { label: 'Verified live price', tone: 'emerald', description: 'Re-checked with the provider moments ago.' },
  indicative: { label: 'Indicative price', tone: 'sky', description: 'Cached fare recently seen by the provider. It may have changed. Verify on the booking site.' },
  historical: { label: 'Historical price', tone: 'slate', description: 'An older observation, for orientation only.' },
  schedule_only: { label: 'Schedule only', tone: 'slate', description: 'Flight exists but no price is available.' },
  demo: { label: 'Sample data, not real', tone: 'amber', description: 'Synthetic demo data. These flights and prices do not exist.' },
  unpriced: { label: 'No price data', tone: 'slate', description: 'Dates only. Use the links to check real prices.' },
};

export function ResultCard({ r, ranking, rank, preferredDuration, onShowCalendar }: { r: TripResult; ranking: RankingOptions; rank: number; preferredDuration: number; onShowCalendar: (r: TripResult) => void }) {
  const [open, setOpen] = useState(false);
  const kind = PRICE_KIND_INFO[r.offer.priceKind];
  const stops = Math.max(r.offer.outbound.stops, r.offer.inbound.stops);
  const warnings = r.conflicts.filter((c) => c.severity === 'warning');
  const timesKnown = r.offer.timesKnown;

  return (
    <article className="animate-fade-in rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      <div className="grid gap-3 p-4 sm:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-400 tabular">#{rank}</span>
            <h4 className="text-base font-semibold text-slate-900">
              {r.airport.code} <ArrowRight className="inline h-3.5 w-3.5 text-slate-400" /> {r.destination.city}
            </h4>
            <span className="text-sm text-slate-500">
              {r.destination.country}
              {r.offer.destinationAirport && r.offer.destinationAirport !== r.destination.code ? ` · ${r.offer.destinationAirport}` : ''}
            </span>
          </div>

          <div className="mt-2 grid gap-1.5 text-sm text-slate-700 sm:grid-cols-2">
            <LegLine
              label="Out"
              date={r.combination.departure}
              time={timesKnown ? r.outboundLocal.depart : undefined}
              arrive={timesKnown ? r.outboundLocal.arrive : undefined}
              arriveDate={r.outboundLocal.arriveDate}
              departDate={r.outboundLocal.departDate}
              tzNote={`${r.airport.code} local`}
              duration={r.offer.outbound.durationMinutes}
            />
            <LegLine
              label="Back"
              date={r.combination.return}
              time={timesKnown ? r.inboundLocal.depart : undefined}
              arrive={timesKnown ? r.inboundLocal.arrive : undefined}
              arriveDate={r.inboundLocal.arriveDate}
              departDate={r.inboundLocal.departDate}
              tzNote="arrival in home local time"
              duration={r.offer.inbound.durationMinutes}
            />
          </div>

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <Badge tone={r.vacation.vacationDays === 0 ? 'emerald' : r.vacation.vacationDays <= 2 ? 'brand' : 'slate'} title={`Working days covered: ${r.vacation.workingDaysCovered.join(', ') || 'none'}`}>
              {r.vacation.vacationDays} vacation day{r.vacation.vacationDays === 1 ? '' : 's'}
            </Badge>
            <Badge>
              {r.vacation.calendarDays} days · {r.vacation.nights} night{r.vacation.nights === 1 ? '' : 's'}
            </Badge>
            <Badge title="Share of trip days that are weekends, holidays or days off">{Math.round(r.vacation.nonWorkingShare * 100)}% non-working</Badge>
            {r.vacation.holidayDays > 0 && <Badge tone="rose">{r.vacation.holidayDays} holiday{r.vacation.holidayDays === 1 ? '' : 's'}</Badge>}
            {r.offer.priceKind !== 'unpriced' && <Badge tone={stops === 0 ? 'emerald' : 'slate'}>{stops === 0 ? 'Direct' : `${stops} stop${stops === 1 ? '' : 's'}`}</Badge>}
            {r.combination.duration === preferredDuration && <Badge tone="violet">Preferred length</Badge>}
            {r.preferenceMatches.map((m) => (
              <Badge key={m} tone="violet">
                {m}
              </Badge>
            ))}
            {warnings.length > 0 && (
              <Badge tone="amber" title={warnings.map((w) => w.message).join('\n')}>
                <AlertTriangle className="h-3 w-3" /> {warnings.length} work conflict{warnings.length === 1 ? '' : 's'}
              </Badge>
            )}
          </div>
        </div>

        <div className="flex flex-row items-end justify-between gap-3 sm:flex-col sm:items-end sm:text-right">
          <div>
            <div className="text-2xl font-bold tracking-tight text-slate-900 tabular">{r.adjustedPrice === null ? 'Price n/a' : formatEuro(r.adjustedPrice)}</div>
            {r.adjustedPrice === null && (
              <div className="text-xs text-slate-500 tabular">plus {r.airport.code} airport cost {formatEuro(r.airportCost)}</div>
            )}
            {r.adjustedPrice !== null && (
              <div className="text-xs text-slate-500 tabular">
                ticket {formatEuro(r.flightPrice)} <span className="text-slate-400">{r.airportCost >= 0 ? '+' : '−'}</span> {r.airport.code} {formatEuro(Math.abs(r.airportCost))}
              </div>
            )}
            <div className="mt-1">
              <Badge tone={kind.tone} title={kind.description}>
                {kind.label}
              </Badge>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-1.5">
            {r.offer.bookingUrl && (
              <a href={r.offer.bookingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700">
                {r.offer.bookingProvider ?? 'Book'} <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            {!r.offer.bookingUrl && r.externalLinks[0] && (
              <a href={r.externalLinks[0].url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50">
                {r.externalLinks[0].label} <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>
      </div>

      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between border-t border-slate-100 px-4 py-2 text-xs text-slate-600 hover:bg-slate-50">
        <span className="flex min-w-0 items-center gap-1.5">
          <Info className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Why #{rank}: {explainRank(r, ranking)}</span>
        </span>
        <ChevronDown className={cx('h-4 w-4 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="animate-fade-in space-y-3 border-t border-slate-100 px-4 py-3 text-sm">
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Day by day</div>
            <div className="flex flex-wrap gap-1">
              {r.vacation.days.map((d) => (
                <div key={d.date} title={[CATEGORY_STYLE[d.category].label, ...d.entries.map((e) => e.name)].join(' · ')} className={cx('w-12 rounded-lg px-1 py-1 text-center text-[11px]', CATEGORY_STYLE[d.category].cell)}>
                  <div className="font-medium">{WEEKDAY_SHORT[d.weekday]}</div>
                  <div className="tabular">{formatHuman(d.date)}</div>
                  <div className="mt-0.5 text-[10px]">{d.isWorkingDay ? 'vacation' : 'free'}</div>
                </div>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              {r.vacation.workingDaysCovered.length} working day(s) covered = {r.vacation.vacationDays} vacation day(s) · {r.vacation.weekendDays} weekend day(s) · {r.vacation.holidayDays} holiday(s).
              <button type="button" onClick={() => onShowCalendar(r)} className="ml-1 inline-flex items-center gap-0.5 font-medium text-brand-700 hover:underline">
                <CalendarDays className="h-3 w-3" /> Show in calendar
              </button>
            </p>
          </div>

          {r.conflicts.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Working-hours check</div>
              <ul className="space-y-1">
                {r.conflicts.map((c, i) => (
                  <li key={i} className={cx('flex gap-1.5 text-xs', c.severity === 'warning' ? 'text-amber-800' : 'text-slate-600')}>
                    {c.severity === 'warning' ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                    {c.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
            <div>
              <span className="font-semibold text-slate-700">Data source:</span> {r.offer.providerName}. {kind.description}
              {r.offer.observedAt && r.offer.priceKind === 'indicative' && ` Fetched ${new Date(r.offer.observedAt).toLocaleString()}.`}
            </div>
            {(r.offer.outbound.airline || r.offer.outbound.flightNumber) && (
              <div>
                <span className="font-semibold text-slate-700">Flight:</span> <Plane className="inline h-3 w-3" /> {r.offer.outbound.airline} {r.offer.outbound.flightNumber}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            <span className="self-center text-xs text-slate-500">Compare on:</span>
            {r.externalLinks.map((l) => (
              <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:border-brand-500 hover:text-brand-700">
                {l.label} <ExternalLink className="h-3 w-3" />
              </a>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

function LegLine({ label, date, time, arrive, arriveDate, departDate, tzNote, duration }: { label: string; date: string; time?: string; arrive?: string; arriveDate?: string; departDate: string; tzNote: string; duration?: number }) {
  const nextDay = arriveDate && arriveDate > departDate;
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <span className="w-9 shrink-0 text-xs font-medium uppercase text-slate-400">{label}</span>
      <span className="whitespace-nowrap font-medium">{formatHuman(date, { weekday: true })}</span>
      {time ? (
        <span className="whitespace-nowrap tabular text-slate-600" title={tzNote}>
          {time}
          {arrive && (
            <>
              {' → '}
              {arrive}
              {nextDay && <sup className="ml-0.5 text-rose-600">+1</sup>}
            </>
          )}
          {duration ? <span className="ml-1 text-xs text-slate-400">({formatDuration(duration)})</span> : null}
        </span>
      ) : (
        <span className="text-xs text-slate-400">time: check site</span>
      )}
    </div>
  );
}
