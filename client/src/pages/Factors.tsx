import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, TrendingUp, Layers, Globe, Activity, MessageSquare } from 'lucide-react';
import { Card } from '@/components/shared/Card';
import { FactorBar } from '@/components/factors/FactorBar';
import { Button } from '@/components/shared/Button';
import { SkeletonFactorsPage } from '@/components/shared/LoadingSkeleton';
import { portfolioApi } from '@/api/portfolio';
import { useFactorsByCategory, useRefreshFactors, FACTOR_CATEGORY_LABELS, FACTOR_CATEGORY_DESCRIPTIONS } from '@/hooks/useFactors';
import { DataLoadError, NoFactorData } from '@/components/shared/EmptyState';
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
        <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(123, 44, 255, 0.1)' }}>
          <Icon className="w-5 h-5 text-[var(--color-accent)]" />
        </div>
        <div>
          <h3 className="font-semibold text-[var(--color-text)]">{FACTOR_CATEGORY_LABELS[category]}</h3>
          <p className="text-sm text-[var(--color-text-muted)]">{FACTOR_CATEGORY_DESCRIPTIONS[category]}</p>
        </div>
      </div>
      <div className="space-y-3">
        {sortedFactors.map((factor) => (
          <FactorBar
            key={factor.factor}
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

  // Calculate aggregate stats
  const totalFactors = Object.values(factorsByCategory).flat().length;
  const significantFactors = Object.values(factorsByCategory)
    .flat()
    .filter(f => Math.abs(f.tStat) > 1.96).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in-up" style={{ animationFillMode: 'both' }}>
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Factor Analysis</h1>
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
          <div className="p-2.5 rounded-lg flex-shrink-0" style={{ backgroundColor: 'rgba(123, 44, 255, 0.08)' }}>
            <Layers className="w-5 h-5" style={{ color: 'var(--color-accent)' }} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Total Factors</p>
            <p className="text-xl font-bold text-[var(--color-text)] mt-0.5">{totalFactors}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-4 rounded-xl bg-[var(--color-bg-tertiary)] border border-[var(--color-border-light)]">
          <div className="p-2.5 rounded-lg flex-shrink-0" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)' }}>
            <TrendingUp className="w-5 h-5" style={{ color: 'var(--color-positive)' }} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Significant</p>
            <p className="text-xl font-bold text-[var(--color-accent)] mt-0.5">{significantFactors}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-4 rounded-xl bg-[var(--color-bg-tertiary)] border border-[var(--color-border-light)]">
          <div className="p-2.5 rounded-lg flex-shrink-0" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)' }}>
            <Activity className="w-5 h-5" style={{ color: 'var(--color-info)' }} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Positions</p>
            <p className="text-xl font-bold text-[var(--color-text)] mt-0.5">{symbols.length}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-4 rounded-xl bg-[var(--color-bg-tertiary)] border border-[var(--color-border-light)]">
          <div className="p-2.5 rounded-lg flex-shrink-0" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)' }}>
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
        <Card>
          <div className="flex flex-col items-center justify-center h-64 text-[var(--color-text-muted)]">
            <Layers className="w-12 h-12 mb-4 opacity-50" />
            <p>No positions in your portfolio</p>
            <p className="text-sm mt-1">Add positions to analyze their factor exposures</p>
          </div>
        </Card>
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

      {/* AI Insight */}
      {insight && (
        <div
          className="p-4 rounded-lg border animate-fade-in-up"
          style={{
            background: 'linear-gradient(to right, rgba(59, 130, 246, 0.1), rgba(123, 44, 255, 0.1))',
            borderColor: 'rgba(59, 130, 246, 0.2)',
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
