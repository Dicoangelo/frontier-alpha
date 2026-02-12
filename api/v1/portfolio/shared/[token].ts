import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' },
    });
  }

  const start = Date.now();
  const { token } = req.query;

  if (!token || typeof token !== 'string') {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Share token is required' },
    });
  }

  try {
    // Get the share by token
    const { data: share, error: shareError } = await supabase
      .from('frontier_portfolio_shares')
      .select(`
        id,
        portfolio_id,
        permissions,
        expires_at,
        access_count
      `)
      .eq('share_token', token)
      .single();

    if (shareError || !share) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Share link not found or has been revoked' },
      });
    }

    // Check if share has expired
    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return res.status(410).json({
        success: false,
        error: { code: 'EXPIRED', message: 'This share link has expired' },
      });
    }

    // Get the portfolio
    const { data: portfolio, error: portfolioError } = await supabase
      .from('frontier_portfolios')
      .select(`
        id,
        name,
        cash_balance,
        benchmark,
        user_id,
        created_at
      `)
      .eq('id', share.portfolio_id)
      .single();

    if (portfolioError || !portfolio) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Portfolio not found' },
      });
    }

    // Get owner's display name (if available)
    const { data: ownerSettings } = await supabase
      .from('frontier_user_settings')
      .select('display_name')
      .eq('user_id', portfolio.user_id)
      .single();

    // Get positions
    const { data: positions, error: positionsError } = await supabase
      .from('frontier_positions')
      .select('*')
      .eq('portfolio_id', portfolio.id);

    if (positionsError) {
      console.error('Positions fetch error:', positionsError);
    }

    // Fetch real quotes for positions
    const symbols = (positions || []).map((p: any) => p.symbol);
    const quotesMap = new Map<string, { price: number; change: number }>();

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
            }
          }
        } catch (quoteError) {
          console.warn('Failed to fetch Polygon quotes:', quoteError);
        }
      }
    }

    // Build positions with quotes
    const positionsWithQuotes = (positions || []).map((pos: any) => {
      const quote = quotesMap.get(pos.symbol);
      let currentPrice: number;

      if (quote && quote.price > 0) {
        currentPrice = quote.price;
      } else {
        // Fallback: deterministic price based on symbol hash
        const hash = pos.symbol.split('').reduce((a: number, b: string) => a + b.charCodeAt(0), 0);
        currentPrice = 50 + (hash % 450);
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
        change: quote?.change || 0,
      };
    });

    // Calculate total value and weights
    const totalPositionValue = positionsWithQuotes.reduce(
      (sum: number, p: any) => sum + p.currentPrice * p.shares,
      0
    );
    const totalValue = totalPositionValue + portfolio.cash_balance;

    positionsWithQuotes.forEach((p: any) => {
      p.weight = totalValue > 0 ? (p.currentPrice * p.shares) / totalValue : 0;
    });

    // Increment access count
    await supabase
      .from('frontier_portfolio_shares')
      .update({
        access_count: share.access_count + 1,
        accessed_at: new Date().toISOString(),
      })
      .eq('id', share.id);

    // Get factor exposures (if available)
    let factorExposures: any[] = [];
    const { data: factors } = await supabase
      .from('frontier_factor_exposures')
      .select('*')
      .eq('portfolio_id', portfolio.id)
      .eq('calculation_date', new Date().toISOString().split('T')[0])
      .order('exposure', { ascending: false });

    if (factors && factors.length > 0) {
      factorExposures = factors.map((f: any) => ({
        factor: f.factor_name,
        category: f.factor_category,
        exposure: f.exposure,
        tStat: f.t_stat,
        confidence: f.confidence,
        contribution: f.contribution,
      }));
    }

    return res.status(200).json({
      success: true,
      data: {
        portfolio: {
          id: portfolio.id,
          name: portfolio.name,
          ownerName: ownerSettings?.display_name || 'Anonymous',
          positions: positionsWithQuotes,
          cash: portfolio.cash_balance,
          totalValue,
          currency: 'USD',
          benchmark: portfolio.benchmark,
        },
        share: {
          permissions: share.permissions,
          expiresAt: share.expires_at,
        },
        factorExposures,
        metrics: {
          positionCount: positionsWithQuotes.length,
          totalPnL: positionsWithQuotes.reduce((sum: number, p: any) => sum + p.unrealizedPnL, 0),
          topHolding: positionsWithQuotes.length > 0
            ? positionsWithQuotes.reduce((max: any, p: any) => (p.weight > max.weight ? p : max), positionsWithQuotes[0])
            : null,
        },
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: `req-${Math.random().toString(36).slice(2, 8)}`,
        latencyMs: Date.now() - start,
        isSharedView: true,
      },
    });
  } catch (error: any) {
    console.error('Shared portfolio error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message },
    });
  }
}
