import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Get Supabase config - only use if properly configured
function getSupabaseClient(): { client: ReturnType<typeof createClient> | null; error?: string } {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return { client: null, error: 'Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables' };
  }

  // Validate URL looks like a Supabase URL
  if (!url.includes('supabase.co') && !url.includes('supabase.in')) {
    return { client: null, error: `Invalid SUPABASE_URL format: ${url.substring(0, 30)}...` };
  }

  // Validate key looks like a JWT (starts with eyJ)
  if (!key.startsWith('eyJ')) {
    return { client: null, error: 'Invalid SUPABASE_ANON_KEY format (should be a JWT)' };
  }

  return { client: createClient(url, key) };
}

interface RefreshRequest {
  refreshToken: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Only POST requests allowed' },
    });
  }

  const requestId = `req-${Math.random().toString(36).slice(2, 8)}`;

  try {
    const { refreshToken } = req.body as RefreshRequest;

    // Validate input
    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Refresh token is required' },
        meta: { requestId },
      });
    }

    // Get Supabase client (lazy initialization)
    const { client: supabase, error: configError } = getSupabaseClient();

    // Check if Supabase is configured
    if (!supabase) {
      return res.status(503).json({
        success: false,
        error: { code: 'SERVICE_UNAVAILABLE', message: configError || 'Authentication service not configured.' },
        meta: { requestId },
      });
    }

    // Refresh the session
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error) {
      // Token expired or invalid
      if (error.message.includes('expired') || error.message.includes('invalid')) {
        return res.status(401).json({
          success: false,
          error: { code: 'TOKEN_EXPIRED', message: 'Refresh token expired or invalid' },
          meta: { requestId },
        });
      }

      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_ERROR', message: error.message },
        meta: { requestId },
      });
    }

    if (!data.session) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_ERROR', message: 'Failed to refresh session' },
        meta: { requestId },
      });
    }

    // Return new tokens
    return res.status(200).json({
      success: true,
      data: {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at,
        expiresIn: data.session.expires_in,
        user: data.user ? {
          id: data.user.id,
          email: data.user.email,
          name: data.user.user_metadata?.name,
        } : undefined,
      },
      meta: { requestId },
    });
  } catch (error) {
    console.error('[Auth] Refresh error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Internal server error',
      },
      meta: { requestId },
    });
  }
}
