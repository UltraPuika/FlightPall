import type { DayInfo } from '../../domain/types';
import { daysInMonth, formatYmd, MONTH_NAMES, weekdayOf, type IsoDate } from '../../lib/dates';
import type { HolidayCalendar } from '../../services/calendar/holidayCalendar';
import { cx } from '../ui/primitives';

export const CATEGORY_STYLE: Record<DayInfo['category'], { cell: string; label: string; swatch: string }> = {
  working: { cell: 'bg-white text-slate-800', label: 'Working day', swatch: 'bg-white ring-1 ring-slate-300' },
  weekend: { cell: 'bg-slate-100 text-slate-500', label: 'Weekend / non-working', swatch: 'bg-slate-200' },
  public_holiday: { cell: 'bg-rose-100 text-rose-800 font-semibold', label: 'Public holiday', swatch: 'bg-rose-200' },
  transferred_day_off: { cell: 'bg-violet-100 text-violet-800 font-semibold', label: 'Transferred day off', swatch: 'bg-violet-200' },
  transferred_working_day: { cell: 'bg-amber-100 text-amber-900 font-semibold ring-1 ring-inset ring-amber-400 ring-dashed', label: 'Transferred working day', swatch: 'bg-amber-200 ring-1 ring-amber-400' },
  shortened: { cell: 'bg-yellow-50 text-slate-800 shadow-[inset_0_-3px_0_0_#f59e0b]', label: 'Shortened pre-holiday day', swatch: 'bg-yellow-50 shadow-[inset_0_-3px_0_0_#f59e0b] ring-1 ring-slate-200' },
  personal_day_off: { cell: 'bg-sky-100 text-sky-800 font-semibold', label: 'Personal day off / override', swatch: 'bg-sky-200' },
};

export function Legend({ showTrip }: { showTrip?: boolean }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-600">
      {Object.values(CATEGORY_STYLE).map((s) => (
        <li key={s.label} className="flex items-center gap-1.5">
          <span className={cx('inline-block h-3 w-3 rounded', s.swatch)} />
          {s.label}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded ring-1 ring-brand-500" />
        Search period
      </li>
      {showTrip && (
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded bg-brand-600" />
          Departure / return
        </li>
      )}
    </ul>
  );
}

export interface MonthGridProps {
  year: number;
  month: number;
  calendar: HolidayCalendar;
  rangeStart?: IsoDate;
  rangeEnd?: IsoDate;
  trip?: { departure: IsoDate; return: IsoDate };
  selected?: IsoDate | null;
  onSelect?: (date: IsoDate) => void;
  compact?: boolean;
}

export function MonthGrid({ year, month, calendar, rangeStart, rangeEnd, trip, selected, onSelect, compact }: MonthGridProps) {
  const first = formatYmd(year, month, 1);
  // Monday-first grid
  const lead = (weekdayOf(first) + 6) % 7;
  const total = daysInMonth(year, month);
  const cells: (IsoDate | null)[] = [...Array(lead).fill(null), ...Array.from({ length: total }, (_, i) => formatYmd(year, month, i + 1))];
  while (cells.length % 7) cells.push(null);

  return (
    <div className="min-w-0">
      <div className={cx('mb-1.5 font-semibold text-slate-800', compact ? 'text-xs' : 'text-sm')}>
        {MONTH_NAMES[month - 1]} {year}
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center" role="grid" aria-label={`${MONTH_NAMES[month - 1]} ${year}`}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <div key={i} className="text-[10px] font-medium uppercase text-slate-400" role="columnheader">
            {d}
          </div>
        ))}
        {cells.map((date, i) => {
          if (!date) return <div key={i} />;
          const info = calendar.day(date);
          const inRange = rangeStart && rangeEnd && date >= rangeStart && date <= rangeEnd;
          const isTripEdge = trip && (date === trip.departure || date === trip.return);
          const inTrip = trip && date > trip.departure && date < trip.return;
          const names = [...info.entries.map((e) => e.name), info.override ? `Override: ${info.override.kind.replace('_', ' ')}` : ''].filter(Boolean);
          const title = `${date} · ${CATEGORY_STYLE[info.category].label}${names.length ? ` · ${names.join('; ')}` : ''}`;
          const content = (
            <>
              {Number(date.slice(8))}
              {info.entries.some((e) => e.type === 'observance') && !compact && <span className="absolute right-0.5 top-0.5 h-1 w-1 rounded-full bg-slate-400" />}
            </>
          );
          const cls = cx(
            'relative flex items-center justify-center rounded-md tabular transition',
            compact ? 'h-6 text-[11px]' : 'h-9 text-sm',
            isTripEdge ? 'bg-brand-600 font-semibold text-white' : inTrip ? 'bg-brand-100 text-brand-900' : CATEGORY_STYLE[info.category].cell,
            inRange && !isTripEdge && 'ring-1 ring-inset ring-brand-500',
            selected === date && 'outline-2 outline-offset-1 outline-slate-900',
            onSelect && 'cursor-pointer hover:brightness-95',
          );
          return onSelect ? (
            <button key={date} type="button" role="gridcell" title={title} aria-label={title} aria-selected={selected === date} className={cls} onClick={() => onSelect(date)}>
              {content}
            </button>
          ) : (
            <div key={date} role="gridcell" title={title} className={cls}>
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
