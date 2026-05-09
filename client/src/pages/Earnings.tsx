import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, AlertCircle } from 'lucide-react';
import { portfolioApi } from '@/api/portfolio';
import { EarningsCalendar } from '@/components/earnings/EarningsCalendar';
import { EarningsForecast } from '@/components/earnings/EarningsForecast';
import { EarningsHeatmap } from '@/components/earnings/EarningsHeatmap';
import { BeliefImpactPanel } from '@/components/earnings/BeliefImpactPanel';
import { SkeletonEarningsPage } from '@/components/shared/Skeleton';
import { PullToRefresh } from '@/components/shared/PullToRefresh';
import { DataLoadError, EmptyState } from '@/components/shared/EmptyState';
import { useUpcomingEarnings, useEarningsForecast, useRefreshForecast } from '@/hooks/useEarnings';

// US-002: removed DEMO_SYMBOLS fallback. We never seed AAPL/MSFT/NVDA
// earnings for an account with zero positions — the empty-state below
// already explains the situation.

export function Earnings() {
  const queryClient = useQueryClient();
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [daysAhead, setDaysAhead] = useState(30);

  // Get portfolio to extract symbols
  const { data: portfolio, isLoading: portfolioLoading } = useQuery({
    queryKey: ['portfolio'],
    queryFn: portfolioApi.getPortfolio,
    retry: false,
  });

  // Use portfolio symbols only — empty array surfaces the empty-state
  // panel further down. No fabricated demo symbols.
  const symbols = useMemo(() => {
    return portfolio?.positions?.map(p => p.symbol) || [];
  }, [portfolio]);

  // Get upcoming earnings
  const {
    data: earnings = [],
    isLoading: earningsLoading,
    isError: earningsError,
    refetch: refetchEarnings,
  } = useUpcomingEarnings(symbols, daysAhead);

  // Get forecast for selected symbol
  const {
    data: forecast,
    isLoading: forecastLoading,
  } = useEarningsForecast(selectedSymbol);

  // Refresh forecast mutation
  const { mutate: refreshForecast, isPending: isRefreshing } = useRefreshForecast();

  const isLoading = portfolioLoading || earningsLoading;

  // Pull to refresh handler
  const handleRefresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['portfolio'] }),
      queryClient.invalidateQueries({ queryKey: ['earnings'] }),
      selectedSymbol && queryClient.invalidateQueries({ queryKey: ['earnings-forecast', selectedSymbol] }),
    ]);
  };

  // Show skeleton while loading
  if (isLoading) {
    return <SkeletonEarningsPage />;
  }

  // Show error state
  if (earningsError) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <DataLoadError onRetry={() => refetchEarnings()} error="Failed to load earnings data" />
      </div>
    );
  }

  // Calculate stats
  const earningsThisWeek = earnings.filter(e => e.daysUntil <= 7).length;
  const earningsToday = earnings.filter(e => e.daysUntil === 0).length;

  const content = (
    <div className="space-y-6">
      {/* Header */}
      <div
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-fade-in-up"
        style={{ animationFillMode: 'both' }}
      >
        <div>
          <p className="mono text-[10px] sm:text-xs tracking-[0.3em] uppercase text-theme-muted mb-2">
            Execution · Earnings
          </p>
          <h1 className="text-2xl lg:text-3xl font-bold text-theme">
            <span className="text-gradient-brand">Earnings Calendar</span>
          </h1>
          <p className="text-sm text-theme-secondary mt-1">
            Track upcoming earnings and their expected impact on your portfolio
          </p>
        </div>
        <div>
          <label htmlFor="earnings-days-ahead" className="sr-only">Days ahead</label>
          <select
            id="earnings-days-ahead"
            value={daysAhead}
            onChange={(e) => setDaysAhead(Number(e.target.value))}
            className="block w-full px-4 py-3 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)] transition-[border-color,box-shadow] duration-200 mono text-sm"
          >
            <option value={7}>Next 7 days</option>
            <option value={14}>Next 14 days</option>
            <option value={30}>Next 30 days</option>
            <option value={60}>Next 60 days</option>
            <option value={90}>Next 90 days</option>
          </select>
        </div>
      </div>

      {/* Stats Bar */}
      <div
        className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-stagger animate-fade-in-up"
        style={{ animationDelay: '50ms', animationFillMode: 'both' }}
      >
        <div className="glass-slab rounded-xl p-4 sm:p-6 flex items-center gap-3 animate-enter">
          <div
            className="p-2.5 rounded-lg flex-shrink-0"
            style={{ backgroundColor: 'color-mix(in srgb, var(--color-accent) 10%, transparent)' }}
          >
            <Calendar className="w-5 h-5 text-[var(--color-accent)]" />
          </div>
          <div className="min-w-0">
            <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Total Upcoming</p>
            <p className="mono tabular-nums text-xl font-bold text-theme mt-1">{earnings.length}</p>
          </div>
        </div>
        <div
          className={`glass-slab rounded-xl p-4 sm:p-6 flex items-center gap-3 animate-enter relative overflow-hidden ${
            earningsToday > 0
              ? "before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-[var(--color-negative)]"
              : ''
          }`}
        >
          <div
            className="p-2.5 rounded-lg flex-shrink-0"
            style={{ backgroundColor: 'color-mix(in srgb, var(--color-negative) 10%, transparent)' }}
          >
            <AlertCircle className="w-5 h-5 text-[var(--color-negative)]" />
          </div>
          <div className="min-w-0">
            <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Reporting Today</p>
            <p className={`mono tabular-nums text-xl font-bold mt-1 ${earningsToday > 0 ? 'text-[var(--color-negative)]' : 'text-theme'}`}>
              {earningsToday}
            </p>
          </div>
        </div>
        <div
          className={`glass-slab rounded-xl p-4 sm:p-6 flex items-center gap-3 animate-enter relative overflow-hidden ${
            earningsThisWeek > 0
              ? "before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-[var(--color-warning)]"
              : ''
          }`}
        >
          <div
            className="p-2.5 rounded-lg flex-shrink-0"
            style={{ backgroundColor: 'color-mix(in srgb, var(--color-warning) 10%, transparent)' }}
          >
            <Calendar className="w-5 h-5 text-[var(--color-warning)]" />
          </div>
          <div className="min-w-0">
            <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">This Week</p>
            <p className={`mono tabular-nums text-xl font-bold mt-1 ${earningsThisWeek > 0 ? 'text-[var(--color-warning)]' : 'text-theme'}`}>
              {earningsThisWeek}
            </p>
          </div>
        </div>
        <div className="glass-slab rounded-xl p-4 sm:p-6 flex items-center gap-3 animate-enter">
          <div
            className="p-2.5 rounded-lg flex-shrink-0"
            style={{ backgroundColor: 'color-mix(in srgb, var(--color-info) 10%, transparent)' }}
          >
            <Calendar className="w-5 h-5 text-[var(--color-info)]" />
          </div>
          <div className="min-w-0">
            <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Positions Tracked</p>
            <p className="mono tabular-nums text-xl font-bold text-theme mt-1">{symbols.length}</p>
          </div>
        </div>
      </div>

      {/* Alert for imminent earnings */}
      {earningsToday > 0 && (
        <div
          className="glass-slab-floating relative overflow-hidden rounded-xl pl-5 pr-4 py-4 flex items-start gap-3 before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-[var(--color-negative)] shadow-[0_18px_60px_-20px_rgba(239,68,68,0.45)] animate-fade-in-up"
          style={{ animationDelay: '100ms', animationFillMode: 'both' }}
        >
          <AlertCircle className="w-5 h-5 text-[var(--color-negative)] flex-shrink-0 mt-0.5" />
          <div>
            <p className="mono text-[10px] tracking-[0.3em] uppercase font-semibold text-[var(--color-negative)]">
              {earningsToday} position{earningsToday > 1 ? 's' : ''} reporting today
            </p>
            <p className="text-sm mt-1 text-theme-secondary">
              Review forecasts and consider adjusting positions before market close
            </p>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && symbols.length === 0 && (
        <EmptyState
          icon={<Calendar className="w-8 h-8" />}
          kicker="EARNINGS · Awaiting Positions"
          title="No positions to track"
          description="Add positions to your portfolio to see their upcoming earnings, expected moves, and factor-adjusted forecasts."
        />
      )}

      {/* Heatmap */}
      {symbols.length > 0 && earnings.length > 0 && (
        <div className="animate-fade-in-up" style={{ animationDelay: '150ms', animationFillMode: 'both' }}>
          <EarningsHeatmap
            earnings={earnings}
            onSelect={setSelectedSymbol}
            selectedSymbol={selectedSymbol}
          />
        </div>
      )}

      {/* Main Content - Calendar + Forecast */}
      {symbols.length > 0 && (
        <div
          className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in-up"
          style={{ animationDelay: '200ms', animationFillMode: 'both' }}
        >
          <EarningsCalendar
            earnings={earnings}
            isLoading={isLoading}
            selectedSymbol={selectedSymbol}
            onSelect={setSelectedSymbol}
          />
          <EarningsForecast
            symbol={selectedSymbol}
            forecast={forecast}
            isLoading={forecastLoading}
            onRefresh={selectedSymbol ? () => refreshForecast(selectedSymbol) : undefined}
            isRefreshing={isRefreshing}
          />
        </div>
      )}

      {/* CVRF Belief Impact */}
      {symbols.length > 0 && (
        <div className="animate-fade-in-up" style={{ animationDelay: '250ms', animationFillMode: 'both' }}>
          <BeliefImpactPanel
            earnings={earnings}
            selectedSymbol={selectedSymbol}
          />
        </div>
      )}

      {/* No upcoming earnings message */}
      {!isLoading && symbols.length > 0 && earnings.length === 0 && (
        <div className="glass-slab-floating relative overflow-hidden rounded-xl pl-5 pr-4 py-4 before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-[image:var(--gradient-sovereign)]">
          <p className="text-sm text-theme-secondary">
            None of your {symbols.length} positions have earnings scheduled in the next {daysAhead} days.
          </p>
        </div>
      )}
    </div>
  );

  return (
    <PullToRefresh onRefresh={handleRefresh} className="min-h-full">
      {content}
    </PullToRefresh>
  );
}
