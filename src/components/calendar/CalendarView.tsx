import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react';
import type { CalendarSettings, DayOverrideKind, TripResult } from '../../domain/types';
import { formatHuman, parseIso, todayIso, WEEKDAY_NAMES, type IsoDate } from '../../lib/dates';
import { createLatvianHolidaySource, type HolidayCalendar } from '../../services/calendar/holidayCalendar';
import { Badge, Button, Card, cx } from '../ui/primitives';
import { CATEGORY_STYLE, Legend, MonthGrid } from './MonthGrid';

interface Props {
  calendar: HolidayCalendar;
  settings: CalendarSettings;
  onChange: (s: CalendarSettings) => void;
  range?: { start: IsoDate; end: IsoDate };
  trip?: TripResult | null;
  onClearTrip: () => void;
}

const TYPE_LABEL: Record<string, string> = {
  public_holiday: 'Public holiday',
  transferred_holiday: 'Transferred public holiday',
  transferred_day_off: 'Transferred day off',
  transferred_working_day: 'Transferred working day',
  shortened_day: 'Shortened pre-holiday day',
  observance: 'Commemoration / observance',
  personal_day_off: 'Personal day off',
};

const source = createLatvianHolidaySource();

export function CalendarView({ calendar, settings, onChange, range, trip, onClearTrip }: Props) {
  const initial = trip?.combination.departure ?? range?.start ?? todayIso();
  const [cursor, setCursor] = useState(() => ({ year: parseIso(initial).year, month: parseIso(initial).month }));
  const [count, setCount] = useState(3);
  const [selected, setSelected] = useState<IsoDate | null>(trip?.combination.departure ?? null);

  useEffect(() => {
    if (trip) {
      const { year, month } = parseIso(trip.combination.departure);
      setCursor({ year, month });
      setSelected(trip.combination.departure);
    }
  }, [trip]);

  const months = useMemo(() => {
    const out: { year: number; month: number }[] = [];
    let { year, month } = cursor;
    for (let i = 0; i < count; i++) {
      out.push({ year, month });
      month++;
      if (month > 12) {
        month = 1;
        year++;
      }
    }
    return out;
  }, [cursor, count]);

  const shift = (n: number) => {
    let { year, month } = cursor;
    month += n;
    while (month > 12) {
      month -= 12;
      year++;
    }
    while (month < 1) {
      month += 12;
      year--;
    }
    setCursor({ year, month });
  };

  const visibleYears = Array.from(new Set(months.map((m) => m.year)));
  const upcoming = calendar.upcomingHolidays(todayIso(), 10);
  const day = selected ? calendar.day(selected) : null;

  const setOverride = (date: IsoDate, kind: DayOverrideKind | null) => {
    const overrides = settings.overrides.filter((o) => o.date !== date);
    if (kind) overrides.push({ date, kind });
    onChange({ ...settings, overrides: overrides.sort((a, b) => (a.date < b.date ? -1 : 1)) });
  };
  const togglePersonal = (date: IsoDate) => {
    const exists = settings.personalDaysOff.some((p) => p.date === date);
    onChange({
      ...settings,
      personalDaysOff: exists ? settings.personalDaysOff.filter((p) => p.date !== date) : [...settings.personalDaysOff, { date }].sort((a, b) => (a.date < b.date ? -1 : 1)),
    });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <Card className="p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button variant="ghost" onClick={() => shift(-count)} title="Previous">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" onClick={() => shift(count)} title="Next">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" onClick={() => setCursor({ year: parseIso(todayIso()).year, month: parseIso(todayIso()).month })}>
              Today
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <select className="rounded-lg border border-slate-300 px-2 py-1 text-sm" value={count} onChange={(e) => setCount(Number(e.target.value))} aria-label="Months shown">
              <option value={1}>1 month</option>
              <option value={3}>3 months</option>
              <option value={6}>6 months</option>
              <option value={12}>12 months</option>
            </select>
          </div>
        </div>

        {trip && (
          <div className="mb-4 flex items-start justify-between gap-2 rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-900 ring-1 ring-brand-200">
            <div>
              <strong>
                {trip.airport.code} → {trip.destination.city}
              </strong>{' '}
              {formatHuman(trip.combination.departure, { weekday: true })} – {formatHuman(trip.combination.return, { weekday: true, year: true })}:{' '}
              {trip.vacation.vacationDays} vacation day(s) out of {trip.vacation.calendarDays} days ({trip.vacation.workingDaysCovered.map((d) => formatHuman(d, { weekday: true })).join(', ') || 'none'}).
            </div>
            <button type="button" aria-label="Clear highlighted trip" onClick={onClearTrip} className="rounded p-0.5 hover:bg-brand-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {visibleYears.filter((y) => !source.isSeeded(y)).map((y) => (
          <p key={y} className="mb-3 flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {y}: no verified calendar data. Holidays are computed from statutory rules and are not confirmed. Cabinet working-day transfers are unknown. Check likumi.lv and add overrides if needed.
          </p>
        ))}

        <div className={cx('grid gap-6', count === 1 ? 'max-w-md' : 'sm:grid-cols-2 xl:grid-cols-3')}>
          {months.map((m) => (
            <MonthGrid
              key={`${m.year}-${m.month}`}
              year={m.year}
              month={m.month}
              calendar={calendar}
              rangeStart={range?.start}
              rangeEnd={range?.end}
              trip={trip ? { departure: trip.combination.departure, return: trip.combination.return } : undefined}
              selected={selected}
              onSelect={setSelected}
            />
          ))}
        </div>
        <div className="mt-5 border-t border-slate-100 pt-4">
          <Legend showTrip={!!trip} />
        </div>
      </Card>

      <div className="space-y-4">
        <Card className="p-4">
          {day ? (
            <div>
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs text-slate-500">{WEEKDAY_NAMES[day.weekday]}</div>
                  <div className="text-lg font-semibold text-slate-900">{formatHuman(day.date, { year: true })}</div>
                </div>
                <span className={cx('rounded-lg px-2 py-1 text-xs', CATEGORY_STYLE[day.category].cell)}>{CATEGORY_STYLE[day.category].label}</span>
              </div>
              <p className="mt-2 text-sm text-slate-700">
                {day.isWorkingDay ? (day.isShortened ? 'Working day with hours shortened by 1 hour. Counts as a vacation day if you travel.' : 'Working day. Counts as a vacation day if you travel.') : 'Non-working day. Free for travel.'}
              </p>
              {day.entries.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {day.entries.map((e) => (
                    <li key={e.id} className="rounded-lg bg-slate-50 p-2 text-xs">
                      <div className="font-medium text-slate-800">{e.name}</div>
                      {e.nameLocal && <div className="text-slate-500">{e.nameLocal}</div>}
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Badge>{TYPE_LABEL[e.type]}</Badge>
                        <Badge tone={e.status === 'official' ? 'emerald' : 'amber'}>{e.status === 'official' ? 'Seeded / reviewed' : e.status === 'computed' ? 'Computed, unverified' : 'Unverified'}</Badge>
                        {e.scope === 'state_municipal' && <Badge tone="violet">State & municipal only</Badge>}
                      </div>
                      {e.note && <div className="mt-1 text-slate-600">{e.note}</div>}
                      <div className="mt-1 text-slate-500">
                        Source: {e.source} ({e.year})
                        {e.sourceUrl && (
                          <a href={e.sourceUrl} target="_blank" rel="noopener noreferrer" className="ml-1 inline-flex items-center text-brand-700 hover:underline">
                            link <ExternalLink className="ml-0.5 h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {day.ignoredEntries.length > 0 && (
                <div className="mt-2 rounded-lg bg-violet-50 p-2 text-xs text-violet-900">
                  Not applied under your profile: {day.ignoredEntries.map((e) => e.name).join('; ')} (applies to state and municipal institutions only).
                </div>
              )}
              <div className="mt-4">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Override this date</div>
                <div className="flex flex-wrap gap-1.5">
                  <Button variant={day.override?.kind === 'day_off' ? 'primary' : 'secondary'} onClick={() => setOverride(day.date, 'day_off')}>
                    Day off
                  </Button>
                  <Button variant={day.override?.kind === 'working_day' ? 'primary' : 'secondary'} onClick={() => setOverride(day.date, 'working_day')}>
                    Working
                  </Button>
                  <Button variant={day.override?.kind === 'shortened_day' ? 'primary' : 'secondary'} onClick={() => setOverride(day.date, 'shortened_day')}>
                    Shortened
                  </Button>
                  {day.override && (
                    <Button variant="ghost" onClick={() => setOverride(day.date, null)}>
                      Clear override
                    </Button>
                  )}
                </div>
                <div className="mt-2">
                  <Button variant="ghost" onClick={() => togglePersonal(day.date)}>
                    {settings.personalDaysOff.some((p) => p.date === day.date) ? 'Remove personal day off' : 'Mark as personal day off'}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-600">Click a date to see why it is or isn't a working day, its source, and to add overrides.</p>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-900">Upcoming public holidays</h3>
          <ul className="space-y-1.5 text-sm">
            {upcoming.map((e) => (
              <li key={e.id} className="flex items-baseline justify-between gap-2">
                <button type="button" className="min-w-0 truncate text-left text-slate-700 hover:text-brand-700" onClick={() => { setSelected(e.date); const { year, month } = parseIso(e.date); setCursor({ year, month }); }}>
                  {e.name}
                  {e.status !== 'official' && <span className="ml-1 text-xs text-amber-700">(unverified)</span>}
                </button>
                <span className="shrink-0 text-xs text-slate-500 tabular">{formatHuman(e.date, { weekday: true, year: true })}</span>
              </li>
            ))}
          </ul>
        </Card>

        {visibleYears.map((y) => source.yearInfo(y)).filter(Boolean).map((info) => (
          <Card key={info!.year} className="p-4 text-xs text-slate-600">
            <h3 className="mb-1 text-sm font-semibold text-slate-900">{info!.year} calendar notes</h3>
            <p className="mb-1">Reviewed {info!.reviewedAt}.</p>
            <ul className="list-disc space-y-1 pl-4">
              {info!.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
