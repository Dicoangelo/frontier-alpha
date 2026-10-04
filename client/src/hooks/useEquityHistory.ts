import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { quotesApi, type HistoricalPrices } from '@/api/quotes';
import { buildEquitySeries, type EquityHolding, type EquityPoint } from '@/lib/equitySeries';

export type EquitySeriesStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

/** One year of daily bars — the history endpoint's ceiling; the chart slices per timeframe. */
export const EQUITY_HISTORY_DAYS = 365;
const BENCHMARK = 'SPY';

/**
 * Real equity history for the Dashboard curve: one cached daily-close fetch per
 * held symbol plus the benchmark, folded by `buildEquitySeries`. The endpoint
 * is public and served from the Supabase price cache, so demo visitors get the
 * same real series for the demo tickers.
 *
 * `unavailable` (not a mock) when any held symbol has no history yet — the
 * chart renders an honest placeholder in that case.
 */
export function useEquityHistory(holdings: EquityHolding[], cash: number): {
  series: EquityPoint[] | null;
  status: EquitySeriesStatus;
} {
  const symbols = useMemo(() => {
    const set = new Set<string>();
    for (const h of holdings) if (h.symbol && h.shares > 0) set.add(h.symbol.toUpperCase());
    set.add(BENCHMARK);
    return [...set].sort();
  }, [holdings]);

  const results = useQueries({
    queries: symbols.map((symbol) => ({
      queryKey: ['quotes', symbol, 'history', EQUITY_HISTORY_DAYS] as const,
      queryFn: () => quotesApi.getHistoricalPrices(symbol, EQUITY_HISTORY_DAYS),
      staleTime: 30 * 60 * 1000, // daily bars; the server cache refreshes hourly
      retry: 1,
      enabled: holdings.length > 0,
    })),
  });

  return useMemo(() => {
    if (holdings.length === 0) return { series: null, status: 'idle' as const };
    if (results.some((r) => r.isPending)) return { series: null, status: 'loading' as const };

    const histories: Record<string, HistoricalPrices | null> = {};
    symbols.forEach((symbol, i) => {
      histories[symbol] = results[i]?.data ?? null;
    });
    const series = buildEquitySeries({ histories, holdings, cash, benchmarkSymbol: BENCHMARK });
    return series
      ? { series, status: 'ready' as const }
      : { series: null, status: 'unavailable' as const };
    // Keep the dependency list a fixed length as holdings/query counts change.
    // Rebuilding this small daily series is cheaper than stale cached results.
  }, [holdings, cash, symbols, results]);
}
