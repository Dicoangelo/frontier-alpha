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
import { DataLoadError } from '@/components/shared/EmptyState';
import { useUpcomingEarnings, useEarningsForecast, useRefreshForecast } from '@/hooks/useEarnings';

const DEMO_SYMBOLS = ['NVDA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'JPM', 'V', 'JNJ'];

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

  // Use portfolio symbols if available, otherwise use demo symbols
  const symbols = useMemo(() => {
    const portfolioSymbols = portfolio?.positions?.map(p => p.symbol) || [];
    return portfolioSymbols.length > 0 ? portfolioSymbols : DEMO_SYMBOLS;
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-fade-in-up" style={{ animationFillMode: 'both' }}>
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-[var(--color-text)]">Earnings Calendar</h1>
          <p className="text-[var(--color-text-muted)] mt-1">
            Track upcoming earnings and their expected impact on your portfolio
          </p>
        </div>
        <select
          value={daysAhead}
          onChange={(e) => setDaysAhead(Number(e.target.value))}
          className="px-4 py-2.5 min-h-[44px] border rounded-lg bg-[var(--color-bg)] text-[var(--color-text-secondary)] text-base"
        >
          <option value={7}>Next 7 days</option>
          <option value={14}>Next 14 days</option>
          <option value={30}>Next 30 days</option>
          <option value={60}>Next 60 days</option>
          <option value={90}>Next 90 days</option>
        </select>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-in-up" style={{ animationDelay: '50ms', animationFillMode: 'both' }}>
        <div className="flex items-center gap-3 p-4 rounded-xl bg-[var(--color-bg-tertiary)] border border-[var(--color-border-light)]">
          <div className="p-2.5 rounded-lg flex-shrink-0" style={{ backgroundColor: 'rgba(123, 44, 255, 0.08)' }}>
            <Calendar className="w-5 h-5" style={{ color: 'var(--color-accent)' }} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Total Upcoming</p>
            <p className="text-xl font-bold text-[var(--color-text)] mt-0.5">{earnings.length}</p>
          </div>
        </div>
        <div
          className="flex items-center gap-3 p-4 rounded-xl border"
          style={{
            backgroundColor: earningsToday > 0 ? 'rgba(239, 68, 68, 0.08)' : 'var(--color-bg-tertiary)',
            borderColor: earningsToday > 0 ? 'rgba(239, 68, 68, 0.2)' : 'var(--color-border-light)',
          }}
        >
          <div className="p-2.5 rounded-lg flex-shrink-0" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }}>
            <AlertCircle className="w-5 h-5" style={{ color: 'var(--color-negative)' }} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Reporting Today</p>
            <p className={`text-xl font-bold mt-0.5 ${earningsToday > 0 ? 'text-[var(--color-negative)]' : 'text-[var(--color-text)]'}`}>
              {earningsToday}
            </p>
          </div>
        </div>
        <div
          className="flex items-center gap-3 p-4 rounded-xl border"
          style={{
            backgroundColor: earningsThisWeek > 0 ? 'rgba(245, 158, 11, 0.08)' : 'var(--color-bg-tertiary)',
            borderColor: earningsThisWeek > 0 ? 'rgba(245, 158, 11, 0.2)' : 'var(--color-border-light)',
          }}
        >
          <div className="p-2.5 rounded-lg flex-shrink-0" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)' }}>
            <Calendar className="w-5 h-5" style={{ color: 'var(--color-warning)' }} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">This Week</p>
            <p className={`text-xl font-bold mt-0.5 ${earningsThisWeek > 0 ? 'text-[var(--color-warning)]' : 'text-[var(--color-text)]'}`}>
              {earningsThisWeek}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-4 rounded-xl bg-[var(--color-bg-tertiary)] border border-[var(--color-border-light)]">
          <div className="p-2.5 rounded-lg flex-shrink-0" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)' }}>
            <Calendar className="w-5 h-5" style={{ color: 'var(--color-info)' }} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Positions Tracked</p>
            <p className="text-xl font-bold text-[var(--color-text)] mt-0.5">{symbols.length}</p>
          </div>
        </div>
      </div>

      {/* Alert for imminent earnings */}
      {earningsToday > 0 && (
        <div
          className="flex items-center gap-3 p-4 rounded-lg border animate-fade-in-up"
          style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.2)', animationDelay: '100ms' }}
        >
          <AlertCircle className="w-5 h-5 text-[var(--color-negative)] flex-shrink-0" />
          <div>
            <p className="font-medium text-[var(--color-negative)]">
              {earningsToday} position{earningsToday > 1 ? 's' : ''} reporting today
            </p>
            <p className="text-sm text-[var(--color-negative)]">
              Review forecasts and consider adjusting positions before market close
            </p>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && symbols.length === 0 && (
        <div className="bg-[var(--color-bg)] p-12 rounded-lg border text-center">
          <Calendar className="w-12 h-12 mx-auto mb-4 text-[var(--color-text-muted)]" />
          <h3 className="text-lg font-medium text-[var(--color-text)] mb-2">No positions to track</h3>
          <p className="text-[var(--color-text-muted)]">
            Add positions to your portfolio to see their upcoming earnings
          </p>
        </div>
      )}

      {/* Heatmap */}
      {symbols.length > 0 && earnings.length > 0 && (
        <div className="animate-fade-in-up" style={{ animationDelay: '150ms' }}>
          <EarningsHeatmap
            earnings={earnings}
            onSelect={setSelectedSymbol}
            selectedSymbol={selectedSymbol}
          />
        </div>
      )}

      {/* Main Content - Calendar + Forecast */}
      {symbols.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in-up" style={{ animationDelay: '200ms' }}>
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
        <div className="animate-fade-in-up" style={{ animationDelay: '250ms' }}>
          <BeliefImpactPanel
            earnings={earnings}
            selectedSymbol={selectedSymbol}
          />
        </div>
      )}

      {/* No upcoming earnings message */}
      {!isLoading && symbols.length > 0 && earnings.length === 0 && (
        <div
          className="p-4 rounded-lg border"
          style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', borderColor: 'rgba(59, 130, 246, 0.2)' }}
        >
          <p className="text-[var(--color-info)]">
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
