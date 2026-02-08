import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, TrendingUp, Layers, Globe, Activity, MessageSquare } from 'lucide-react';
import { Card } from '@/components/shared/Card';
import { FactorBar } from '@/components/factors/FactorBar';
import { Button } from '@/components/shared/Button';
import { Spinner } from '@/components/shared/Spinner';
import { portfolioApi } from '@/api/portfolio';
import { useFactorsByCategory, useRefreshFactors, FACTOR_CATEGORY_LABELS, FACTOR_CATEGORY_DESCRIPTIONS } from '@/hooks/useFactors';
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
    <Card>
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-blue-500/10 rounded-lg">
          <Icon className="w-5 h-5 text-blue-600" />
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

export function Factors() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Get portfolio to extract symbols
  const { data: portfolio, isLoading: portfolioLoading } = useQuery({
    queryKey: ['portfolio'],
    queryFn: portfolioApi.getPortfolio,
    retry: false,
  });

  // Use portfolio symbols if available, otherwise use demo symbols
  const DEMO_SYMBOLS = ['NVDA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN'];
  const symbols = useMemo(() => {
    const portfolioSymbols = portfolio?.positions?.map(p => p.symbol) || [];
    return portfolioSymbols.length > 0 ? portfolioSymbols : DEMO_SYMBOLS;
  }, [portfolio]);

  // Get factors grouped by category
  const {
    data: factorsByCategory,
    isLoading: factorsLoading,
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Factor Analysis</h1>
          <p className="text-[var(--color-text-muted)] mt-1">
            Deep-dive into your portfolio's factor exposures
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[var(--color-bg)] p-4 rounded-lg border">
          <p className="text-sm text-[var(--color-text-muted)]">Total Factors</p>
          <p className="text-2xl font-bold text-[var(--color-text)]">{totalFactors}</p>
        </div>
        <div className="bg-[var(--color-bg)] p-4 rounded-lg border">
          <p className="text-sm text-[var(--color-text-muted)]">Significant (|t| &gt; 1.96)</p>
          <p className="text-2xl font-bold text-blue-600">{significantFactors}</p>
        </div>
        <div className="bg-[var(--color-bg)] p-4 rounded-lg border">
          <p className="text-sm text-[var(--color-text-muted)]">Positions Analyzed</p>
          <p className="text-2xl font-bold text-[var(--color-text)]">{symbols.length}</p>
        </div>
        <div className="bg-[var(--color-bg)] p-4 rounded-lg border">
          <p className="text-sm text-[var(--color-text-muted)]">Last Updated</p>
          <p className="text-sm font-medium text-[var(--color-text)]">
            {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : 'Never'}
          </p>
        </div>
      </div>

      {/* Category Filters */}
      <div className="flex flex-wrap gap-2">
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
      {isLoading && (
        <div className="flex items-center justify-center h-64">
          <Spinner className="w-8 h-8" />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && symbols.length === 0 && (
        <Card>
          <div className="flex flex-col items-center justify-center h-64 text-[var(--color-text-muted)]">
            <Layers className="w-12 h-12 mb-4 opacity-50" />
            <p>No positions in your portfolio</p>
            <p className="text-sm mt-1">Add positions to analyze their factor exposures</p>
          </div>
        </Card>
      )}

      {/* Factor Categories Grid */}
      {!isLoading && symbols.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
        <div className="p-4 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-lg border border-blue-500/20">
          <p className="text-sm font-medium text-blue-400 mb-2">AI Insight</p>
          <p className="text-sm text-blue-500">{insight}</p>
        </div>
      )}
    </div>
  );
}
