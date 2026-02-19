import { FastifyRequest, FastifyReply } from 'fastify';
import { supabaseAdmin } from '../lib/supabase.js';

interface SubscriptionInfo {
  plan: 'free' | 'pro' | 'enterprise';
  status: 'active' | 'past_due' | 'canceled' | 'trialing';
}

declare module 'fastify' {
  interface FastifyRequest {
    subscription?: SubscriptionInfo;
  }
}

const PLAN_HIERARCHY: Record<string, number> = {
  free: 0,
  pro: 1,
  enterprise: 2,
};

/**
 * Loads the user's subscription and decorates request.subscription.
 * Must run after authMiddleware (requires request.user).
 */
export async function subscriptionGate(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  if (!request.user) {
    request.subscription = { plan: 'free', status: 'active' };
    return;
  }

  const { data } = await supabaseAdmin
    .from('frontier_subscriptions')
    .select('plan, status')
    .eq('user_id', request.user.id)
    .single();

  request.subscription = data
    ? { plan: data.plan, status: data.status }
    : { plan: 'free', status: 'active' };
}

/**
 * Factory that returns a Fastify preHandler requiring a minimum plan.
 * Use after subscriptionGate to enforce plan-level access.
 *
 * Usage:
 *   server.get('/pro-feature', { preHandler: [authMiddleware, subscriptionGate, requirePlan('pro')] }, handler)
 */
export function requirePlan(minPlan: 'pro' | 'enterprise') {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const sub = request.subscription;

    if (!sub || sub.status === 'canceled') {
      return reply.status(403).send({
        success: false,
        error: {
          code: 'SUBSCRIPTION_REQUIRED',
          message: 'An active subscription is required to access this feature.',
          upgrade_url: '/pricing',
        },
      });
    }

    const userLevel = PLAN_HIERARCHY[sub.plan] ?? 0;
    const requiredLevel = PLAN_HIERARCHY[minPlan] ?? 1;

    if (userLevel < requiredLevel) {
      return reply.status(403).send({
        success: false,
        error: {
          code: 'PLAN_UPGRADE_REQUIRED',
          message: `This feature requires the ${minPlan} plan or higher. You are on the ${sub.plan} plan.`,
          upgrade_url: '/pricing',
          current_plan: sub.plan,
          required_plan: minPlan,
        },
      });
    }
  };
}
