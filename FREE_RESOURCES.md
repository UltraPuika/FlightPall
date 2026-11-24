# Free resources: €0 budget

FlightPall is built, hosted and run with free resources only. None of the components below need a credit card, a trial or a paid plan.

## Summary

| Component | Selected solution | Cost | Limitations |
|---|---|---:|---|
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS 4 + lucide-react icons (all MIT) | €0 | None; open source |
| Hosting | GitHub Pages (static) | €0 | Public repo (or GitHub Pro for private Pages); soft limits of 1 GB site size and 100 GB/month bandwidth; no server-side code |
| Database/storage | Browser `localStorage` (preferences, saved searches, overrides, response cache) | €0 | Per browser and device only; ~5 MB quota; cleared with site data. Export/import JSON is provided for backup |
| Flight data (primary) | Travelpayouts / Aviasales Data API (`/aviasales/v3/prices_for_dates`) via your own Cloudflare Worker | €0 | Free affiliate signup required. **Cached, indicative prices** (fares found by users in the last ~48 h), not live. Coverage gaps on rarely searched routes and dates. Rate limits apply (documented as 600 req/min for this endpoint) |
| Flight data (proxy) | Cloudflare Workers free plan | €0 | 100,000 requests/day, 10 ms CPU per request; free account needed |
| Flight data (fallback) | "No price data" mode: full date and vacation-day planner with deep links to Google Flights, Skyscanner and Aviasales | €0 | No prices inside the app. The user checks prices on those sites |
| Flight data (offline) | Demo mode: deterministic sample data, always labelled "Sample data, not real" | €0 | Not real. For trying the app only |
| Calendar data | Manually maintained structured data in `src/data/holidays/lv.ts` (Latvian law on likumi.lv + reviewed working-time calendars), plus a rule-based fallback flagged "computed, unverified" | €0 | Must be updated yearly by hand (Cabinet transfers are decided annually) |
| Maps | Not used | €0 | Maps are optional. If added later, use Leaflet + OpenStreetMap tiles and respect the [OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/) |
| CI/CD | GitHub Actions (`.github/workflows/deploy.yml`): tests, build, Pages deploy | €0 | Free for public repos; 2,000 min/month for private repos on the Free plan |

## Flight-data investigation

What was checked and why each source was chosen or rejected. "Verified" means it was confirmed against public sources while building this project (November 2026). "Reported" means it comes from secondary sources or earlier knowledge and should be re-checked before relying on it.

| Source | Genuinely free? | Ongoing access? | Signup / payment | Real prices? | Flexible dates | Multi-airport | Decision |
|---|---|---|---|---|---|---|---|
| **Travelpayouts / Aviasales Data API** | Yes (affiliate program) | Yes | Free account, no card | Yes, but **cached / indicative** (last ~48 h of user searches) | Yes: `departure_at` accepts a whole month | One origin per request; we fan out per airport | ✅ **Selected** as the primary source |
| Amadeus for Developers (Self-Service) | n/a | **No**: verified shut down. Self-service keys were disabled on 17 July 2026; only Enterprise (contract) remains | n/a | n/a | n/a | n/a | ❌ Discontinued |
| Skyscanner API | No public access | Partners only | Commercial approval | Yes | Yes | Yes | ❌ Not available to individuals |
| Kiwi.com Tequila | Reported closed to new public signups (invite/partner only) | Uncertain | Partner approval | Yes | Yes | Yes | ❌ Not openly available |
| Google Flights | No API (QPX Express was shut down in 2018) | No | n/a | n/a | n/a | n/a | ❌ Deep links only |
| SerpApi (Google Flights results) | Small free tier reported (~100 searches/month) | Yes, tiny quota | Free account | Yes (scraped from Google) | One query per date | One per query | ❌ Quota far too small (one search here can need 50+ calls), and it relies on scraping Google results |
| Duffel | Test mode free; live use is paid per booking | Live use paid | Card for live | Test data isn't real | Per-date only | n/a | ❌ Not free for real data |
| Airline endpoints (e.g. Ryanair/airBaltic internal APIs) | Unofficial | Unreliable | n/a | Yes | Some | n/a | ❌ **Excluded**: unauthorised scraping is not allowed |
| OpenSky Network / public ADS-B | Yes (non-commercial) | Yes | Free account | **No prices** (movements only) | n/a | n/a | ➖ Not useful for fares |
| OurAirports dataset | Public domain | Yes | None | No prices (airport metadata) | n/a | n/a | ➖ Could extend the airport list later |

**Conclusion:** no free source provides live, bookable fares. FlightPall therefore:

- uses Travelpayouts cached fares when a proxy is configured, labelled **Indicative**, with a link to the booking site to confirm;
- stays fully useful without any price API through the **No price data** planner and deep links;
- offers a **Demo** mode that is clearly marked as not real;
- has a provider abstraction (`src/services/providers/types.ts`) and a `PriceKind` model (`live_verified`, `indicative`, `historical`, `schedule_only`, `demo`, `unpriced`). A future provider can plug in, and only one that implements `revalidate()` could ever show "Verified live price".

## Registration requirements

| Service | Needed for | What's required |
|---|---|---|
| GitHub | Hosting + CI | Free account |
| Travelpayouts | Optional cached fares | Free affiliate account; accept the program terms |
| Cloudflare | Optional proxy for the token | Free account (Workers free plan) |

## Discontinuation risks

- **Travelpayouts** could change quotas, terms or the v3 endpoint. Mitigation: the provider is isolated in `travelpayoutsProvider.ts`, and the app falls back to *No price data* mode.
- **Cloudflare Workers free plan** limits could change. The worker is ~80 lines and easy to port to another free edge runtime.
- **GitHub Pages / Actions** free tiers for public repos have been stable for years, but are not contractually guaranteed.
- **Holiday data** goes stale every year. Unseeded years are computed from statute and flagged *unverified*. Cabinet transfers must be added by hand.
- **Deep-link formats** (Google Flights, Skyscanner, Aviasales) are not formal APIs and may change. They are only convenience links.
