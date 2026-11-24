# FlightPall

A flexible, multi-airport flight discovery engine for travellers in Latvia and the neighbouring Baltic states. It finds the cheapest trips that use the fewest vacation days.

- Search from **Riga, Tallinn, Vilnius and Kaunas at once**, with your own extra cost per airport (bus, parking…) included in every price and ranking.
- Pick **any departure period** (across months and years) and a **flexible trip length** (min / preferred / max). Every valid departure and return combination is checked.
- A **working-day engine** counts the vacation days each trip needs, using your working week, the **Latvian holiday calendar** (private vs state/municipal profile), personal days off and manual overrides.
- Flight times are checked against your **working hours** to flag conflicts.
- **Anywhere** or **specific destination** search; results ranked by **adjusted total price**, or by other sorts that each explain the ranking.
- Runs entirely in the browser and costs **€0** (see [FREE_RESOURCES.md](FREE_RESOURCES.md)).

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173/FlightPall/
npm test           # unit tests (vitest)
npm run build      # production build into dist/
```

The app starts in **Demo mode** with clearly labelled sample data. Switch the data source in *Settings*:

| Mode | Prices | Setup |
|---|---|---|
| Aviasales cached fares | Real but **indicative** (seen by users in the last ~48 h) | Free Travelpayouts token + free Cloudflare Worker: see [worker/README.md](worker/README.md) |
| No price data | None; date planner + links to Google Flights / Skyscanner / Aviasales | None |
| Demo | Synthetic, **not real** | None |

## Architecture

```
src/
  domain/types.ts               All shared types (airports, calendar, offers, results)
  lib/dates.ts, lib/time.ts     DST-safe date arithmetic; IANA time-zone conversion via Intl
  data/
    airports.ts                 Departure airports (defaults + extras), ~80 destination cities
    holidays/lv.ts              Seeded Latvian calendar 2026–2027 (data only, with sources)
  services/
    airports.ts                 Adjusted price = flight price + airport cost
    calendar/
      holidayCalendar.ts        Resolves each date for a profile (+ overrides, personal days)
      lvRules.ts                Statutory rules for unseeded years (flagged "computed")
      vacationDays.ts           Date-based vacation-day calculation
      timeConflicts.ts          Flight time vs working hours warnings
    search/
      dateCombinations.ts       Every (departure, return) pair, deduplicated
      searchEngine.ts           Orchestration: plan → dedupe → cache → throttled queue → stream
      requestQueue.ts           Concurrency + min-interval throttle, retries with backoff, abort
      cache.ts                  TTL cache (memory + localStorage)
      tripBuilder.ts            Offer → TripResult (vacation, conflicts, preferences, links)
    providers/
      types.ts                  FlightProvider interface (plan, execute, optional revalidate)
      travelpayoutsProvider.ts  Aviasales Data API via proxy
      linksOnlyProvider.ts      Unpriced planner
      demoProvider.ts           Deterministic sample data
      externalLinks.ts          Deep links to free search sites
    ranking.ts                  Sorts, filters, transparent explanations
    storage.ts                  Versioned preferences + saved searches
  components/                   React UI (search, results, calendar, settings)
worker/                         Optional Cloudflare Worker proxy (keeps the API token secret)
tests/                          Unit tests
```

Business logic lives in `services/` and has no React dependency. The UI only calls into it.

### No backend

All logic runs client-side. The only server-side piece is the optional proxy worker, needed solely because the fare API token must stay secret and the API has no CORS.

## Key rules and calculations

### Adjusted price

`adjusted = ticket price + airport additional cost`. Both numbers are shown on every result. The adjustment is used for ranking, budget filtering and the value score. Negative adjustments are allowed.

### Trip duration

- **Calendar days** (default): departure and return days both count. 4 days from Fri 15 Jan returns Mon 18 Jan.
- **Nights**: 4 nights from Fri 15 Jan returns Tue 19 Jan.

You pick a travel window: **From** (earliest departure) and **To** (back home by). The last possible departure is derived so the shortest trip still fits. All durations from minimum to maximum are searched, each (departure, return) pair appears once, and no trip ends after the To date. Past departure dates are skipped.

### Vacation days

Each date from departure to return (inclusive) is classified. A date is a vacation day when you would otherwise work it. Precedence, highest first:

1. manual date override
2. personal day off
3. public holiday / statutory transferred holiday (everyone)
4. Cabinet working-day transfers (state & municipal profile, or custom with transfers on)
5. your weekly schedule

A holiday on a weekend is non-working once, never counted twice. Shortened pre-holiday days are working days.

Flight times never change the count. They add warnings (e.g. a 06:00 departure on a working day) or notes (e.g. a 22:00 departure after work: you might work that day).

### Ranking

Default: lowest adjusted price. The value score is `(adjusted price + vacation days × € per vacation day) ÷ trip days`, and the € value is configurable. Every card shows "Why #n" with the exact numbers. Preferences (weekend departure, after-work departure…) never hide results. They add badges and break ties.

## Latvian calendar

- Seeded: **2026** and **2027**, from the law *On Public Holidays, Commemoration Days and Celebration Days* ([likumi.lv](https://likumi.lv/ta/id/72608)), Labour Law ss.133 and 135, and the reference calendars on tavirekini.lv.
- 2026 Cabinet transfers (state/municipal only): 2 Jan → Sat 17 Jan, 22 Jun → Sat 27 Jun.
- 2027: no transfers are seeded. A draft order proposed two, but the ministry was reported (14 Oct 2026) to have confirmed none would be made. Add overrides if that changes.
- Event types are kept apart: public holiday, transferred holiday, transferred day off, transferred working day, shortened day, observance, personal day off.
- Other years are computed from statute (Easter-based dates, 4 May / 18 Nov weekend rule, pre-holiday shortening) and **flagged as unverified** in the UI.

**Adding a year:** append a `YearCalendar` in `src/data/holidays/lv.ts` with every entry and its source, then extend `tests/latvianCalendar.test.ts`.

## Deployment (GitHub Pages)

1. Repository → *Settings → Pages* → Source: **GitHub Actions**.
2. Push to `main`. `.github/workflows/deploy.yml` runs the tests, builds with `VITE_BASE_PATH=/<repo>/` and deploys.
3. Optional repository **variables** (not secrets):
   - `VITE_TRAVELPAYOUTS_PROXY_URL`: your worker URL, enabling cached fares by default.
   - `VITE_BASE_PATH`: set to `/` for a custom domain.

Navigation uses hash routes (`#/calendar`, `#/settings`), so deep links work on Pages without rewrites.

## Configuration

| Variable | Where | Purpose |
|---|---|---|
| `VITE_TRAVELPAYOUTS_PROXY_URL` | build env / `.env.local` | Public URL of the proxy worker. Never put the API token here |
| `VITE_BASE_PATH` | build env | Base path (default `/FlightPall/`) |
| `TRAVELPAYOUTS_TOKEN` | Cloudflare Worker **secret** | Travelpayouts API token |
| `ALLOWED_ORIGINS` | `worker/wrangler.toml` | Origins allowed to call the proxy |

## Known limitations

- No free source offers **live bookable** fares (see FREE_RESOURCES.md). Prices are at best indicative. Always confirm on the booking site. No result is ever labelled "verified".
- Indicative fares only exist where Aviasales users searched recently, so some date combinations show no result.
- Preferences and saved searches live in one browser. Use *Settings → Export* to move them.
