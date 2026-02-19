import Stripe from 'stripe';
import { supabaseAdmin } from './supabase.js';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY must be set in environment variables');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2026-01-28.clover',
  typescript: true,
});

// Price IDs (set in Stripe Dashboard, configured via env)
export const PRICE_IDS = {
  pro: process.env.STRIPE_PRO_PRICE_ID || '',
  enterprise: process.env.STRIPE_ENTERPRISE_PRICE_ID || '',
} as const;

export async function createCustomer(email: string, userId: string): Promise<Stripe.Customer> {
  const customer = await stripe.customers.create({
    email,
    metadata: { userId },
  });
  return customer;
}

export async function createCheckoutSession(
  userId: string,
  priceId: string,
  successUrl: string,
  cancelUrl: string
): Promise<Stripe.Checkout.Session> {
  // Get or create Stripe customer
  const { data: sub } = await supabaseAdmin
    .from('frontier_subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .single();

  let customerId = sub?.stripe_customer_id;

  if (!customerId) {
    // Fetch user email from auth
    const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(userId);
    const customer = await createCustomer(user?.email || '', userId);
    customerId = customer.id;

    // Save customer ID
    await supabaseAdmin
      .from('frontier_subscriptions')
      .update({ stripe_customer_id: customerId })
      .eq('user_id', userId);
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { userId },
  });

  return session;
}

export async function createPortalSession(customerId: string): Promise<Stripe.BillingPortal.Session> {
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: process.env.FRONTEND_URL || 'http://localhost:5173/settings',
  });
  return session;
}

export async function getUserSubscription(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('frontier_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return { plan: 'free', status: 'active' };
  }

  return data;
}
