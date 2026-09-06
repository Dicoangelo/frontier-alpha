import { describe, it, expect } from 'vitest';
import { planGateEnabled } from './useSubscription';

const base = {
  isReady: true,
  hasToken: true,
  subscriptionLoading: false,
  plan: 'pro' as const,
  status: 'active' as const,
  required: 'pro' as const,
};

describe('planGateEnabled', () => {
  it('allows a pro account on a pro endpoint', () => {
    expect(planGateEnabled(base)).toBe(true);
  });

  it('blocks a free account on a pro endpoint (the 403 source)', () => {
    expect(planGateEnabled({ ...base, plan: 'free' })).toBe(false);
  });

  it('blocks anonymous visitors (the 401 source)', () => {
    expect(planGateEnabled({ ...base, hasToken: false })).toBe(false);
    expect(planGateEnabled({ ...base, isReady: false })).toBe(false);
  });

  it('waits for the subscription to resolve rather than guessing', () => {
    expect(planGateEnabled({ ...base, subscriptionLoading: true })).toBe(false);
  });

  it('blocks a canceled subscription regardless of plan', () => {
    expect(planGateEnabled({ ...base, plan: 'enterprise', status: 'canceled' })).toBe(false);
  });

  it('enterprise satisfies pro; pro does not satisfy enterprise', () => {
    expect(planGateEnabled({ ...base, plan: 'enterprise' })).toBe(true);
    expect(planGateEnabled({ ...base, plan: 'pro', required: 'enterprise' })).toBe(false);
  });
});
