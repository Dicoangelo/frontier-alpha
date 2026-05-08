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
