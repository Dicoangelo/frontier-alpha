import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');

  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Only GET requests allowed' },
    });
  }

  const requestId = `req-${Math.random().toString(36).slice(2, 8)}`;

  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return res.status(503).json({
        success: false,
        error: { code: 'SERVICE_UNAVAILABLE', message: 'Service not configured' },
        meta: { requestId },
      });
    }

    // Authenticate via JWT
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        meta: { requestId },
      });
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid token' },
        meta: { requestId },
      });
    }

    // Fetch subscription
    const { data: sub } = await supabase
      .from('frontier_subscriptions')
      .select('plan, status, current_period_end, created_at')
      .eq('user_id', user.id)
      .single();

    return res.status(200).json({
      success: true,
      data: sub || { plan: 'free', status: 'active', current_period_end: null, created_at: null },
      meta: { requestId },
    });
  } catch (error) {
    console.error('[Billing] Subscription fetch error:', error);
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
