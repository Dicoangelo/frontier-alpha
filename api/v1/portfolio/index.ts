import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://rqidgeittsjkpkykmdrz.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const start = Date.now();
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Missing authorization header' },
    });
  }

  const token = authHeader.substring(7);

  try {
    // Verify the user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid token' },
      });
    }

    // Get user's portfolio
    const { data: portfolio, error: portfolioError } = await supabase
      .from('frontier_portfolios')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (portfolioError || !portfolio) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'No portfolio found' },
      });
    }

    // Get positions
    const { data: positions, error: positionsError } = await supabase
      .from('frontier_positions')
      .select('*')
      .eq('portfolio_id', portfolio.id);

    if (positionsError) {
      return res.status(500).json({
        success: false,
        error: { code: 'DB_ERROR', message: positionsError.message },
      });
    }

    // Generate mock quotes for positions
    const positionsWithQuotes = (positions || []).map((pos: any) => {
      const hash = pos.symbol.split('').reduce((a: number, b: string) => a + b.charCodeAt(0), 0);
      const basePrice = 50 + (hash % 450);
      const noise = (Math.random() - 0.5) * 0.02;
      const currentPrice = basePrice * (1 + noise);
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

    // Calculate total value and weights
    const totalPositionValue = positionsWithQuotes.reduce(
      (sum: number, p: any) => sum + p.currentPrice * p.shares,
      0
    );
    const totalValue = totalPositionValue + portfolio.cash_balance;

    positionsWithQuotes.forEach((p: any) => {
      p.weight = (p.currentPrice * p.shares) / totalValue;
    });

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
      meta: {
        timestamp: new Date().toISOString(),
        requestId: `req-${Math.random().toString(36).slice(2, 8)}`,
        latencyMs: Date.now() - start,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message },
    });
  }
}
