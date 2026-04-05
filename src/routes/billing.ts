/**
 * Billing routes — Stripe checkout, portal, subscription, webhook.
 *
 * Ported from the hand-written Vercel functions in `api/v1/billing/*` to unify
 * on the single Fastify surface exposed via `buildApp()`.
 *
 * The Stripe webhook requires the raw request body for signature verification,
 * so it is mounted inside an encapsulated Fastify child context that overrides
 * the JSON content-type parser to return a Buffer. The other three endpoints
 * use normal JSON parsing on the parent instance.
 */

import type { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import { supabaseAdmin } from '../lib/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { logger } from '../observability/logger.js';
import type { APIResponse } from '../types/index.js';

interface RouteContext {
  server: unknown;
}

interface CheckoutBody {
  priceId?: string;
  successUrl?: string;
  cancelUrl?: string;
}

function getStripe(): Stripe {
  return new Stripe(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2026-01-28.clover' as Stripe.LatestApiVersion,
  });
}

function getPlanFromPriceId(priceId: string): 'pro' | 'enterprise' {
  if (priceId === process.env.STRIPE_ENTERPRISE_PRICE_ID) return 'enterprise';
  return 'pro';
}

export async function billingRoutes(fastify: FastifyInstance, _opts: RouteContext) {
  // POST /api/v1/billing/checkout — create Stripe Checkout Session
  fastify.post<{ Body: CheckoutBody; Reply: APIResponse<unknown> }>(
    '/api/v1/billing/checkout',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const start = Date.now();
      const user = request.user!;
      const { priceId, successUrl, cancelUrl } = request.body || {};

      if (!priceId) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'priceId is required' },
        });
      }

      try {
        const stripe = getStripe();

        const { data: sub } = await supabaseAdmin
          .from('frontier_subscriptions')
          .select('stripe_customer_id')
          .eq('user_id', user.id)
          .single();

        let customerId = (sub as { stripe_customer_id?: string } | null)?.stripe_customer_id;

        if (!customerId) {
          const customer = await stripe.customers.create({
            email: user.email || '',
            metadata: { userId: user.id },
          });
          customerId = customer.id;

          await supabaseAdmin
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

        return {
          success: true,
          data: { url: session.url },
          meta: { timestamp: new Date(), requestId: request.id, latencyMs: Date.now() - start },
        };
      } catch (error) {
        logger.error({ err: error }, 'Billing checkout error');
        return reply.status(500).send({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : 'Internal server error',
          },
        });
      }
    }
  );

  // POST /api/v1/billing/portal — create Stripe Customer Portal session
  fastify.post<{ Reply: APIResponse<unknown> }>(
    '/api/v1/billing/portal',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const start = Date.now();
      const user = request.user!;

      try {
        const { data: sub } = await supabaseAdmin
          .from('frontier_subscriptions')
          .select('stripe_customer_id')
          .eq('user_id', user.id)
          .single();

        const customerId = (sub as { stripe_customer_id?: string } | null)?.stripe_customer_id;
        if (!customerId) {
          return reply.status(400).send({
            success: false,
            error: { code: 'NO_CUSTOMER', message: 'No billing account found. Subscribe to a plan first.' },
          });
        }

        const stripe = getStripe();
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

        const session = await stripe.billingPortal.sessions.create({
          customer: customerId,
          return_url: `${frontendUrl}/settings`,
        });

        return {
          success: true,
          data: { url: session.url },
          meta: { timestamp: new Date(), requestId: request.id, latencyMs: Date.now() - start },
        };
      } catch (error) {
        logger.error({ err: error }, 'Billing portal error');
        return reply.status(500).send({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : 'Internal server error',
          },
        });
      }
    }
  );

  // GET /api/v1/billing/subscription — fetch current user subscription
  fastify.get<{ Reply: APIResponse<unknown> }>(
    '/api/v1/billing/subscription',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const start = Date.now();
      const user = request.user!;

      try {
        const { data: sub } = await supabaseAdmin
          .from('frontier_subscriptions')
          .select('plan, status, current_period_end, created_at')
          .eq('user_id', user.id)
          .single();

        return {
          success: true,
          data: sub || { plan: 'free', status: 'active', current_period_end: null, created_at: null },
          meta: { timestamp: new Date(), requestId: request.id, latencyMs: Date.now() - start },
        };
      } catch (error) {
        logger.error({ err: error }, 'Billing subscription fetch error');
        return reply.status(500).send({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : 'Internal server error',
          },
        });
      }
    }
  );

  // POST /api/v1/billing/webhook — Stripe webhook with signature verification
  //
  // Mounted inside an encapsulated child plugin so we can override the JSON
  // content-type parser to return the raw Buffer (needed by stripe.webhooks
  // .constructEvent). The parent instance's parser is untouched.
  await fastify.register(async (instance) => {
    instance.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer' },
      (_req, body, done) => {
        done(null, body);
      }
    );

    instance.post('/api/v1/billing/webhook', async (request, reply) => {
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
      const signature = request.headers['stripe-signature'];
      if (!signature || Array.isArray(signature)) {
        return reply.status(400).send({
          success: false,
          error: { code: 'WEBHOOK_SIGNATURE_MISSING', message: 'Missing stripe-signature header' },
        });
      }

      const rawBody = request.body as Buffer;
      const stripe = getStripe();

      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
      } catch (err) {
        logger.error({ err }, 'Stripe webhook signature verification failed');
        return reply.status(400).send({
          success: false,
          error: { code: 'WEBHOOK_SIGNATURE_FAILED', message: 'Invalid signature' },
        });
      }

      try {
        switch (event.type) {
          case 'checkout.session.completed': {
            const session = event.data.object as Stripe.Checkout.Session;
            const userId = session.metadata?.userId;
            if (!userId || !session.subscription) break;

            const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
            const priceId = subscription.items.data[0]?.price?.id || '';
            const plan = getPlanFromPriceId(priceId);

            await supabaseAdmin
              .from('frontier_subscriptions')
              .upsert(
                {
                  user_id: userId,
                  stripe_customer_id: session.customer as string,
                  stripe_subscription_id: subscription.id,
                  plan,
                  status: 'active',
                  current_period_end: new Date(
                    (subscription as unknown as { current_period_end: number }).current_period_end * 1000
                  ).toISOString(),
                },
                { onConflict: 'user_id' }
              );
            break;
          }

          case 'customer.subscription.updated': {
            const subscription = event.data.object as Stripe.Subscription;
            const customerId = subscription.customer as string;
            const priceId = subscription.items.data[0]?.price?.id || '';
            const plan = getPlanFromPriceId(priceId);

            const status = subscription.cancel_at_period_end
              ? 'canceled'
              : subscription.status === 'active'
                ? 'active'
                : subscription.status === 'past_due'
                  ? 'past_due'
                  : subscription.status === 'trialing'
                    ? 'trialing'
                    : 'active';

            await supabaseAdmin
              .from('frontier_subscriptions')
              .update({
                plan,
                status,
                stripe_subscription_id: subscription.id,
                current_period_end: new Date(
                  (subscription as unknown as { current_period_end: number }).current_period_end * 1000
                ).toISOString(),
              })
              .eq('stripe_customer_id', customerId);
            break;
          }

          case 'customer.subscription.deleted': {
            const subscription = event.data.object as Stripe.Subscription;
            const customerId = subscription.customer as string;

            await supabaseAdmin
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

            await supabaseAdmin
              .from('frontier_subscriptions')
              .update({ status: 'past_due' })
              .eq('stripe_customer_id', customerId);
            break;
          }

          default:
            break;
        }

        return reply.status(200).send({ received: true });
      } catch (error) {
        logger.error({ err: error, eventType: event.type }, 'Stripe webhook handler error');
        return reply.status(500).send({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : 'Internal server error',
          },
        });
      }
    });
  });
}
