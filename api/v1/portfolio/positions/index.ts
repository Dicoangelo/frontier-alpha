import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '../../../lib/auth.js';
import { methodNotAllowed, internalError } from '../../../lib/errorHandler.js';
import { validateBody, schemas } from '../../../lib/validation.js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
}

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

  // Require authentication
  const user = await requireAuth(req, res);
  if (!user) {
    return; // requireAuth already sent 401 response
  }

  const start = Date.now();

  try {

    // POST - Add new position
    if (req.method === 'POST') {
      // Validate & parse input with Zod
      const body = validateBody(req, res, schemas.addPosition);
      if (!body) return;

      const { symbol, shares, avgCost } = body;

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

    return methodNotAllowed(res);
  } catch (error) {
    console.error('Portfolio positions error:', error);
    return internalError(res);
  }
}
