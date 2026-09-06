/**
 * Proof-of-test: the factor endpoints are public, so an anonymous visitor on
 * the open front door must get real exposures. Before this the hooks demanded
 * an access token and demo visitors saw an empty Factors page plus a
 * permanently "degraded" Factor Deltas card.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const authState = vi.hoisted(() => ({
  isReady: true,
  session: null as { access_token: string } | null,
  user: null as { id: string } | null,
  subscription: null,
  fetchSubscription: vi.fn(async () => {}),
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector?: (s: typeof authState) => unknown) => (selector ? selector(authState) : authState),
}));

const getFactors = vi.hoisted(() => vi.fn(async () => ({ factors: [], insight: '', lastUpdated: 'now' })));
const getFactorsHistory = vi.hoisted(() => vi.fn(async () => ({ current: [], prior: [], window: '1d' })));
vi.mock('@/api/factors', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/api/factors')>();
  return { ...orig, factorsApi: { ...orig.factorsApi, getFactors, getFactorsHistory } };
});

import { useFactors, useFactorsHistory } from './useFactors';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  getFactors.mockClear();
  getFactorsHistory.mockClear();
  authState.isReady = true;
  authState.session = null;
});

describe('factor hooks on the public endpoints', () => {
  it('fetches exposures for an ANONYMOUS visitor once auth has hydrated', async () => {
    const { result } = renderHook(() => useFactors(['NVDA', 'AAPL']), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getFactors).toHaveBeenCalledWith(['AAPL', 'NVDA']);
  });

  it('fetches history for an ANONYMOUS visitor (Factor Deltas strategy 1)', async () => {
    const { result } = renderHook(() => useFactorsHistory(['NVDA'], '1d'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getFactorsHistory).toHaveBeenCalledTimes(1);
  });

  it('still waits for auth hydration so a signed-in user does not double-fetch', async () => {
    authState.isReady = false;
    renderHook(() => useFactors(['NVDA']), { wrapper });
    await new Promise((r) => setTimeout(r, 30));
    expect(getFactors).not.toHaveBeenCalled();
  });

  it('does nothing with no symbols', async () => {
    renderHook(() => useFactors([]), { wrapper });
    await new Promise((r) => setTimeout(r, 30));
    expect(getFactors).not.toHaveBeenCalled();
  });
});
