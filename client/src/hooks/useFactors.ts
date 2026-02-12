import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { factorsApi, groupByCategory } from '@/api/factors';
import { toast } from '@/components/shared/Toast';

export function useFactors(symbols: string[]) {
  return useQuery({
    queryKey: ['factors', symbols.sort().join(',')],
    queryFn: () => factorsApi.getFactors(symbols),
    enabled: symbols.length > 0,
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
