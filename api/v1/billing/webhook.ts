import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2026-01-28.clover',
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// Map Stripe price IDs to plan names
function getPlanFromPriceId(priceId: string): 'pro' | 'enterprise' {
  if (priceId === process.env.STRIPE_ENTERPRISE_PRICE_ID) return 'enterprise';
  return 'pro';
}

export const config = {
  api: {
    bodyParser: false, // Raw body needed for Stripe signature verification
  },
};

async function getRawBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Only POST requests allowed' },
    });
  }

  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return res.status(503).json({
        success: false,
        error: { code: 'SERVICE_UNAVAILABLE', message: 'Service not configured' },
      });
    }

    const rawBody = await getRawBody(req);
    const signature = req.headers['stripe-signature'] as string;

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      console.error('[Webhook] Signature verification failed:', err);
      return res.status(400).json({
        success: false,
        error: { code: 'WEBHOOK_SIGNATURE_FAILED', message: 'Invalid signature' },
      });
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        if (!userId || !session.subscription) break;

        // Retrieve subscription to get price/plan info
        const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
        const priceId = subscription.items.data[0]?.price?.id || '';
        const plan = getPlanFromPriceId(priceId);

        await supabase
          .from('frontier_subscriptions')
          .upsert({
            user_id: userId,
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: subscription.id,
            plan,
            status: 'active',
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          }, { onConflict: 'user_id' });

        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const priceId = subscription.items.data[0]?.price?.id || '';
        const plan = getPlanFromPriceId(priceId);

        const status = subscription.cancel_at_period_end ? 'canceled' : (
          subscription.status === 'active' ? 'active' :
          subscription.status === 'past_due' ? 'past_due' :
          subscription.status === 'trialing' ? 'trialing' : 'active'
        );

        await supabase
          .from('frontier_subscriptions')
          .update({
            plan,
            status,
            stripe_subscription_id: subscription.id,
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          })
          .eq('stripe_customer_id', customerId);

        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        await supabase
          .from('frontier_subscriptions')
          .update({
            status: 'canceled',
            plan: 'free',
            stripe_subscription_id: null,
            current_period_end: null,
          })
          .eq('stripe_customer_id', customerId);

        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        await supabase
          .from('frontier_subscriptions')
          .update({ status: 'past_due' })
          .eq('stripe_customer_id', customerId);

        break;
      }

      default:
        // Unhandled event type
        break;
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('[Webhook] Error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Internal server error',
      },
    });
  }
}
