/**
 * Latvian working-time calendar data (structured, manually maintained).
 *
 * Data is kept separate from the calculation logic in `services/calendar`.
 *
 * Legal basis:
 *  - Law "On Public Holidays, Commemoration Days and Celebration Days"
 *    ("Par svētku, atceres un atzīmējamām dienām") — https://likumi.lv/ta/id/72608
 *  - Labour Law s.133 (Cabinet may transfer working days for state/municipal institutions)
 *    and s.135 (working time is shortened by one hour on the day before a public holiday)
 *    — https://likumi.lv/ta/id/26019
 *
 * Reference calendars:
 *  - 2026: https://www.tavirekini.lv/noderigi/2026-gada-darba-dienu-kalendars
 *  - 2027: https://www.tavirekini.lv/noderigi/2027-gada-darba-dienu-kalendars
 *
 * To add a year: append a `YearCalendar` to `LV_CALENDAR_YEARS` and list every entry
 * explicitly. Years without seeded data fall back to entries *computed* from the
 * statutory rules (see `services/calendar/lvRules.ts`), which are clearly flagged as
 * unverified in the UI.
 */
import type { CalendarEntry, CalendarEventType, CalendarScope, VerificationStatus } from '../../domain/types';

export interface YearCalendar {
  year: number;
  /** Date the data was last reviewed by a maintainer */
  reviewedAt: string;
  notes: string[];
  entries: CalendarEntry[];
}

const LAW = 'Law "On Public Holidays, Commemoration Days and Celebration Days"';
const LAW_URL = 'https://likumi.lv/ta/id/72608';
const LABOUR_LAW_URL = 'https://likumi.lv/ta/id/26019';
const REF_2026 = 'https://www.tavirekini.lv/noderigi/2026-gada-darba-dienu-kalendars';
const REF_2027 = 'https://www.tavirekini.lv/noderigi/2027-gada-darba-dienu-kalendars';

function e(
  date: string,
  type: CalendarEventType,
  name: string,
  nameLocal: string,
  opts: {
    scope?: CalendarScope;
    status?: VerificationStatus;
    source?: string;
    sourceUrl?: string;
    note?: string;
    pairedDate?: string;
  } = {},
): CalendarEntry {
  const year = Number(date.slice(0, 4));
  const defaultSource =
    type === 'shortened_day'
      ? 'Labour Law s.135(2) — working day before a public holiday is shortened by 1 hour'
      : type === 'transferred_day_off' || type === 'transferred_working_day'
        ? 'Cabinet of Ministers order on transfer of working days (Labour Law s.133(4))'
        : LAW;
  return {
    id: `lv-${date}-${type}`,
    date,
    type,
    name,
    nameLocal,
    scope: opts.scope ?? 'all',
    jurisdiction: 'LV',
    year,
    status: opts.status ?? 'official',
    source: opts.source ?? defaultSource,
    sourceUrl: opts.sourceUrl ?? (type === 'shortened_day' ? LABOUR_LAW_URL : year === 2026 ? REF_2026 : year === 2027 ? REF_2027 : LAW_URL),
    note: opts.note,
    pairedDate: opts.pairedDate,
  };
}

const OBS = (date: string, name: string, nameLocal: string) =>
  e(date, 'observance', name, nameLocal, { source: LAW, sourceUrl: LAW_URL, note: 'Commemoration / celebration day — not a day off.' });

