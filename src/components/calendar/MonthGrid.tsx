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

const DOT: Partial<Record<DayInfo['category'], string>> = {
  public_holiday: 'bg-rose-500',
  transferred_day_off: 'bg-violet-500',
  transferred_working_day: 'bg-amber-500',
  shortened: 'bg-amber-500',
  personal_day_off: 'bg-sky-500',
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
        <span className="inline-block h-3 w-3 rounded bg-brand-100 ring-1 ring-brand-500" />
        Departure period (dot = day type)
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
  /** Last possible return date; days after rangeEnd up to this are shown as the return window */
  returnEnd?: IsoDate;
  trip?: { departure: IsoDate; return: IsoDate };
  selected?: IsoDate | null;
  onSelect?: (date: IsoDate) => void;
  compact?: boolean;
}

export function MonthGrid({ year, month, calendar, rangeStart, rangeEnd, returnEnd, trip, selected, onSelect, compact }: MonthGridProps) {
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
      <div className={cx('grid grid-cols-7 text-center', compact ? 'gap-1' : 'gap-0.5')} role="grid" aria-label={`${MONTH_NAMES[month - 1]} ${year}`}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <div key={i} className="text-[10px] font-medium uppercase text-slate-400" role="columnheader">
            {d}
          </div>
        ))}
        {cells.map((date, i) => {
          if (!date) return <div key={i} />;
          const info = calendar.day(date);
          const inRange = !!(rangeStart && rangeEnd && date >= rangeStart && date <= rangeEnd);
          const isRangeEdge = inRange && (date === rangeStart || date === rangeEnd);
          const inReturn = !!(rangeEnd && returnEnd && date > rangeEnd && date <= returnEnd);
          const isTripEdge = trip && (date === trip.departure || date === trip.return);
          const inTrip = trip && date > trip.departure && date < trip.return;
          const names = [...info.entries.map((e) => e.name), info.override ? `Override: ${info.override.kind.replace('_', ' ')}` : ''].filter(Boolean);
          const status = inRange ? ' · possible departure' : inReturn ? ' · possible return' : '';
          const title = `${date} · ${CATEGORY_STYLE[info.category].label}${status}${names.length ? ` · ${names.join('; ')}` : ''}`;
          const highlighted = isTripEdge || inTrip || inRange || inReturn;
          // When the cell background is used for the range, show the day type as a dot instead
          const dot = highlighted ? DOT[info.category] : undefined;
          const content = (
            <>
              {Number(date.slice(8))}
              {dot && <span className={cx('absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full', dot)} />}
              {info.entries.some((e) => e.type === 'observance') && !compact && !dot && <span className="absolute right-0.5 top-0.5 h-1 w-1 rounded-full bg-slate-400" />}
            </>
          );
          const cls = cx(
            'relative flex items-center justify-center rounded-md tabular transition',
            compact ? 'h-8 text-xs' : 'h-9 text-sm',
            isTripEdge
              ? 'bg-brand-600 font-semibold text-white'
              : inTrip
                ? 'bg-brand-100 text-brand-900'
                : isRangeEdge
                  ? 'bg-brand-600 font-semibold text-white'
                  : inRange
                    ? 'bg-brand-100 font-medium text-brand-900'
                    : inReturn
                      ? 'border border-dashed border-brand-400 bg-white text-brand-800'
                      : CATEGORY_STYLE[info.category].cell,
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
