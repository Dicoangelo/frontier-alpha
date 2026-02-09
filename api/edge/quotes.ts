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

interface PolygonSnapshotTicker {
  ticker: string;
  todaysChange: number;
  todaysChangePerc: number;
  day: {
    o: number;
    h: number;
    l: number;
    c: number;
    v: number;
    vw: number;
  };
  lastTrade?: {
    p: number;
    t: number;
  };
  prevDay?: {
    c: number;
    v: number;
  };
  updated: number;
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

async function fetchFromPolygon(
  symbols: string[],
  apiKey: string,
): Promise<Map<string, QuoteResult>> {
  const results = new Map<string, QuoteResult>();

  // Polygon Snapshot endpoint supports multiple tickers via comma-separated
  // GET /v2/snapshot/locale/us/markets/stocks/tickers?tickers=AAPL,MSFT
  const tickerParam = symbols.join(',');
  const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${tickerParam}&apiKey=${apiKey}`;

  const response = await fetch(url, {
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    // If Polygon returns an error, return whatever we can
    console.error(`Polygon API error: ${response.status} ${response.statusText}`);
    return results;
  }

  const json = await response.json() as {
    status: string;
    tickers?: PolygonSnapshotTicker[];
  };

  if (json.tickers) {
    for (const t of json.tickers) {
      const price = t.lastTrade?.p ?? t.day?.c ?? 0;
      const quote: QuoteResult = {
        symbol: t.ticker,
        price,
        change: t.todaysChange ?? 0,
        changePercent: t.todaysChangePerc ?? 0,
        volume: t.day?.v ?? 0,
        timestamp: t.updated
          ? new Date(t.updated / 1e6).toISOString() // Polygon timestamps are in nanoseconds
          : new Date().toISOString(),
      };
      results.set(t.ticker, quote);
    }
  }

  return results;
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

  if (needsFetch.length > 0 && apiKey) {
    try {
      fetchedQuotes = await fetchFromPolygon(needsFetch, apiKey);

      // Update cache
      const fetchTime = Date.now();
      for (const [sym, quote] of fetchedQuotes) {
        quoteCache.set(sym, { data: quote, fetchedAt: fetchTime });
      }
    } catch (err) {
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

  return jsonResponse(
    {
      success: true,
      data: isSingle ? (quotes[0] ?? null) : quotes,
      meta: {
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
