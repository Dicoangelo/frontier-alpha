/**
 * Edge Function: Ultra-low-latency quote serving
 *
 * Proxies to Polygon.io with stale-while-revalidate caching (5s fresh, 30s stale).
 * Runs on Vercel Edge Runtime (V8 isolates) — no Node.js APIs.
 *
 * Usage:
 *   GET /api/edge/quotes?symbols=AAPL
 *   GET /api/edge/quotes?symbols=AAPL,MSFT,GOOG
 */

export const config = {
  runtime: 'edge',
  regions: ['iad1'], // US East for lowest latency to NYSE/NASDAQ
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QuoteResult {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  timestamp: string;
}

/** One daily OHLCV bar from `/v2/aggs/ticker/{T}/range/1/day/...`. */
interface PolygonAggBar {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  t: number; // unix milliseconds
}

interface CacheEntry {
  data: QuoteResult;
  fetchedAt: number;
}

// ---------------------------------------------------------------------------
// In-memory edge cache (per-isolate, evicted on cold start)
// ---------------------------------------------------------------------------

const quoteCache = new Map<string, CacheEntry>();
const FRESH_MS = 5_000;      // 5 seconds — serve fresh
const STALE_MAX_MS = 30_000; // 30 seconds — serve stale while revalidating

// ---------------------------------------------------------------------------
// Polygon.io fetch
// ---------------------------------------------------------------------------

/** Outcome of a provider fetch — quotes plus any upstream rejection. */
interface PolygonFetchOutcome {
  quotes: Map<string, QuoteResult>;
  /** HTTP status of the first plan-tier/auth rejection, if any. */
  deniedStatus?: number;
}

/**
 * Fetch quotes from Polygon **daily aggregates**.
 *
 * Do NOT use the Snapshot endpoint here. `/v2/snapshot/...` is NOT entitled on
 * the Stocks Starter plan — it returns HTTP 403 NOT_AUTHORIZED (verified
 * 2026-07-30 against the production key). Neither is `/v2/last/trade`.
 * Aggregates ARE entitled, so the quote is derived from the two most recent
 * daily bars: the latest close is the price, and the prior close gives
 * change / changePercent.
 *
 * Prices are 15-minute delayed on this plan; that is a plan property, not a bug.
 */
async function fetchFromPolygon(
  symbols: string[],
  apiKey: string,
): Promise<PolygonFetchOutcome> {
  const quotes = new Map<string, QuoteResult>();
  let deniedStatus: number | undefined;

  // A 10-day calendar window always contains at least two trading sessions,
  // even across a long weekend plus a market holiday.
  const to = new Date();
  const from = new Date(to.getTime() - 10 * 24 * 60 * 60 * 1000);
  const range = `${from.toISOString().slice(0, 10)}/${to.toISOString().slice(0, 10)}`;

  await Promise.all(
    symbols.map(async (symbol) => {
      const url =
        `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${range}` +
        `?adjusted=true&sort=desc&limit=2&apiKey=${apiKey}`;

      const response = await fetch(url, { headers: { Accept: 'application/json' } });

      if (!response.ok) {
        // 401/403 mean the key or the plan is the problem — that is an outage,
        // not an empty result, and the handler must not report success.
        if (response.status === 401 || response.status === 403) {
          deniedStatus ??= response.status;
        }
        console.error(`Polygon API error for ${symbol}: ${response.status} ${response.statusText}`);
        return;
      }

      const json = (await response.json()) as { results?: PolygonAggBar[] };
      // `limit` bounds the aggregation window, not the row count, so slice.
      const [latest, prior] = (json.results ?? []).slice(0, 2);
      if (!latest || !latest.c) return;

      const prevClose = prior?.c ?? latest.o;
      const change = latest.c - prevClose;

      quotes.set(symbol, {
        symbol,
        price: latest.c,
        change,
        changePercent: prevClose ? (change / prevClose) * 100 : 0,
        volume: latest.v ?? 0,
        timestamp: new Date(latest.t).toISOString(), // aggregate `t` is milliseconds
      });
    }),
  );

  return { quotes, deniedStatus };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async function handler(request: Request): Promise<Response> {
  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  if (request.method !== 'GET') {
    return jsonResponse(
      { success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'GET only' } },
      405,
    );
  }

  const start = Date.now();
  const url = new URL(request.url);
  const symbolsParam = url.searchParams.get('symbols');

  if (!symbolsParam) {
    return jsonResponse(
      {
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: 'symbols query parameter required (e.g. ?symbols=AAPL,MSFT)',
        },
      },
      400,
    );
  }

  // Parse and validate symbols
  const symbols = symbolsParam
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-Z]{1,5}$/.test(s));

  if (symbols.length === 0) {
    return jsonResponse(
      {
        success: false,
        error: { code: 'BAD_REQUEST', message: 'No valid symbols provided' },
      },
      400,
    );
  }

  if (symbols.length > 50) {
    return jsonResponse(
      {
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Maximum 50 symbols per request' },
      },
      400,
    );
  }

  // -------------------------------------------------------------------------
  // Stale-while-revalidate: partition symbols into fresh, stale, and missing
  // -------------------------------------------------------------------------

  const now = Date.now();
  const fresh: QuoteResult[] = [];
  const staleResults: QuoteResult[] = [];
  const needsFetch: string[] = [];

  for (const sym of symbols) {
    const cached = quoteCache.get(sym);
    if (!cached) {
      needsFetch.push(sym);
    } else if (now - cached.fetchedAt < FRESH_MS) {
      fresh.push(cached.data);
    } else if (now - cached.fetchedAt < STALE_MAX_MS) {
      // Serve stale, but revalidate
      staleResults.push(cached.data);
      needsFetch.push(sym);
    } else {
      // Expired — must fetch
      needsFetch.push(sym);
    }
  }

  // -------------------------------------------------------------------------
  // Fetch missing / stale symbols from Polygon
  // -------------------------------------------------------------------------

  const apiKey = process.env.POLYGON_API_KEY;
  let fetchedQuotes = new Map<string, QuoteResult>();
  let providerFailed = false;
  let deniedStatus: number | undefined;

  if (needsFetch.length > 0 && !apiKey) {
    providerFailed = true;
    console.error('POLYGON_API_KEY is not set in this environment');
  }

  if (needsFetch.length > 0 && apiKey) {
    try {
      const outcome = await fetchFromPolygon(needsFetch, apiKey);
      fetchedQuotes = outcome.quotes;
      deniedStatus = outcome.deniedStatus;
      if (deniedStatus || fetchedQuotes.size === 0) providerFailed = true;

      // Update cache
      const fetchTime = Date.now();
      for (const [sym, quote] of fetchedQuotes) {
        quoteCache.set(sym, { data: quote, fetchedAt: fetchTime });
      }
    } catch (err) {
      providerFailed = true;
      console.error('Polygon fetch error:', err);
      // Fall through — serve whatever stale data we have
    }
  }

  // -------------------------------------------------------------------------
  // Assemble response
  // -------------------------------------------------------------------------

  const quotes: QuoteResult[] = [];
  const cacheStatus: Record<string, string> = {};

  for (const sym of symbols) {
    const fetched = fetchedQuotes.get(sym);
    const stale = staleResults.find((q) => q.symbol === sym);
    const freshHit = fresh.find((q) => q.symbol === sym);

    if (freshHit) {
      quotes.push(freshHit);
      cacheStatus[sym] = 'fresh';
    } else if (fetched) {
      quotes.push(fetched);
      cacheStatus[sym] = 'fetched';
    } else if (stale) {
      quotes.push(stale);
      cacheStatus[sym] = 'stale';
    }
    // Symbols not found anywhere are silently omitted
  }

  const latencyMs = Date.now() - start;
  const isSingle = symbols.length === 1;

  // A request that resolved zero quotes because the provider rejected us is an
  // upstream failure, not an empty result set. Reporting success:true here is
  // what let a plan-tier 403 masquerade as "no data" in production for months.
  if (quotes.length === 0 && providerFailed) {
    return jsonResponse(
      {
        success: false,
        error: {
          code: deniedStatus ? 'PROVIDER_NOT_ENTITLED' : 'PROVIDER_UNAVAILABLE',
          message: deniedStatus
            ? `Polygon rejected the request (HTTP ${deniedStatus}). The API key or plan tier is not entitled to this data.`
            : 'Upstream market data provider returned no data.',
        },
        meta: { requested: symbols.length, latencyMs, timestamp: new Date().toISOString(), edge: true },
      },
      deniedStatus ? 502 : 503,
    );
  }

  return jsonResponse(
    {
      success: true,
      data: isSingle ? (quotes[0] ?? null) : quotes,
      meta: {
        degraded: providerFailed || undefined,
        count: quotes.length,
        requested: symbols.length,
        cacheStatus,
        latencyMs,
        timestamp: new Date().toISOString(),
        edge: true,
      },
    },
    200,
    {
      // CDN-level cache: 5s fresh, 30s stale-while-revalidate
      'Cache-Control': 's-maxage=5, stale-while-revalidate=30',
    },
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(
  body: unknown,
  status: number,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'X-Edge-Function': 'quotes',
      ...extraHeaders,
    },
  });
}
