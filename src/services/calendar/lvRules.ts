/**
 * Statutory rules for Latvian public holidays, used ONLY for years that have no
 * seeded, reviewed data. Every generated entry has status `computed` so the UI can
 * warn that it has not been verified against an official calendar.
 *
 * Not computable (and therefore never generated):
 *  - Cabinet working-day transfers (decided yearly by Cabinet order)
 *  - One-off holidays (e.g. the closing day of the Song and Dance Festival, ad-hoc days off)
 */
import type { CalendarEntry, CalendarEventType } from '../../domain/types';
import { addDays, easterSunday, formatYmd, nthWeekdayOfMonth, weekdayOf, type IsoDate } from '../../lib/dates';

const LAW_URL = 'https://likumi.lv/ta/id/72608';

function computed(date: IsoDate, type: CalendarEventType, name: string, nameLocal: string, note?: string): CalendarEntry {
  return {
    id: `lv-${date}-${type}-computed`,
    date,
    type,
    name,
    nameLocal,
    scope: 'all',
    jurisdiction: 'LV',
    year: Number(date.slice(0, 4)),
    status: 'computed',
    source: 'Computed from statutory rules — not verified against an official calendar',
    sourceUrl: LAW_URL,
    note,
  };
}

export function computeLatvianCalendar(year: number): CalendarEntry[] {
  const easter = easterSunday(year);
  const holidays: CalendarEntry[] = [
    computed(formatYmd(year, 1, 1), 'public_holiday', "New Year's Day", 'Jaungada diena'),
    computed(addDays(easter, -2), 'public_holiday', 'Good Friday', 'Lielā Piektdiena'),
    computed(easter, 'public_holiday', 'Easter Sunday', 'Pirmās Lieldienas'),
    computed(addDays(easter, 1), 'public_holiday', 'Easter Monday', 'Otrās Lieldienas'),
    computed(formatYmd(year, 5, 1), 'public_holiday', 'Labour Day', 'Darba svētki'),
    computed(formatYmd(year, 5, 4), 'public_holiday', 'Restoration of Independence Day', 'Neatkarības atjaunošanas diena'),
    computed(nthWeekdayOfMonth(year, 5, 0, 2), 'public_holiday', "Mother's Day", 'Mātes diena'),
    computed(addDays(easter, 49), 'public_holiday', 'Whit Sunday (Pentecost)', 'Vasarsvētki'),
    computed(formatYmd(year, 6, 23), 'public_holiday', 'Midsummer Eve (Līgo Day)', 'Līgo diena'),
    computed(formatYmd(year, 6, 24), 'public_holiday', 'Midsummer Day (Jāņi)', 'Jāņu diena'),
    computed(formatYmd(year, 11, 18), 'public_holiday', 'Proclamation Day', 'Latvijas Republikas proklamēšanas diena'),
    computed(formatYmd(year, 12, 24), 'public_holiday', 'Christmas Eve', 'Ziemassvētku vakars'),
    computed(formatYmd(year, 12, 25), 'public_holiday', 'Christmas Day', 'Pirmie Ziemassvētki'),
    computed(formatYmd(year, 12, 26), 'public_holiday', 'Second Day of Christmas', 'Otrie Ziemassvētki'),
    computed(formatYmd(year, 12, 31), 'public_holiday', "New Year's Eve", 'Vecgada diena'),
  ];

  // Statute: if 4 May or 18 November falls on a Saturday or Sunday, the next working day is a holiday.
  const moved: CalendarEntry[] = [];
  for (const [m, d, label] of [
    [5, 4, 'Restoration of Independence Day'],
    [11, 18, 'Proclamation Day'],
  ] as const) {
    const date = formatYmd(year, m, d);
    const wd = weekdayOf(date);
    if (wd === 6 || wd === 0) {
      const monday = addDays(date, wd === 6 ? 2 : 1);
      moved.push(
        computed(monday, 'transferred_holiday', `Day off in lieu of ${label}`, 'Pārceltā svētku diena', `${label} falls on a weekend; the next working day is a holiday by law.`),
      );
    }
  }

  const all = [...holidays, ...moved];
  const offDates = new Set(all.map((h) => h.date));

  // Labour Law s.135(2): the working day immediately before a public holiday is shortened by one hour.
  const shortened: CalendarEntry[] = [];
  for (const h of all) {
    const before = addDays(h.date, -1);
    const wd = weekdayOf(before);
    if (wd === 0 || wd === 6 || offDates.has(before) || !before.startsWith(String(year))) continue;
    if (shortened.some((s) => s.date === before)) continue;
    shortened.push(computed(before, 'shortened_day', `Pre-holiday shortened day (before ${h.name})`, 'Pirmssvētku diena'));
  }

  return [...all, ...shortened].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
