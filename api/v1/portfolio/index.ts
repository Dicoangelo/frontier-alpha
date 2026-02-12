import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '../../lib/auth.js';
import { notFound, internalError } from '../../lib/errorHandler.js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Require authentication
  const user = await requireAuth(req, res);
  if (!user) {
    return; // requireAuth already sent 401 response
  }

  const start = Date.now();

  try {

    // Get user's portfolio
    const { data: portfolio, error: portfolioError } = await supabase
      .from('frontier_portfolios')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (portfolioError || !portfolio) {
      return notFound(res, 'Portfolio');
    }

    // Get positions
    const { data: positions, error: positionsError } = await supabase
      .from('frontier_positions')
      .select('*')
      .eq('portfolio_id', portfolio.id);

    if (positionsError) {
      console.error('Positions fetch error:', positionsError);
      return internalError(res, 'Failed to load portfolio positions');
    }

    // Fetch real quotes for positions
    const symbols = (positions || []).map((p: any) => p.symbol);
    const quotesMap = new Map<string, { price: number; change: number }>();
    let dataSource: 'mock' | 'live' = 'mock';

    if (symbols.length > 0) {
      const polygonApiKey = process.env.POLYGON_API_KEY;
      if (polygonApiKey) {
        try {
          const tickersParam = symbols.join(',');
          const polygonUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${tickersParam}&apiKey=${polygonApiKey}`;
          const polygonResponse = await fetch(polygonUrl);
          if (polygonResponse.ok) {
            const polygonData = await polygonResponse.json();
            if (polygonData.tickers) {
              for (const ticker of polygonData.tickers) {
                quotesMap.set(ticker.ticker, {
                  price: ticker.day?.c || ticker.prevDay?.c || 0,
                  change: ticker.todaysChangePerc || 0,
                });
              }
              if (polygonData.tickers.length > 0) {
                dataSource = 'live';
              }
            }
          }
        } catch (quoteError) {
          console.warn('Failed to fetch Polygon quotes:', quoteError);
        }
      }
    }

    // Build positions with quotes (fallback to deterministic mock if no real quotes)
    let hasMockFallback = false;
    const positionsWithQuotes = (positions || []).map((pos: any) => {
      const quote = quotesMap.get(pos.symbol);
      let currentPrice: number;

      if (quote && quote.price > 0) {
        currentPrice = quote.price;
      } else {
        // Fallback: deterministic price based on symbol hash
        const hash = pos.symbol.split('').reduce((a: number, b: string) => a + b.charCodeAt(0), 0);
        currentPrice = 50 + (hash % 450);
        hasMockFallback = true;
      }

      const unrealizedPnL = (currentPrice - pos.avg_cost) * pos.shares;

      return {
        id: pos.id,
        symbol: pos.symbol,
        shares: pos.shares,
        weight: 0, // Will calculate below
        costBasis: pos.avg_cost,
        currentPrice,
        unrealizedPnL,
      };
    });

    // If any position used mock prices, mark as mock
    if (hasMockFallback) {
      dataSource = 'mock';
    }

    // Calculate total value and weights
    const totalPositionValue = positionsWithQuotes.reduce(
      (sum: number, p: any) => sum + p.currentPrice * p.shares,
      0
    );
    const totalValue = totalPositionValue + portfolio.cash_balance;

    positionsWithQuotes.forEach((p: any) => {
      p.weight = (p.currentPrice * p.shares) / totalValue;
    });

    res.setHeader('X-Data-Source', dataSource);
    return res.status(200).json({
      success: true,
      data: {
        id: portfolio.id,
        name: portfolio.name,
        positions: positionsWithQuotes,
        cash: portfolio.cash_balance,
        totalValue,
        currency: 'USD',
      },
      dataSource,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: `req-${Math.random().toString(36).slice(2, 8)}`,
        latencyMs: Date.now() - start,
      },
    });
  } catch (error) {
    console.error('Portfolio error:', error);
    return internalError(res);
  }
}
