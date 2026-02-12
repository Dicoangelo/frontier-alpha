import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '../../../lib/auth.js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const start = Date.now();
  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Share ID is required' },
    });
  }

  // Require authentication
  const user = await requireAuth(req, res);
  if (!user) {
    return; // requireAuth already sent 401 response
  }

  try {

    // DELETE - Revoke a share
    if (req.method === 'DELETE') {
      // Get the share and verify ownership
      const { data: share, error: shareError } = await supabase
        .from('frontier_portfolio_shares')
        .select(`
          id,
          portfolio_id,
          frontier_portfolios!inner (
            user_id
          )
        `)
        .eq('id', id)
        .single();

      if (shareError || !share) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Share not found' },
        });
      }

      // Verify user owns the portfolio
      if ((share as any).frontier_portfolios?.user_id !== user.id) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'You do not have permission to revoke this share' },
        });
      }

      // Delete the share
      const { error: deleteError } = await supabase
        .from('frontier_portfolio_shares')
        .delete()
        .eq('id', id);

      if (deleteError) {
        console.error('Share deletion error:', deleteError);
        return res.status(500).json({
          success: false,
          error: { code: 'DB_ERROR', message: 'Failed to revoke share' },
        });
      }

      return res.status(200).json({
        success: true,
        data: { id, revoked: true },
        meta: {
          timestamp: new Date().toISOString(),
          latencyMs: Date.now() - start,
        },
      });
    }

    // GET - Get share details
    if (req.method === 'GET') {
      const { data: share, error: shareError } = await supabase
        .from('frontier_portfolio_shares')
        .select(`
          id,
          portfolio_id,
          share_token,
          permissions,
          shared_with_email,
          created_at,
          expires_at,
          access_count,
          accessed_at,
          frontier_portfolios!inner (
            id,
            name,
            user_id
          )
        `)
        .eq('id', id)
        .single();

      if (shareError || !share) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Share not found' },
        });
      }

      // Verify user owns the portfolio
      if ((share as any).frontier_portfolios?.user_id !== user.id) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'You do not have permission to view this share' },
        });
      }

      const baseUrl = process.env.FRONTEND_URL || 'https://frontier-alpha.vercel.app';

      return res.status(200).json({
        success: true,
        data: {
          id: share.id,
          portfolioId: share.portfolio_id,
          portfolioName: (share as any).frontier_portfolios?.name || 'Unknown',
          shareUrl: `${baseUrl}/shared/${share.share_token}`,
          permissions: share.permissions,
          sharedWithEmail: share.shared_with_email,
          createdAt: share.created_at,
          expiresAt: share.expires_at,
          accessCount: share.access_count,
          lastAccessed: share.accessed_at,
          isExpired: share.expires_at ? new Date(share.expires_at) < new Date() : false,
        },
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
    console.error('Portfolio share error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message },
    });
  }
}