export const LV_2026: YearCalendar = {
  year: 2026,
  reviewedAt: '2026-11-24',
  notes: [
    'Working-day transfers (2 Jan → Sat 17 Jan, 22 Jun → Sat 27 Jun) were set by Cabinet order for state and municipal institutions. Private employers may, but are not obliged to, follow them.',
  ],
  entries: [
    e('2026-01-01', 'public_holiday', "New Year's Day", 'Jaungada diena'),
    e('2026-01-02', 'transferred_day_off', 'Working day transferred to Saturday 17 January', 'Pārceltā darba diena (uz 17. janvāri)', {
      scope: 'state_municipal',
      pairedDate: '2026-01-17',
    }),
    e('2026-01-17', 'transferred_working_day', 'Working Saturday (replaces 2 January)', 'Darba sestdiena (par 2. janvāri)', {
      scope: 'state_municipal',
      pairedDate: '2026-01-02',
    }),
    OBS('2026-01-20', 'Day of Remembrance of the Defenders of the 1991 Barricades', '1991. gada barikāžu aizstāvju atceres diena'),
    OBS('2026-03-25', 'Commemoration Day of Victims of the Communist Genocide', 'Komunistiskā genocīda upuru piemiņas diena'),
    e('2026-04-02', 'shortened_day', 'Pre-holiday shortened day (before Good Friday)', 'Pirmssvētku diena'),
    e('2026-04-03', 'public_holiday', 'Good Friday', 'Lielā Piektdiena'),
    e('2026-04-05', 'public_holiday', 'Easter Sunday', 'Pirmās Lieldienas'),
    e('2026-04-06', 'public_holiday', 'Easter Monday', 'Otrās Lieldienas'),
    e('2026-04-30', 'shortened_day', 'Pre-holiday shortened day (before 1 May)', 'Pirmssvētku diena'),
    e('2026-05-01', 'public_holiday', 'Labour Day; Convocation of the Constituent Assembly', 'Darba svētki; Satversmes sapulces sasaukšanas diena'),
    e('2026-05-04', 'public_holiday', 'Restoration of Independence Day', 'Latvijas Republikas Neatkarības atjaunošanas diena'),
    OBS('2026-05-08', 'Day of Victory over Nazism / Commemoration of WWII Victims', 'Nacisma sagrāves diena un Otrā pasaules kara upuru piemiņas diena'),
    e('2026-05-10', 'public_holiday', "Mother's Day", 'Mātes diena', { note: 'Always the second Sunday of May.' }),
    e('2026-05-24', 'public_holiday', 'Whit Sunday (Pentecost)', 'Vasarsvētki'),
    OBS('2026-06-14', 'Commemoration Day of Victims of Communist Terror', 'Komunistiskā terora upuru piemiņas diena'),
    e('2026-06-22', 'shortened_day', 'Pre-holiday shortened day (before Līgo Day)', 'Pirmssvētku diena', {
      note: 'For state/municipal institutions this day is a transferred day off instead.',
    }),
    e('2026-06-22', 'transferred_day_off', 'Working day transferred to Saturday 27 June', 'Pārceltā darba diena (uz 27. jūniju)', {
      scope: 'state_municipal',
      pairedDate: '2026-06-27',
    }),
    e('2026-06-23', 'public_holiday', 'Midsummer Eve (Līgo Day)', 'Līgo diena'),
    e('2026-06-24', 'public_holiday', 'Midsummer Day (Jāņi)', 'Jāņu diena'),
    e('2026-06-27', 'transferred_working_day', 'Working Saturday (replaces 22 June)', 'Darba sestdiena (par 22. jūniju)', {
      scope: 'state_municipal',
      pairedDate: '2026-06-22',
    }),
    OBS('2026-07-04', 'Commemoration Day of Victims of the Holocaust', 'Ebreju tautas genocīda upuru piemiņas diena'),
    OBS('2026-11-11', 'Lāčplēsis Day', 'Lāčplēša diena'),
    e('2026-11-17', 'shortened_day', 'Pre-holiday shortened day (before Independence Day)', 'Pirmssvētku diena'),
    e('2026-11-18', 'public_holiday', 'Proclamation Day of the Republic of Latvia', 'Latvijas Republikas proklamēšanas diena'),
    e('2026-12-23', 'shortened_day', 'Pre-holiday shortened day (before Christmas Eve)', 'Pirmssvētku diena'),
    e('2026-12-24', 'public_holiday', 'Christmas Eve', 'Ziemassvētku vakars'),
    e('2026-12-25', 'public_holiday', 'Christmas Day', 'Pirmie Ziemassvētki'),
    e('2026-12-26', 'public_holiday', 'Second Day of Christmas', 'Otrie Ziemassvētki'),
    e('2026-12-30', 'shortened_day', "Pre-holiday shortened day (before New Year's Eve)", 'Pirmssvētku diena'),
    e('2026-12-31', 'public_holiday', "New Year's Eve", 'Vecgada diena'),
  ],
};

