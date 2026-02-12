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
      return 'text-green-600';
    case 'down':
      return 'text-red-600';
    default:
      return 'text-gray-600';
  }
}

export function getRecommendationBadge(recommendation: EarningsImpactForecast['recommendation']): {
  color: string;
  label: string;
} {
  switch (recommendation) {
    case 'add':
      return { color: 'bg-green-100 text-green-800', label: 'Add' };
    case 'hold':
      return { color: 'bg-blue-100 text-blue-800', label: 'Hold' };
    case 'reduce':
      return { color: 'bg-yellow-100 text-yellow-800', label: 'Reduce' };
    case 'hedge':
      return { color: 'bg-purple-100 text-purple-800', label: 'Hedge' };
    default:
      return { color: 'bg-gray-100 text-gray-800', label: recommendation };
  }
}
