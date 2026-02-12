import type { VercelRequest, VercelResponse } from '@vercel/node';
import { badRequest } from '../../lib/errorHandler.js';

interface Quote {
  symbol: string;
  last: number;
  bid: number;
  ask: number;
  volume: number;
  timestamp: number;
  change: number;
  changePercent: number;
}

// In-memory cache for latest quotes (shared across requests)
const quoteCache = new Map<string, Quote>();

// Fetch real-time quotes from Polygon.io REST API
async function fetchPolygonQuotes(symbols: string[], apiKey: string): Promise<{ quotes: Quote[]; error?: string }> {
  const quotes: Quote[] = [];

  // Use Polygon's snapshot endpoint for multiple symbols
  const tickersParam = symbols.join(',');
  const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${tickersParam}&apiKey=${apiKey}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorMsg = `Polygon API error: ${response.status} ${response.statusText}`;
      console.error(errorMsg);
      return { quotes: [], error: errorMsg };
    }

    const data = await response.json();

    if (data.tickers) {
      for (const ticker of data.tickers) {
        const quote: Quote = {
          symbol: ticker.ticker,
          last: ticker.day?.c || ticker.prevDay?.c || 0,
          bid: ticker.min?.o || ticker.day?.o || 0,
          ask: ticker.day?.c || 0,
          volume: ticker.day?.v || 0,
          timestamp: Date.now(),
          change: ticker.todaysChange || 0,
          changePercent: ticker.todaysChangePerc || 0,
        };
        quotes.push(quote);
        quoteCache.set(quote.symbol, quote);
      }
    }

    return { quotes };
  } catch (error: any) {
    const errorMsg = error.name === 'AbortError'
      ? 'Polygon API request timed out'
      : `Failed to fetch Polygon quotes: ${error.message}`;
    console.error(errorMsg);
    return { quotes: [], error: errorMsg };
  }
}

// Generate simulated quote updates for demo/development
function generateMockQuote(symbol: string, basePrice?: number): Quote {
  const cached = quoteCache.get(symbol);
  const last = cached?.last || basePrice || 100 + Math.random() * 400;
  const change = (Math.random() - 0.5) * 2;
  const newLast = last + change;

  const quote: Quote = {
    symbol,
    last: parseFloat(newLast.toFixed(2)),
    bid: parseFloat((newLast - 0.01).toFixed(2)),
    ask: parseFloat((newLast + 0.01).toFixed(2)),
    volume: Math.floor(Math.random() * 1000000),
    timestamp: Date.now(),
    change: parseFloat(change.toFixed(2)),
    changePercent: parseFloat(((change / last) * 100).toFixed(2)),
  };

  quoteCache.set(symbol, quote);
  return quote;
}

// Base prices for common symbols
const BASE_PRICES: Record<string, number> = {
  NVDA: 520,
  AAPL: 195,
  MSFT: 415,
  GOOGL: 165,
  AMZN: 205,
  META: 510,
  TSLA: 245,
  JPM: 195,
  V: 275,
  JNJ: 155,
  UNH: 520,
  BAC: 35,
  PFE: 28,
  MRK: 125,
  AMD: 165,
  NFLX: 620,
  GS: 375,
  ABBV: 175,
  CRM: 290,
  ORCL: 140,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Parse symbols from query
  const symbolsParam = req.query.symbols as string | undefined;
  if (!symbolsParam) {
    return badRequest(res, 'symbols parameter required');
  }

  const symbols = symbolsParam.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  if (symbols.length === 0) {
    return badRequest(res, 'No valid symbols provided');
  }

  if (symbols.length > 50) {
    return badRequest(res, 'Maximum 50 symbols allowed');
  }

  // Check for SSE mode
  const sse = req.query.sse === 'true';

  if (sse) {
    // Server-Sent Events mode for real-time streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const apiKey = process.env.POLYGON_API_KEY;
    const isProduction = process.env.NODE_ENV === 'production';

    // Send initial quotes
    let quotes: Quote[] = [];
    let dataSource: 'mock' | 'live' = 'mock';
    if (apiKey && isProduction) {
      const result = await fetchPolygonQuotes(symbols, apiKey);
      quotes = result.quotes;
      if (quotes.length > 0) {
        dataSource = 'live';
      }
    }

    // Fill in any missing with mock data
    const liveSymbols = new Set(quotes.map(q => q.symbol));
    for (const symbol of symbols) {
      if (!liveSymbols.has(symbol)) {
        quotes.push(generateMockQuote(symbol, BASE_PRICES[symbol]));
        if (dataSource === 'live') dataSource = 'mock'; // mixed means mock
      }
    }

    res.setHeader('X-Data-Source', dataSource);

    // Send initial data
    res.write(`data: ${JSON.stringify({ type: 'quotes', data: quotes, dataSource })}\n\n`);

    // Set up periodic updates (every 2 seconds for 30 seconds max)
    let count = 0;
    const maxUpdates = 15;

    const interval = setInterval(async () => {
      count++;

      if (count >= maxUpdates) {
        clearInterval(interval);
        res.write(`data: ${JSON.stringify({ type: 'complete' })}\n\n`);
        res.end();
        return;
      }

      // Fetch updated quotes
      let updatedQuotes: Quote[] = [];
      let updateSource: 'mock' | 'live' = 'mock';
      if (apiKey && isProduction) {
        const result = await fetchPolygonQuotes(symbols, apiKey);
        updatedQuotes = result.quotes;
        if (updatedQuotes.length > 0) {
          updateSource = 'live';
        }
      }

      // Fill in with mock updates for development
      const updatedLiveSymbols = new Set(updatedQuotes.map(q => q.symbol));
      for (const symbol of symbols) {
        if (!updatedLiveSymbols.has(symbol)) {
          updatedQuotes.push(generateMockQuote(symbol, BASE_PRICES[symbol]));
          if (updateSource === 'live') updateSource = 'mock';
        }
      }

      res.write(`data: ${JSON.stringify({ type: 'quotes', data: updatedQuotes, dataSource: updateSource })}\n\n`);
    }, 2000);

    // Clean up on client disconnect
    req.on('close', () => {
      clearInterval(interval);
    });

    return;
  }

  // Regular REST mode - single snapshot
  const apiKey = process.env.POLYGON_API_KEY;
  const isProduction = process.env.NODE_ENV === 'production';

  let quotes: Quote[] = [];
  let dataSource: 'mock' | 'live' = 'mock';

  if (apiKey && isProduction) {
    const result = await fetchPolygonQuotes(symbols, apiKey);
    quotes = result.quotes;
    if (quotes.length > 0) {
      dataSource = 'live';
    }
  }

  // Fill in any missing symbols with mock data
  const restLiveSymbols = new Set(quotes.map(q => q.symbol));
  for (const symbol of symbols) {
    if (!restLiveSymbols.has(symbol)) {
      quotes.push(generateMockQuote(symbol, BASE_PRICES[symbol]));
      if (dataSource === 'live') dataSource = 'mock';
    }
  }

  res.setHeader('X-Data-Source', dataSource);
  return res.status(200).json({
    success: true,
    data: quotes,
    dataSource,
    meta: {
      timestamp: new Date().toISOString(),
      count: quotes.length,
    },
  });
}
