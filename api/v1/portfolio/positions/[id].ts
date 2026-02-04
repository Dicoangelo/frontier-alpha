import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://rqidgeittsjkpkykmdrz.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface UpdatePositionRequest {
  shares?: number;
  avgCost?: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const start = Date.now();
  const positionId = req.query.id as string;

  if (!positionId) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Position ID is required' },
    });
  }

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
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (portfolioError || !portfolio) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'No portfolio found' },
      });
    }

    // Verify position belongs to user's portfolio
    const { data: position, error: positionError } = await supabase
      .from('frontier_positions')
      .select('*')
      .eq('id', positionId)
      .eq('portfolio_id', portfolio.id)
      .single();

    if (positionError || !position) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Position not found' },
      });
    }

    // GET - Get single position
    if (req.method === 'GET') {
      return res.status(200).json({
        success: true,
        data: {
          id: position.id,
          symbol: position.symbol,
          shares: position.shares,
          costBasis: position.avg_cost,
        },
        meta: {
          timestamp: new Date().toISOString(),
          latencyMs: Date.now() - start,
        },
      });
    }

    // PUT - Update position
    if (req.method === 'PUT') {
      const { shares, avgCost } = req.body as UpdatePositionRequest;

      const updates: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };

      if (shares !== undefined) {
        if (typeof shares !== 'number' || shares <= 0) {
          return res.status(400).json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'Shares must be a positive number' },
          });
        }
        updates.shares = shares;
      }

      if (avgCost !== undefined) {
        if (typeof avgCost !== 'number' || avgCost <= 0) {
          return res.status(400).json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'Average cost must be a positive number' },
          });
        }
        updates.avg_cost = avgCost;
      }

      const { data: updated, error: updateError } = await supabase
        .from('frontier_positions')
        .update(updates)
        .eq('id', positionId)
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

    // DELETE - Remove position
    if (req.method === 'DELETE') {
      const { error: deleteError } = await supabase
        .from('frontier_positions')
        .delete()
        .eq('id', positionId);

      if (deleteError) throw deleteError;

      return res.status(200).json({
        success: true,
        data: { deleted: true },
        meta: {
          timestamp: new Date().toISOString(),
          latencyMs: Date.now() - start,
        },
      });
    }

    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' },
    });
  } catch (error: any) {
    console.error('Position operation error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message },
    });
  }
}
