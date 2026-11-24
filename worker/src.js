/**
 * FlightPall — Travelpayouts proxy for Cloudflare Workers (free plan).
 *
 * Why: the Travelpayouts token must stay secret and the API sends no CORS headers,
 * so a static GitHub Pages site cannot call it directly.
 *
 * Security:
 *  - Only GET /prices_for_dates is forwarded; only whitelisted query params pass through.
 *  - The token is read from the TRAVELPAYOUTS_TOKEN secret and never returned.
 *  - CORS is limited to ALLOWED_ORIGINS (comma-separated).
 *  - Responses are edge-cached (CACHE_SECONDS, default 3600) to save quota.
 */
const UPSTREAM = 'https://api.travelpayouts.com/aviasales/v3/prices_for_dates';
const ALLOWED_PARAMS = ['origin', 'destination', 'departure_at', 'return_at', 'one_way', 'direct', 'currency', 'market', 'limit', 'page', 'sorting', 'unique'];
const IATA = /^[A-Z]{3}$/;
const DEFAULT_ORIGINS = 'https://ultrapuika.github.io,http://localhost:5173';

function cors(origin, allowed) {
  const ok = allowed.includes('*') || allowed.includes(origin);
  return ok
    ? { 'Access-Control-Allow-Origin': origin || '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Max-Age': '86400', Vary: 'Origin' }
    : null;
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    // Default: the FlightPall GitHub Pages site + local dev. Override with the ALLOWED_ORIGINS variable.
    const allowed = (env.ALLOWED_ORIGINS || DEFAULT_ORIGINS).split(',').map((s) => s.trim()).filter(Boolean);
    const corsHeaders = cors(origin, allowed);
    if (origin && !corsHeaders) return json({ success: false, error: 'Origin not allowed' }, 403, {});
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders || {} });
    if (request.method !== 'GET') return json({ success: false, error: 'Method not allowed' }, 405, corsHeaders || {});
    if (url.pathname.replace(/\/+$/, '') !== '/prices_for_dates') return json({ success: false, error: 'Not found' }, 404, corsHeaders || {});
    if (!env.TRAVELPAYOUTS_TOKEN) return json({ success: false, error: 'Proxy is missing TRAVELPAYOUTS_TOKEN secret' }, 500, corsHeaders || {});

    const params = new URLSearchParams();
    for (const key of ALLOWED_PARAMS) {
      const v = url.searchParams.get(key);
      if (v !== null && v.length <= 32) params.set(key, v);
    }
    if (!IATA.test(params.get('origin') || '')) return json({ success: false, error: 'origin must be an IATA code' }, 400, corsHeaders || {});
    if (params.has('destination') && !IATA.test(params.get('destination'))) return json({ success: false, error: 'destination must be an IATA code' }, 400, corsHeaders || {});
    params.set('currency', 'eur');

    const cacheKey = new Request(`${UPSTREAM}?${params}`, { method: 'GET' });
    const cache = caches.default;
    let res = await cache.match(cacheKey);
    if (!res) {
      const upstream = new URL(UPSTREAM);
      upstream.search = params.toString();
      const r = await fetch(upstream, { headers: { 'X-Access-Token': env.TRAVELPAYOUTS_TOKEN, 'Accept-Encoding': 'gzip' } });
      const body = await r.text();
      res = new Response(body, {
        status: r.status,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `public, max-age=${Number(env.CACHE_SECONDS) || 3600}`,
          ...(r.headers.get('Retry-After') ? { 'Retry-After': r.headers.get('Retry-After') } : {}),
        },
      });
      if (r.ok) ctx.waitUntil(cache.put(cacheKey, res.clone()));
    }
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(corsHeaders || {})) out.headers.set(k, v);
    return out;
  },
};
