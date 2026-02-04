import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';

const supabaseUrl = process.env.SUPABASE_URL || 'https://rqidgeittsjkpkykmdrz.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface CreateShareRequest {
  portfolioId: string;
  permissions: 'view' | 'edit';
  expiresIn?: number; // Hours until expiration
  shareWithEmail?: string;
}

/**
 * Generate a cryptographically secure share token
 */
function generateShareToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Calculate expiration date based on hours
 */
function calculateExpiresAt(hours?: number): Date | null {
  if (!hours || hours <= 0) return null;
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + hours);
  return expiresAt;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
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

    // POST - Create a new share
    if (req.method === 'POST') {
      const { portfolioId, permissions, expiresIn, shareWithEmail } = req.body as CreateShareRequest;

      // Validate input
      if (!portfolioId) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Portfolio ID is required' },
        });
      }

      if (!permissions || !['view', 'edit'].includes(permissions)) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Valid permissions (view or edit) are required' },
        });
      }

      // Verify user owns the portfolio
      const { data: portfolio, error: portfolioError } = await supabase
        .from('frontier_portfolios')
        .select('id, user_id, name')
        .eq('id', portfolioId)
        .eq('user_id', user.id)
        .single();

      if (portfolioError || !portfolio) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Portfolio not found or access denied' },
        });
      }

      // Generate share token and expiration
      const shareToken = generateShareToken();
      const expiresAt = calculateExpiresAt(expiresIn);

      // Look up user by email if provided
      let sharedWithUserId: string | null = null;
      if (shareWithEmail) {
        const { data: targetUser } = await supabase
          .from('auth.users')
          .select('id')
          .eq('email', shareWithEmail.toLowerCase())
          .single();

        if (targetUser) {
          sharedWithUserId = targetUser.id;
        }
      }

      // Create the share
      const { data: share, error: shareError } = await supabase
        .from('frontier_portfolio_shares')
        .insert({
          portfolio_id: portfolioId,
          shared_with_user_id: sharedWithUserId,
          share_token: shareToken,
          permissions,
          shared_by_email: user.email,
          shared_with_email: shareWithEmail || null,
          expires_at: expiresAt?.toISOString() || null,
        })
        .select()
        .single();

      if (shareError) {
        console.error('Share creation error:', shareError);
        return res.status(500).json({
          success: false,
          error: { code: 'DB_ERROR', message: 'Failed to create share' },
        });
      }

      // Build share URL
      const baseUrl = process.env.FRONTEND_URL || 'https://frontier-alpha.vercel.app';
      const shareUrl = `${baseUrl}/shared/${shareToken}`;

      return res.status(201).json({
        success: true,
        data: {
          id: share.id,
          shareToken,
          shareUrl,
          permissions,
          expiresAt: share.expires_at,
          sharedWithEmail: shareWithEmail || null,
          createdAt: share.created_at,
        },
        meta: {
          timestamp: new Date().toISOString(),
          latencyMs: Date.now() - start,
        },
      });
    }

    // GET - List all shares for user's portfolios
    if (req.method === 'GET') {
      // Get all portfolios owned by user
      const { data: portfolios, error: portfoliosError } = await supabase
        .from('frontier_portfolios')
        .select('id')
        .eq('user_id', user.id);

      if (portfoliosError) throw portfoliosError;

      const portfolioIds = (portfolios || []).map((p: any) => p.id);

      if (portfolioIds.length === 0) {
        return res.status(200).json({
          success: true,
          data: [],
          meta: {
            timestamp: new Date().toISOString(),
            latencyMs: Date.now() - start,
            count: 0,
          },
        });
      }

      // Get all shares for these portfolios
      const { data: shares, error: sharesError } = await supabase
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
            name
          )
        `)
        .in('portfolio_id', portfolioIds)
        .order('created_at', { ascending: false });

      if (sharesError) throw sharesError;

      const baseUrl = process.env.FRONTEND_URL || 'https://frontier-alpha.vercel.app';

      const formattedShares = (shares || []).map((share: any) => ({
        id: share.id,
        portfolioId: share.portfolio_id,
        portfolioName: share.frontier_portfolios?.name || 'Unknown',
        shareUrl: `${baseUrl}/shared/${share.share_token}`,
        permissions: share.permissions,
        sharedWithEmail: share.shared_with_email,
        createdAt: share.created_at,
        expiresAt: share.expires_at,
        accessCount: share.access_count,
        lastAccessed: share.accessed_at,
        isExpired: share.expires_at ? new Date(share.expires_at) < new Date() : false,
      }));

      return res.status(200).json({
        success: true,
        data: formattedShares,
        meta: {
          timestamp: new Date().toISOString(),
          latencyMs: Date.now() - start,
          count: formattedShares.length,
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
