import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2026-01-28.clover',
});

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');

  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Only POST requests allowed' },
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

    const { priceId, successUrl, cancelUrl } = req.body as {
      priceId: string;
      successUrl?: string;
      cancelUrl?: string;
    };

    if (!priceId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'priceId is required' },
        meta: { requestId },
      });
    }

    // Get or create Stripe customer
    const { data: sub } = await supabase
      .from('frontier_subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .single();

    let customerId = sub?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email || '',
        metadata: { userId: user.id },
      });
      customerId = customer.id;

      await supabase
        .from('frontier_subscriptions')
        .update({ stripe_customer_id: customerId })
        .eq('user_id', user.id);
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl || `${frontendUrl}/settings?checkout=success`,
      cancel_url: cancelUrl || `${frontendUrl}/pricing?checkout=canceled`,
      metadata: { userId: user.id },
    });

    return res.status(200).json({
      success: true,
      data: { url: session.url },
      meta: { requestId },
    });
  } catch (error) {
    console.error('[Billing] Checkout error:', error);
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
