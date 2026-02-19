import { useAuthStore } from '@/stores/authStore';

type Feature = 'optimizer' | 'backtest' | 'options' | 'ml' | 'tax' | 'apiAccess';

const FEATURE_REQUIREMENTS: Record<Feature, 'pro' | 'enterprise'> = {
  optimizer: 'pro',
  backtest: 'pro',
  options: 'pro',
  ml: 'enterprise',
  tax: 'enterprise',
  apiAccess: 'enterprise',
};

const PLAN_HIERARCHY: Record<string, number> = {
  free: 0,
  pro: 1,
  enterprise: 2,
};

export function useSubscription() {
  const subscription = useAuthStore((state) => state.subscription);

  const plan = subscription?.plan || 'free';
  const status = subscription?.status || 'active';
  const isPro = PLAN_HIERARCHY[plan] >= PLAN_HIERARCHY.pro;
  const isEnterprise = PLAN_HIERARCHY[plan] >= PLAN_HIERARCHY.enterprise;

  function canAccess(feature: Feature): boolean {
    if (status === 'canceled') return false;
    const required = FEATURE_REQUIREMENTS[feature];
    return PLAN_HIERARCHY[plan] >= PLAN_HIERARCHY[required];
  }

  return { plan, status, isPro, isEnterprise, canAccess };
}
