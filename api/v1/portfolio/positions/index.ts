import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://rqidgeittsjkpkykmdrz.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface AddPositionRequest {
  symbol: string;
  shares: number;
  avgCost: number;
}

async function getOrCreatePortfolio(userId: string) {
  // Try to get existing portfolio
  let { data: portfolio, error } = await supabase
    .from('frontier_portfolios')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error && error.code === 'PGRST116') {
    // No portfolio found, create one
    const { data: newPortfolio, error: createError } = await supabase
      .from('frontier_portfolios')
      .insert({
        user_id: userId,
        name: 'My Portfolio',
        cash_balance: 10000, // Default starting cash
      })
      .select()
      .single();

    if (createError) throw createError;
    portfolio = newPortfolio;
  } else if (error) {
    throw error;
  }

  return portfolio;
}

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

    // POST - Add new position
    if (req.method === 'POST') {
      const { symbol, shares, avgCost } = req.body as AddPositionRequest;

      // Validate input
      if (!symbol || typeof symbol !== 'string') {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Symbol is required' },
        });
      }

      if (!shares || typeof shares !== 'number' || shares <= 0) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Shares must be a positive number' },
        });
      }

      if (!avgCost || typeof avgCost !== 'number' || avgCost <= 0) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Average cost must be a positive number' },
        });
      }

      // Get or create portfolio
      const portfolio = await getOrCreatePortfolio(user.id);

      // Check if position already exists
      const { data: existingPosition } = await supabase
        .from('frontier_positions')
        .select('*')
        .eq('portfolio_id', portfolio.id)
        .eq('symbol', symbol.toUpperCase())
        .single();

      if (existingPosition) {
        // Update existing position (average in)
        const totalShares = existingPosition.shares + shares;
        const newAvgCost =
          (existingPosition.shares * existingPosition.avg_cost + shares * avgCost) / totalShares;

        const { data: updated, error: updateError } = await supabase
          .from('frontier_positions')
          .update({
            shares: totalShares,
            avg_cost: newAvgCost,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingPosition.id)
          .select()
          .single();

        if (updateError) throw updateError;

        return res.status(200).json({
          success: true,
          data: {
            id: updated.id,
            symbol: updated.symbol,
            shares: updated.shares,
            costBasis: updated.avg_cost,
          },
          meta: {
            timestamp: new Date().toISOString(),
            latencyMs: Date.now() - start,
          },
        });
      }

      // Create new position
      const { data: newPosition, error: insertError } = await supabase
        .from('frontier_positions')
        .insert({
          portfolio_id: portfolio.id,
          symbol: symbol.toUpperCase(),
          shares,
          avg_cost: avgCost,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      return res.status(201).json({
        success: true,
        data: {
          id: newPosition.id,
          symbol: newPosition.symbol,
          shares: newPosition.shares,
          costBasis: newPosition.avg_cost,
        },
        meta: {
          timestamp: new Date().toISOString(),
          latencyMs: Date.now() - start,
        },
      });
    }

    // GET - List all positions
    if (req.method === 'GET') {
      const portfolio = await getOrCreatePortfolio(user.id);

      const { data: positions, error: positionsError } = await supabase
        .from('frontier_positions')
        .select('*')
        .eq('portfolio_id', portfolio.id)
        .order('created_at', { ascending: false });

      if (positionsError) throw positionsError;

      return res.status(200).json({
        success: true,
        data: (positions || []).map((p: any) => ({
          id: p.id,
          symbol: p.symbol,
          shares: p.shares,
          costBasis: p.avg_cost,
        })),
        meta: {
          timestamp: new Date().toISOString(),
          latencyMs: Date.now() - start,
          count: (positions || []).length,
        },
      });
    }

    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' },
    });
  } catch (error: any) {
    console.error('Portfolio positions error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message },
    });
  }
}
