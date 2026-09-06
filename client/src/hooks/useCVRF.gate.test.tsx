/**
 * Proof-of-test: a signed-in FREE account must not fire the CVRF fan-out.
 * Before the plan gate, useCVRFBeliefs called the API for any session and
 * the server answered 403 — four console errors per CVRF/Earnings view.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const authState = vi.hoisted(() => ({
  isReady: true,
  session: { access_token: 'tok' } as { access_token: string } | null,
  user: { id: 'u1' } as { id: string } | null,
  subscription: { plan: 'free', status: 'active' } as { plan: string; status: string } | null,
  fetchSubscription: vi.fn(async () => {}),
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector?: (s: typeof authState) => unknown) => (selector ? selector(authState) : authState),
}));

const getBeliefs = vi.hoisted(() => vi.fn(async () => ({ factorWeights: {}, factorConfidences: {}, regimeConfidence: 0.5 })));
vi.mock('@/api/cvrf', () => ({
  cvrfApi: {
    getBeliefs,
    getConstraints: vi.fn(),
    getEpisodes: vi.fn(),
    startEpisode: vi.fn(),
    closeEpisode: vi.fn(),
    getStats: vi.fn(),
    getHistory: vi.fn(),
  },
}));

import { useCVRFBeliefs } from './useCVRF';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  getBeliefs.mockClear();
  authState.session = { access_token: 'tok' };
  authState.user = { id: 'u1' };
  authState.subscription = { plan: 'free', status: 'active' };
});

describe('useCVRFBeliefs plan gate', () => {
  it('does NOT call the API for a signed-in free account', async () => {
    const { result } = renderHook(() => useCVRFBeliefs(), { wrapper });
    await new Promise((r) => setTimeout(r, 30));
    expect(getBeliefs).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('does NOT call the API while the subscription is still resolving', async () => {
    authState.subscription = null;
    renderHook(() => useCVRFBeliefs(), { wrapper });
    await new Promise((r) => setTimeout(r, 30));
    expect(getBeliefs).not.toHaveBeenCalled();
  });

  it('does NOT call the API for an anonymous visitor', async () => {
    authState.session = null;
    authState.user = null;
    renderHook(() => useCVRFBeliefs(), { wrapper });
    await new Promise((r) => setTimeout(r, 30));
    expect(getBeliefs).not.toHaveBeenCalled();
  });

  it('DOES call the API for a pro account', async () => {
    authState.subscription = { plan: 'pro', status: 'active' };
    const { result } = renderHook(() => useCVRFBeliefs(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getBeliefs).toHaveBeenCalledTimes(1);
  });
});
