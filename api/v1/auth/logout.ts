import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Get Supabase admin client - uses service key for admin operations
function getSupabaseAdminClient(): { client: ReturnType<typeof createClient> | null; error?: string } {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    return { client: null, error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables' };
  }

  // Validate URL looks like a Supabase URL
  if (!url.includes('supabase.co') && !url.includes('supabase.in')) {
    return { client: null, error: `Invalid SUPABASE_URL format: ${url.substring(0, 30)}...` };
  }

  // Validate key looks like a JWT (starts with eyJ)
  if (!key.startsWith('eyJ')) {
    return { client: null, error: 'Invalid SUPABASE_SERVICE_KEY format (should be a JWT)' };
  }

  return { client: createClient(url, key) };
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
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Missing authorization header' },
        meta: { requestId },
      });
    }

    const token = authHeader.substring(7);

    // Get Supabase admin client (lazy initialization)
    const { client: supabase, error: configError } = getSupabaseAdminClient();

    // Check if Supabase is configured
    if (!supabase) {
      return res.status(503).json({
        success: false,
        error: { code: 'SERVICE_UNAVAILABLE', message: configError || 'Authentication service not configured.' },
        meta: { requestId },
      });
    }

    // Verify the token and get user
    const { data: { user }, error: verifyError } = await supabase.auth.getUser(token);

    if (verifyError || !user) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' },
        meta: { requestId },
      });
    }

    // Sign out the user (invalidates all sessions for this user)
    // Note: Supabase doesn't have a direct "invalidate specific token" API
    // The client should discard the token; server-side we can optionally
    // sign out all sessions using admin API
    const { error: signOutError } = await supabase.auth.admin.signOut(token);

    if (signOutError) {
      // Log but don't fail - token might already be invalid
      console.warn('[Auth] Sign out warning:', signOutError.message);
    }

    return res.status(200).json({
      success: true,
      data: {
        message: 'Successfully logged out',
        userId: user.id,
      },
      meta: { requestId },
    });
  } catch (error) {
    console.error('[Auth] Logout error:', error);
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
