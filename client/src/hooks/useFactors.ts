import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  factorsApi,
  groupByCategory,
  type FactorHistoryWindow,
} from '@/api/factors';
import { toast } from '@/components/shared/Toast';
import { useAuthStore } from '@/stores/authStore';

/**
 * `/portfolio/factors/:symbols` and `/portfolio/factors/history/:symbols` are
 * PUBLIC routes (no auth preHandler; public rate limit). The hooks used to
 * require an access token anyway, so anonymous visitors on the open front door
 * saw an empty Factors page and a permanently "degraded" Factor Deltas card
 * while the Dashboard (which used a raw fetch) showed the same symbols' real
 * exposures. We still wait for auth hydration (`isReady`) so a signed-in user
 * does not fire an anonymous request and then a second one with the token.
 */
function useHydrated(): boolean {
  return useAuthStore((s) => s.isReady);
}

export function useFactors(symbols: string[]) {
  const hydrated = useHydrated();

  return useQuery({
    queryKey: ['factors', symbols.sort().join(',')],
    queryFn: () => factorsApi.getFactors(symbols),
    enabled: hydrated && symbols.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });
}

export function useFactorsByCategory(symbols: string[]) {
  const { data, ...rest } = useFactors(symbols);

  const grouped = data?.factors ? groupByCategory(data.factors) : {
    style: [],
    macro: [],
    sector: [],
    volatility: [],
    sentiment: [],
  };

  return {
    ...rest,
    data: grouped,
    insight: data?.insight,
    lastUpdated: data?.lastUpdated,
  };
}

/**
 * Server-derived current + window-prior factor exposures in one round trip.
 * Backs the FactorDeltas card's "Strategy 1" path so the user does not have
 * to wait a UTC day for the localStorage baseline to accumulate.
 *
 * Public route, hydration-gated like useFactors (see note above).
 * Errors fall through to React Query's `error` field so callers can decide
 * whether to fall back to the localStorage baseline.
 */
export function useFactorsHistory(
  symbols: string[],
  window: FactorHistoryWindow = '1d',
) {
  const hydrated = useHydrated();

  return useQuery({
    queryKey: ['factors-history', window, symbols.sort().join(',')],
    queryFn: () => factorsApi.getFactorsHistory(symbols, window),
    enabled: hydrated && symbols.length > 0,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

export function useRefreshFactors() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (symbols: string[]) => factorsApi.refreshFactors(symbols),
    onSuccess: (data, symbols) => {
      queryClient.setQueryData(['factors', symbols.sort().join(',')], data);
      toast.success('Factors refreshed');
    },
    onError: () => {
      toast.error('Failed to refresh factors');
    },
  });
}

export const FACTOR_CATEGORY_LABELS: Record<string, string> = {
  style: 'Style Factors',
  macro: 'Macro Factors',
  sector: 'Sector Factors',
  volatility: 'Volatility Factors',
  sentiment: 'Sentiment Factors',
};

export const FACTOR_CATEGORY_DESCRIPTIONS: Record<string, string> = {
  style: 'Traditional investment factors like momentum, value, and quality',
  macro: 'Economic factors including rates, inflation, and credit spreads',
  sector: 'Industry and sector exposure metrics',
  volatility: 'Measures of price volatility and risk',
  sentiment: 'Market sentiment and news-based indicators',
};
