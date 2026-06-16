import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, TrendingUp, Layers, Globe, Activity, MessageSquare } from 'lucide-react';
import { Card } from '@/components/shared/Card';
import { FactorBar } from '@/components/factors/FactorBar';
import { SignalTiming } from '@/components/factors/SignalTiming';
import { MethodConsensus } from '@/components/factors/MethodConsensus';
import { ContributionWaterfall } from '@/components/factors/ContributionWaterfall';
import { Button } from '@/components/shared/Button';
import { DataQualityBadge } from '@/components/shared/DataQualityBadge';
import { SkeletonFactorsPage } from '@/components/shared/LoadingSkeleton';
import { portfolioApi } from '@/api/portfolio';
import { useFactorsByCategory, useRefreshFactors, FACTOR_CATEGORY_LABELS, FACTOR_CATEGORY_DESCRIPTIONS } from '@/hooks/useFactors';
import { DataLoadError, NoFactorData, EmptyState } from '@/components/shared/EmptyState';
import type { FactorExposureWithCategory } from '@/api/factors';

const CATEGORY_ICONS: Record<string, typeof TrendingUp> = {
  style: TrendingUp,
  macro: Globe,
  sector: Layers,
  volatility: Activity,
  sentiment: MessageSquare,
};

const CATEGORY_ORDER = ['style', 'macro', 'sector', 'volatility', 'sentiment'];

interface FactorCategoryCardProps {
  category: string;
  factors: FactorExposureWithCategory[];
}

function FactorCategoryCard({ category, factors }: FactorCategoryCardProps) {
  const Icon = CATEGORY_ICONS[category] || TrendingUp;
  const sortedFactors = [...factors].sort((a, b) => Math.abs(b.exposure) - Math.abs(a.exposure));

  if (factors.length === 0) {
    return null;
  }

  return (
    <Card className="hover:shadow-lg transition-shadow duration-200">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg" style={{ backgroundColor: 'color-mix(in srgb, var(--color-accent) 10%, transparent)' }}>
          <Icon className="w-5 h-5 text-[var(--color-accent)]" />
        </div>
        <div>
          <h3 className="font-semibold text-[var(--color-text)]">{FACTOR_CATEGORY_LABELS[category]}</h3>
          <p className="text-sm text-[var(--color-text-muted)]">{FACTOR_CATEGORY_DESCRIPTIONS[category]}</p>
        </div>
      </div>
      <div className="space-y-3">
        {sortedFactors.map((factor, idx) => (
          <FactorBar
            // The same factor name (e.g. momentum_12m) appears once per
            // holding when the API aggregates exposures across symbols.
            // Include symbol + index in the key so React's reconciler
            // doesn't dedupe rows belonging to different positions.
            key={`${factor.symbol ?? 'agg'}-${factor.factor}-${idx}`}
            factor={{
              factor: factor.factor,
              exposure: factor.exposure,
              tStat: factor.tStat,
              confidence: factor.confidence,
              contribution: factor.contribution,
            }}
          />
        ))}
      </div>
    </Card>
  );
}

const DEMO_SYMBOLS = ['NVDA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN'];

