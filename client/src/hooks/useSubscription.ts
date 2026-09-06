import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';

type Feature = 'optimizer' | 'backtest' | 'options' | 'ml' | 'tax' | 'apiAccess';
export type Plan = 'free' | 'pro' | 'enterprise';
export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'trialing';

const FEATURE_REQUIREMENTS: Record<Feature, 'pro' | 'enterprise'> = {
  optimizer: 'pro',
  backtest: 'pro',
  options: 'pro',
  ml: 'enterprise',
  tax: 'enterprise',
  apiAccess: 'enterprise',
};

const PLAN_HIERARCHY: Record<Plan, number> = {
  free: 0,
  pro: 1,
  enterprise: 2,
};

/**
 * useSubscription — single source of truth for the user's current plan/status.
 *
 * Reads from `authStore.subscription` (populated by `fetchSubscription()` which
 * hits `/api/v1/billing/subscription`). Defaults gracefully:
 *   - Unauthenticated user → free / active
 *   - Authenticated but subscription not yet fetched → triggers a fetch and
 *     reports `isLoading: true` so callers can avoid a flash-of-locked.
 *
 * Returned helpers:
 *   - `canAccess(feature)` — feature-keyed gate (legacy)
 *   - `meetsPlan(requiredPlan)` — direct plan-tier gate (new, used by UpgradeGate)
 */
/**
 * Pure decision: may a plan-gated query fire right now?
 *
 * Every Pro/Enterprise endpoint sits behind `requirePlan` on the server, so a
 * free-plan account that fires the query gets a 403 — logged as a console
 * error and rendered as "Couldn't load · Retry" instead of the upgrade prompt.
 * Anonymous visitors get 401s the same way. Gate BEFORE fetching: auth must be
 * hydrated, a token must exist, the subscription must be resolved, and the
 * plan must meet the requirement.
 */
export function planGateEnabled(input: {
  isReady: boolean;
  hasToken: boolean;
  subscriptionLoading: boolean;
  plan: Plan;
  status: SubscriptionStatus;
  required: 'pro' | 'enterprise';
}): boolean {
  if (!input.isReady || !input.hasToken) return false;
  if (input.subscriptionLoading) return false;
  if (input.status === 'canceled') return false;
  return PLAN_HIERARCHY[input.plan] >= PLAN_HIERARCHY[input.required];
}

/** Auth hydrated and a bearer token present (US-003). */
export function useAuthReady(): boolean {
  const isReady = useAuthStore((state) => state.isReady);
  const session = useAuthStore((state) => state.session);
  return isReady && !!session?.access_token;
}

/** `enabled` for any query whose endpoint requires `requiredPlan`. */
export function usePlanGate(required: 'pro' | 'enterprise'): boolean {
  const isReady = useAuthStore((state) => state.isReady);
  const session = useAuthStore((state) => state.session);
  const { plan, status, isLoading } = useSubscription();
  return planGateEnabled({
    isReady,
    hasToken: !!session?.access_token,
    subscriptionLoading: isLoading,
    plan,
    status,
    required,
  });
}

export function useSubscription() {
  const subscription = useAuthStore((state) => state.subscription);
  const user = useAuthStore((state) => state.user);
  const fetchSubscription = useAuthStore((state) => state.fetchSubscription);

  // If the user is logged in but we haven't fetched their subscription yet,
  // kick off a fetch. fetchSubscription is idempotent and self-guarding.
  useEffect(() => {
    if (user && !subscription) {
      void fetchSubscription();
    }
  }, [user, subscription, fetchSubscription]);

  const plan: Plan = subscription?.plan ?? 'free';
  const status: SubscriptionStatus = subscription?.status ?? 'active';
  const isLoading = Boolean(user) && subscription === null;
  const isPro = PLAN_HIERARCHY[plan] >= PLAN_HIERARCHY.pro;
  const isEnterprise = PLAN_HIERARCHY[plan] >= PLAN_HIERARCHY.enterprise;
  const isFree = plan === 'free';

  function canAccess(feature: Feature): boolean {
    if (status === 'canceled') return false;
    const required = FEATURE_REQUIREMENTS[feature];
    return PLAN_HIERARCHY[plan] >= PLAN_HIERARCHY[required];
  }

  function meetsPlan(requiredPlan: 'pro' | 'enterprise'): boolean {
    if (status === 'canceled') return false;
    return PLAN_HIERARCHY[plan] >= PLAN_HIERARCHY[requiredPlan];
  }

  return {
    plan,
    status,
    isLoading,
    isPro,
    isEnterprise,
    isFree,
    canAccess,
    meetsPlan,
  };
}
