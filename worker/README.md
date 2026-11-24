# Travelpayouts proxy (Cloudflare Worker, free plan)

FlightPall is a static site. Live-ish fare data from the **Travelpayouts / Aviasales Data API** needs:

1. a secret API token, which must never ship in frontend code or a public repo, and
2. a CORS-enabled endpoint, which the Travelpayouts API does not provide.

This ~80-line worker covers both. It runs on Cloudflare Workers' **free plan** (100,000 requests/day; no credit card needed for the free plan at the time of writing).

## Setup (≈10 minutes, €0)

1. **Get a free Travelpayouts token**
   - Sign up at <https://www.travelpayouts.com/> (free affiliate account, no payment details).
   - Join the **Aviasales** program and copy your API token (Profile → API token).
2. **Create a free Cloudflare account** at <https://dash.cloudflare.com/sign-up>.
3. **Deploy the worker**, either in the browser (easiest) or from the command line.

   **In the browser (no tools needed):** In Cloudflare go to *Workers & Pages → Create → Create Worker*, name it `flightpall-proxy` and click *Deploy*. Click *Edit code*, replace everything with the contents of [`src.js`](src.js), and click *Deploy*. Then open *Settings → Variables and Secrets → Add*, choose type **Secret**, name `TRAVELPAYOUTS_TOKEN`, and paste your token. By default the worker accepts requests from `https://ultrapuika.github.io` and `http://localhost:5173`. To allow other sites, add a text variable `ALLOWED_ORIGINS` (comma-separated).

   **From the command line:**
   ```bash
   cd worker
   npx wrangler login
   npx wrangler secret put TRAVELPAYOUTS_TOKEN   # paste the token when prompted
   # edit ALLOWED_ORIGINS in wrangler.toml to your GitHub Pages origin
   npx wrangler deploy
   ```
   Wrangler prints a URL such as `https://flightpall-proxy.<you>.workers.dev`.
4. **Point FlightPall at it**, using either option:
   - In the app: *Settings → Flight data source → Aviasales cached fares*, then paste the URL, or
   - At build time: set the repository variable `VITE_TRAVELPAYOUTS_PROXY_URL` (GitHub → Settings → Secrets and variables → Actions → *Variables*). The URL is not secret. The token stays in Cloudflare.

## What the worker allows

- `GET /prices_for_dates?origin=RIX&destination=ROM&departure_at=2027-01&one_way=false…`
- Only whitelisted query parameters are forwarded, `origin`/`destination` must be IATA codes, and the currency is forced to EUR.
- Requests from origins not listed in `ALLOWED_ORIGINS` are rejected.
- Successful responses are edge-cached for `CACHE_SECONDS` (default 1 h) to reduce upstream calls.

## Limits & caveats

- Prices are **cached fares found by Aviasales users in the last ~48 h**. They are indicative: not live, not guaranteed and not available for every date. FlightPall labels them "Indicative price".
- Route/date coverage depends on what users have searched recently. Unpopular routes or dates far in the future may be missing.
- Travelpayouts publishes per-endpoint rate limits (documented as 600 requests/minute for `prices_for_dates` at the time of writing). FlightPall throttles to ~4 req/s with max 3 concurrent requests, and retries 429/5xx with backoff.
- Use is subject to the Travelpayouts and Aviasales program terms. Booking links go to Aviasales.
