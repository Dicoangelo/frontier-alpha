import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { earningsApi } from '@/api/earnings';
import { toast } from '@/components/shared/Toast';
import type { EarningsImpactForecast } from '@/types';

export function useUpcomingEarnings(symbols: string[], daysAhead: number = 30) {
  return useQuery({
    queryKey: ['earnings', 'upcoming', symbols.sort().join(','), daysAhead],
    queryFn: () => earningsApi.getUpcoming(symbols, daysAhead),
    enabled: symbols.length > 0,
    staleTime: 60 * 60 * 1000, // 1 hour - earnings dates don't change often
    refetchOnWindowFocus: false,
  });
}

export function useEarningsForecast(symbol: string | null) {
  return useQuery({
    queryKey: ['earnings', 'forecast', symbol],
    queryFn: () => earningsApi.getForecast(symbol!),
    enabled: !!symbol,
    staleTime: 30 * 60 * 1000, // 30 minutes
    refetchOnWindowFocus: false,
  });
}

export function useEarningsHistory(symbol: string | null, limit: number = 8) {
  return useQuery({
    queryKey: ['earnings', 'history', symbol, limit],
    queryFn: () => earningsApi.getHistory(symbol!, limit),
    enabled: !!symbol,
    staleTime: 24 * 60 * 60 * 1000, // 24 hours - historical data doesn't change
  });
}

export function useRefreshForecast() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (symbol: string) => earningsApi.refreshForecast(symbol),
    onSuccess: (data, symbol) => {
      queryClient.setQueryData(['earnings', 'forecast', symbol], data);
      toast.success('Forecast refreshed', `${symbol} earnings forecast updated`);
    },
    onError: () => {
      toast.error('Failed to refresh forecast');
    },
  });
}

export function getReportTimeLabel(time?: string): string {
  switch (time) {
    case 'pre_market':
      return 'Before Market Open';
    case 'post_market':
      return 'After Market Close';
    case 'during_market':
      return 'During Market Hours';
    default:
      return 'Time TBD';
  }
}

export function getDirectionColor(direction: EarningsImpactForecast['expectedDirection']): string {
  switch (direction) {
    case 'up':
      return 'text-[var(--color-positive)]';
    case 'down':
      return 'text-[var(--color-negative)]';
    default:
      return 'text-[var(--color-text-muted)]';
  }
}

export function getRecommendationBadge(recommendation: EarningsImpactForecast['recommendation']): {
  color: string;
  label: string;
} {
  switch (recommendation) {
    case 'add':
      return { color: 'bg-[rgba(16,185,129,0.1)] text-[var(--color-positive)]', label: 'Add' };
    case 'hold':
      return { color: 'bg-[rgba(59,130,246,0.1)] text-[var(--color-info)]', label: 'Hold' };
    case 'reduce':
      return { color: 'bg-[rgba(245,158,11,0.1)] text-[var(--color-warning)]', label: 'Reduce' };
    case 'hedge':
      return { color: 'bg-[rgba(123,44,255,0.1)] text-[var(--color-accent)]', label: 'Hedge' };
    default:
      return { color: 'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]', label: recommendation };
  }
}
