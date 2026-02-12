import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '../../../lib/auth.js';
import { validationError, notFound, methodNotAllowed, internalError } from '../../../lib/errorHandler.js';
import * as crypto from 'crypto';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
}

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

  // Require authentication
  const user = await requireAuth(req, res);
  if (!user) {
    return; // requireAuth already sent 401 response
  }

  const start = Date.now();

  try {

    // POST - Create a new share
    if (req.method === 'POST') {
      const { portfolioId, permissions, expiresIn, shareWithEmail } = req.body as CreateShareRequest;

      // Validate input
      if (!portfolioId) {
        return validationError(res, 'Portfolio ID is required', { portfolioId: 'Required' });
      }

      if (!permissions || !['view', 'edit'].includes(permissions)) {
        return validationError(res, 'Valid permissions (view or edit) are required', { permissions: 'Must be "view" or "edit"' });
      }

      // Verify user owns the portfolio
      const { data: portfolio, error: portfolioError } = await supabase
        .from('frontier_portfolios')
        .select('id, user_id, name')
        .eq('id', portfolioId)
        .eq('user_id', user.id)
        .single();

      if (portfolioError || !portfolio) {
        return notFound(res, 'Portfolio');
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
        return internalError(res, 'Failed to create share');
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

    return methodNotAllowed(res);
  } catch (error) {
    console.error('Portfolio share error:', error);
    return internalError(res);
  }
}