export function Factors() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

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

  // Get factors grouped by category
  const {
    data: factorsByCategory,
    isLoading: factorsLoading,
    isError: factorsError,
    refetch: refetchFactors,
    insight,
    lastUpdated,
  } = useFactorsByCategory(symbols);

  const { mutate: refreshFactors, isPending: isRefreshing } = useRefreshFactors();

  const isLoading = portfolioLoading || factorsLoading;

  // Filter categories if one is selected
  const displayCategories = selectedCategory
    ? CATEGORY_ORDER.filter(c => c === selectedCategory)
    : CATEGORY_ORDER;

  // Flattened exposures power the aggregate stats and the contribution waterfall.
  const allFactors = useMemo(
    () => Object.values(factorsByCategory).flat(),
    [factorsByCategory],
  );

  // Calculate aggregate stats
  const totalFactors = allFactors.length;
  const significantFactors = allFactors.filter(f => Math.abs(f.tStat) > 1.96).length;

  return (
    <div className="space-y-6" data-testid="visual-factors-ready">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in-up" style={{ animationFillMode: 'both' }}>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-[var(--color-text)]">Factor Analysis</h1>
            <DataQualityBadge />
          </div>
          <p className="text-[var(--color-text-muted)] mt-1">
            Deep-dive into your portfolio&apos;s factor exposures
          </p>
        </div>
        <Button
          onClick={() => refreshFactors(symbols)}
          disabled={isRefreshing || symbols.length === 0}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-in-up" style={{ animationDelay: '50ms', animationFillMode: 'both' }}>
        <div className="flex items-center gap-3 p-4 rounded-xl bg-[var(--color-bg-tertiary)] border border-[var(--color-border-light)]">
          <div className="p-2.5 rounded-lg flex-shrink-0" style={{ backgroundColor: 'color-mix(in srgb, var(--color-accent) 8%, transparent)' }}>
            <Layers className="w-5 h-5" style={{ color: 'var(--color-accent)' }} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Total Factors</p>
            <p className="text-xl font-bold text-[var(--color-text)] mt-0.5">{totalFactors}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-4 rounded-xl bg-[var(--color-bg-tertiary)] border border-[var(--color-border-light)]">
          <div className="p-2.5 rounded-lg flex-shrink-0" style={{ backgroundColor: 'color-mix(in srgb, var(--color-positive) 10%, transparent)' }}>
            <TrendingUp className="w-5 h-5" style={{ color: 'var(--color-positive)' }} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Significant</p>
            <p className="text-xl font-bold text-[var(--color-accent)] mt-0.5">{significantFactors}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-4 rounded-xl bg-[var(--color-bg-tertiary)] border border-[var(--color-border-light)]">
          <div className="p-2.5 rounded-lg flex-shrink-0" style={{ backgroundColor: 'color-mix(in srgb, var(--color-info) 10%, transparent)' }}>
            <Activity className="w-5 h-5" style={{ color: 'var(--color-info)' }} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Positions</p>
            <p className="text-xl font-bold text-[var(--color-text)] mt-0.5">{symbols.length}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-4 rounded-xl bg-[var(--color-bg-tertiary)] border border-[var(--color-border-light)]">
          <div className="p-2.5 rounded-lg flex-shrink-0" style={{ backgroundColor: 'color-mix(in srgb, var(--color-warning) 10%, transparent)' }}>
            <RefreshCw className="w-5 h-5" style={{ color: 'var(--color-warning)' }} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Last Updated</p>
            <p className="text-sm font-medium text-[var(--color-text)] mt-0.5">
              {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : 'Never'}
            </p>
          </div>
        </div>
      </div>

      {/* Category Filters */}
      <div className="flex flex-wrap gap-2 animate-fade-in-up" style={{ animationDelay: '100ms', animationFillMode: 'both' }}>
        <Button
          variant={selectedCategory === null ? 'primary' : 'outline'}
          size="sm"
          onClick={() => setSelectedCategory(null)}
        >
          All Categories
        </Button>
        {CATEGORY_ORDER.map(category => {
          const Icon = CATEGORY_ICONS[category];
          const count = factorsByCategory[category]?.length || 0;
          return (
            <Button
              key={category}
              variant={selectedCategory === category ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory(category)}
            >
              <Icon className="w-4 h-4 mr-1" />
              {FACTOR_CATEGORY_LABELS[category]} ({count})
            </Button>
          );
        })}
      </div>

      {/* Loading State */}
      {isLoading && <SkeletonFactorsPage />}

      {/* Error State */}
      {!isLoading && factorsError && (
        <Card className="p-6">
          <DataLoadError onRetry={() => refetchFactors()} error="Failed to load factor data" />
        </Card>
      )}

      {/* Empty State */}
      {!isLoading && !factorsError && symbols.length === 0 && (
        <EmptyState
          icon={<Layers className="w-8 h-8" />}
          kicker="FACTORS · Awaiting Positions"
          title="No positions in your portfolio"
          description="Add positions to analyze their factor exposures across momentum, quality, value, and 80+ institutional cores."
        />
      )}

      {/* No factor data */}
      {!isLoading && !factorsError && symbols.length > 0 && totalFactors === 0 && (
        <Card className="p-6">
          <NoFactorData />
        </Card>
      )}

      {/* Factor Categories Grid */}
      {!isLoading && symbols.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in-up" style={{ animationDelay: '150ms', animationFillMode: 'both' }}>
          {displayCategories.map(category => (
            <FactorCategoryCard
              key={category}
              category={category}
              factors={factorsByCategory[category] || []}
            />
          ))}
        </div>
      )}

      {/* Contribution Waterfall — which factors drive the net signal */}
      {!isLoading && symbols.length > 0 && totalFactors > 0 && (
        <div className="animate-fade-in-up" style={{ animationDelay: '160ms', animationFillMode: 'both' }}>
          <ContributionWaterfall factors={allFactors} />
        </div>
      )}

      {/* Signal Timing + Method Consensus — saliency and trust surfaces */}
      {!isLoading && symbols.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in-up" style={{ animationDelay: '175ms', animationFillMode: 'both' }}>
          <SignalTiming symbols={symbols} />
          <MethodConsensus symbols={symbols} />
        </div>
      )}

      {/* AI Insight */}
      {insight && (
        <div
          className="p-4 rounded-lg border animate-fade-in-up"
          style={{
            background: 'linear-gradient(to right, color-mix(in srgb, var(--color-info) 10%, transparent), color-mix(in srgb, var(--color-accent) 10%, transparent))',
            borderColor: 'color-mix(in srgb, var(--color-info) 20%, transparent)',
            animationDelay: '200ms',
          }}
        >
          <p className="text-sm font-medium text-[var(--color-accent)] mb-2">AI Insight</p>
          <p className="text-sm text-[var(--color-accent)]">{insight}</p>
        </div>
      )}
    </div>
  );
}