export const LV_2027: YearCalendar = {
  year: 2027,
  reviewedAt: '2026-11-24',
  notes: [
    'Working-day transfers for 2027: a draft Cabinet order (26-TA-1023) proposed moving 25 Jun → Sat 19 Jun and 19 Nov → Sat 13 Nov, but media reported on 14 Oct 2026 that the Ministry of Welfare confirmed no working days will be transferred in 2027. No transfers are seeded. Add them as manual overrides if an official order is adopted.',
    '4 May (Tuesday) and 18 November (Thursday) fall on working days, so no statutory holiday transfer applies in 2027.',
  ],
  entries: [
    e('2027-01-01', 'public_holiday', "New Year's Day", 'Jaungada diena'),
    OBS('2027-01-20', 'Day of Remembrance of the Defenders of the 1991 Barricades', '1991. gada barikāžu aizstāvju atceres diena'),
    OBS('2027-03-25', 'Commemoration Day of Victims of the Communist Genocide', 'Komunistiskā genocīda upuru piemiņas diena'),
    e('2027-03-25', 'shortened_day', 'Pre-holiday shortened day (before Good Friday)', 'Pirmssvētku diena'),
    e('2027-03-26', 'public_holiday', 'Good Friday', 'Lielā Piektdiena'),
    e('2027-03-28', 'public_holiday', 'Easter Sunday', 'Pirmās Lieldienas'),
    e('2027-03-29', 'public_holiday', 'Easter Monday', 'Otrās Lieldienas'),
    e('2027-04-30', 'shortened_day', 'Pre-holiday shortened day (before 1 May)', 'Pirmssvētku diena'),
    e('2027-05-01', 'public_holiday', 'Labour Day; Convocation of the Constituent Assembly', 'Darba svētki; Satversmes sapulces sasaukšanas diena', {
      note: 'Falls on a Saturday — no replacement day off (only 4 May and 18 November are moved by statute).',
    }),
    e('2027-05-03', 'shortened_day', 'Pre-holiday shortened day (before Restoration of Independence Day)', 'Pirmssvētku diena'),
    e('2027-05-04', 'public_holiday', 'Restoration of Independence Day', 'Latvijas Republikas Neatkarības atjaunošanas diena'),
    OBS('2027-05-08', 'Day of Victory over Nazism / Commemoration of WWII Victims', 'Nacisma sagrāves diena un Otrā pasaules kara upuru piemiņas diena'),
    e('2027-05-09', 'public_holiday', "Mother's Day", 'Mātes diena', { note: 'Always the second Sunday of May.' }),
    e('2027-05-16', 'public_holiday', 'Whit Sunday (Pentecost)', 'Vasarsvētki'),
    OBS('2027-06-14', 'Commemoration Day of Victims of Communist Terror', 'Komunistiskā terora upuru piemiņas diena'),
    e('2027-06-22', 'shortened_day', 'Pre-holiday shortened day (before Līgo Day)', 'Pirmssvētku diena'),
    e('2027-06-23', 'public_holiday', 'Midsummer Eve (Līgo Day)', 'Līgo diena'),
    e('2027-06-24', 'public_holiday', 'Midsummer Day (Jāņi)', 'Jāņu diena'),
    OBS('2027-07-04', 'Commemoration Day of Victims of the Holocaust', 'Ebreju tautas genocīda upuru piemiņas diena'),
    OBS('2027-11-11', 'Lāčplēsis Day', 'Lāčplēša diena'),
    e('2027-11-17', 'shortened_day', 'Pre-holiday shortened day (before Independence Day)', 'Pirmssvētku diena'),
    e('2027-11-18', 'public_holiday', 'Proclamation Day of the Republic of Latvia', 'Latvijas Republikas proklamēšanas diena'),
    e('2027-12-23', 'shortened_day', 'Pre-holiday shortened day (before Christmas Eve)', 'Pirmssvētku diena'),
    e('2027-12-24', 'public_holiday', 'Christmas Eve', 'Ziemassvētku vakars'),
    e('2027-12-25', 'public_holiday', 'Christmas Day', 'Pirmie Ziemassvētki'),
    e('2027-12-26', 'public_holiday', 'Second Day of Christmas', 'Otrie Ziemassvētki'),
    e('2027-12-30', 'shortened_day', "Pre-holiday shortened day (before New Year's Eve)", 'Pirmssvētku diena'),
    e('2027-12-31', 'public_holiday', "New Year's Eve", 'Vecgada diena'),
  ],
};

export const LV_CALENDAR_YEARS: YearCalendar[] = [LV_2026, LV_2027];
