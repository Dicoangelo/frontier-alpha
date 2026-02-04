/**
 * GET /api/v1/trading/quote
 *
 * Get real-time quote for a symbol from the broker's data feed.
 * Supports single symbol or multiple symbols (comma-separated).
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

// Demo prices for simulation
const demoPrices: Record<string, number> = {
  AAPL: 175.5,
  MSFT: 378.25,
  GOOGL: 140.8,
  NVDA: 495.2,
  TSLA: 245.6,
  AMZN: 178.9,
  META: 485.3,
  SPY: 478.5,
  QQQ: 405.75,
  IWM: 198.3,
  DIA: 385.6,
  VTI: 238.4,
  VOO: 440.2,
  BRK_B: 362.5,
  JPM: 185.4,
  V: 275.8,
  JNJ: 158.9,
  UNH: 525.3,
  HD: 345.2,
  PG: 148.6,
  MA: 425.8,
  COST: 685.4,
  WMT: 165.2,
  KO: 58.75,
  PEP: 172.3,
  MRK: 105.8,
  ABBV: 168.5,
  LLY: 625.4,
  NKE: 108.2,
  DIS: 98.5,
  NFLX: 485.3,
  ADBE: 545.2,
  CRM: 265.8,
  AMD: 145.6,
  INTC: 42.5,
  QCOM: 165.8,
  AVGO: 1125.4,
};

function getDemoQuote(symbol: string) {
  const basePrice = demoPrices[symbol.toUpperCase()] || 100 + Math.random() * 200;
  const spread = basePrice * 0.001; // 0.1% spread
  const change = (Math.random() - 0.5) * basePrice * 0.03; // +/- 1.5% change

  return {
    symbol: symbol.toUpperCase(),
    bid: parseFloat((basePrice - spread).toFixed(2)),
    ask: parseFloat((basePrice + spread).toFixed(2)),
    last: parseFloat(basePrice.toFixed(2)),
    bidSize: Math.floor(100 + Math.random() * 1000),
    askSize: Math.floor(100 + Math.random() * 1000),
    volume: Math.floor(Math.random() * 50000000),
    change: parseFloat(change.toFixed(2)),
    changePercent: parseFloat(((change / basePrice) * 100).toFixed(2)),
    high: parseFloat((basePrice * 1.02).toFixed(2)),
    low: parseFloat((basePrice * 0.98).toFixed(2)),
    open: parseFloat((basePrice - change).toFixed(2)),
    previousClose: parseFloat((basePrice - change).toFixed(2)),
    timestamp: new Date().toISOString(),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
    });
  }

  const requestId = `req-${Math.random().toString(36).slice(2, 8)}`;

  try {
    const { symbols, symbol } = req.query;
    const symbolList = (symbols as string)?.split(',') || (symbol ? [symbol as string] : []);

    if (symbolList.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Symbol(s) required. Use ?symbol=AAPL or ?symbols=AAPL,MSFT',
        meta: { requestId },
      });
    }

    const alpacaKey = process.env.ALPACA_API_KEY;
    const alpacaSecret = process.env.ALPACA_API_SECRET;

    // Check if broker is configured
    if (!alpacaKey || !alpacaSecret) {
      // Return demo quotes
      const quotes: Record<string, any> = {};
      for (const sym of symbolList) {
        quotes[sym.toUpperCase()] = getDemoQuote(sym);
      }

      return res.status(200).json({
        success: true,
        data: {
          quotes,
          source: 'demo',
        },
        meta: { requestId },
      });
    }

    // Fetch from Alpaca Data API
    const { default: axios } = await import('axios');

    try {
      if (symbolList.length === 1) {
        // Single symbol - use latest endpoint
        const response = await axios.get(
          `https://data.alpaca.markets/v2/stocks/${symbolList[0]}/quotes/latest`,
          {
            headers: {
              'APCA-API-KEY-ID': alpacaKey,
              'APCA-API-SECRET-KEY': alpacaSecret,
            },
            timeout: 10000,
          }
        );

        const q = response.data.quote;
        const quote = {
          symbol: symbolList[0].toUpperCase(),
          bid: q.bp,
          ask: q.ap,
          last: (q.bp + q.ap) / 2,
          bidSize: q.bs,
          askSize: q.as,
          timestamp: q.t,
        };

        return res.status(200).json({
          success: true,
          data: {
            quotes: { [symbolList[0].toUpperCase()]: quote },
            source: 'alpaca',
          },
          meta: { requestId },
        });
      } else {
        // Multiple symbols - use batch endpoint
        const symbolString = symbolList.join(',');
        const response = await axios.get(
          `https://data.alpaca.markets/v2/stocks/quotes/latest?symbols=${symbolString}`,
          {
            headers: {
              'APCA-API-KEY-ID': alpacaKey,
              'APCA-API-SECRET-KEY': alpacaSecret,
            },
            timeout: 10000,
          }
        );

        const quotes: Record<string, any> = {};
        for (const [sym, quoteData] of Object.entries(response.data.quotes || {})) {
          const q = quoteData as any;
          quotes[sym.toUpperCase()] = {
            symbol: sym.toUpperCase(),
            bid: q.bp,
            ask: q.ap,
            last: (q.bp + q.ap) / 2,
            bidSize: q.bs,
            askSize: q.as,
            timestamp: q.t,
          };
        }

        return res.status(200).json({
          success: true,
          data: {
            quotes,
            source: 'alpaca',
          },
          meta: { requestId },
        });
      }
    } catch (error: any) {
      console.error('[Trading Quote] Alpaca error:', error.response?.data || error.message);

      // Fall back to demo quotes
      const quotes: Record<string, any> = {};
      for (const sym of symbolList) {
        quotes[sym.toUpperCase()] = getDemoQuote(sym);
      }

      return res.status(200).json({
        success: true,
        data: {
          quotes,
          source: 'demo',
          error: error.response?.data?.message || error.message,
        },
        meta: { requestId },
      });
    }
  } catch (error: any) {
    console.error('[Trading Quote] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
      meta: { requestId },
    });
  }
}
