import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw, TrendingUp, Layers, Globe, Activity, MessageSquare } from 'lucide-react';
import { usePortfolio } from '@/hooks/usePortfolio';
import { useAuthReady } from '@/hooks/useSubscription';
import { Card } from '@/components/shared/Card';
import { FactorBar } from '@/components/factors/FactorBar';
import { SignalTiming } from '@/components/factors/SignalTiming';
import { MethodConsensus } from '@/components/factors/MethodConsensus';
import { ContributionWaterfall } from '@/components/factors/ContributionWaterfall';
import { Button } from '@/components/shared/Button';
import { SkeletonFactorsPage } from '@/components/shared/LoadingSkeleton';
import { useFactorsByCategory, useRefreshFactors, FACTOR_CATEGORY_LABELS, FACTOR_CATEGORY_DESCRIPTIONS } from '@/hooks/useFactors';
import { DataLoadError, NoFactorData, EmptyState } from '@/components/shared/EmptyState';
import type { FactorExposureWithCategory } from '@/api/factors';

const CATEGORY_ICONS: Record<string, typeof TrendingUp> = { style: TrendingUp, macro: Globe, sector: Layers, volatility: Activity, sentiment: MessageSquare };
const CATEGORY_ORDER = ['style', 'macro', 'sector', 'volatility', 'sentiment'];
const EXAMPLE_SYMBOLS = ['NVDA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN'];

function FactorCategoryCard({ category, factors }: { category: string; factors: FactorExposureWithCategory[] }) {
  const Icon = CATEGORY_ICONS[category] || TrendingUp;
  if (factors.length === 0) return null;
  return <Card>
    <div className="mb-4 flex items-start gap-2.5 border-b border-[var(--color-border-light)] pb-3"><Icon size={17} className="mt-0.5 shrink-0 text-[var(--color-accent-text)]" aria-hidden="true" /><div><h3 className="text-sm font-semibold text-[var(--color-text)]">{FACTOR_CATEGORY_LABELS[category]}</h3><p className="mt-1 text-xs text-[var(--color-text-muted)]">{FACTOR_CATEGORY_DESCRIPTIONS[category]}</p></div></div>
    <div className="divide-y divide-[var(--color-border-light)]">{[...factors].sort((a,b) => Math.abs(b.exposure) - Math.abs(a.exposure)).map((factor,index) => <div key={`${factor.symbol ?? 'agg'}-${factor.factor}-${index}`} className="py-3 first:pt-0 last:pb-0">{factor.symbol && <p className="mb-1.5 text-xs font-semibold text-[var(--color-text-secondary)]">{factor.symbol}</p>}<FactorBar factor={factor} showCategory={false} /></div>)}</div>
  </Card>;
}

export function Factors() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const authReady = useAuthReady();
  const queryClient = useQueryClient();
  const { data: portfolio, isLoading: portfolioLoading, isError: portfolioError, refetch: refetchPortfolio } = usePortfolio({ retry: false });
  const usingExampleUniverse = !authReady;
  // An empty or failed personal portfolio must never silently become a demo.
  const symbols = useMemo(() => usingExampleUniverse ? [...EXAMPLE_SYMBOLS] : [...new Set(portfolio?.positions?.map(p => p.symbol) || [])], [portfolio, usingExampleUniverse]);
  const { data: factorsByCategory, isLoading: factorsLoading, isError: factorsError, refetch: refetchFactors, insight, lastUpdated } = useFactorsByCategory(symbols);
  const { mutate: refreshFactors, isPending: isRefreshing, isError: refreshError } = useRefreshFactors();
  const isLoading = portfolioLoading || factorsLoading;
  const allFactors = useMemo(() => Object.values(factorsByCategory).flat(), [factorsByCategory]);
  const totalFactors = allFactors.length;
  const significantFactors = allFactors.filter(f => Math.abs(f.tStat) > 1.96).length;
  const displayCategories = selectedCategory ? [selectedCategory] : CATEGORY_ORDER;
  const captureDate = lastUpdated ? new Date(lastUpdated) : null;
  const validCapture = captureDate && Number.isFinite(captureDate.getTime()) ? captureDate : null;
  const noCategoryResults = selectedCategory && totalFactors > 0 && (factorsByCategory[selectedCategory]?.length ?? 0) === 0;
  const handleRefresh = () => refreshFactors(symbols, { onSuccess: () => {
    void queryClient.invalidateQueries({ queryKey: ['factors', 'saliency'] });
    void queryClient.invalidateQueries({ queryKey: ['explain', 'methods'] });
  } });

  return <div className="space-y-4" data-testid="visual-factors-ready">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-border)] pb-4">
      <div><p className="mb-1 text-xs font-medium text-[var(--color-text-muted)]">Research / Factor exposure</p><div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">Factor analysis</h1></div><p className="mt-1 text-sm text-[var(--color-text-secondary)]">Compare exposures, statistical significance, and contribution by holding.</p></div>
      <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing || isLoading || symbols.length === 0 || portfolioError} leftIcon={<RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} />}>{isRefreshing ? 'Refreshing…' : 'Refresh factors'}</Button>
    </header>
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--color-text-secondary)]"><p><span className="font-semibold">{usingExampleUniverse ? 'Example watchlist' : 'Your portfolio'}</span>{symbols.length > 0 && <> · {symbols.join(', ')}</>}</p><Link to={usingExampleUniverse ? '/login' : '/portfolio'} className="font-medium text-[var(--color-accent-text)] hover:underline">{usingExampleUniverse ? 'Sign in for your holdings' : 'Manage holdings'}</Link></div>
    {!isLoading && !portfolioError && !factorsError && <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-border-light)] md:grid-cols-4">{[['Factor readings', totalFactors], ['Statistically significant', significantFactors], ['Holdings', symbols.length], ['Last response', validCapture ? validCapture.toLocaleTimeString() : 'Not available']].map(([label,value]) => <div key={label} className="bg-[var(--color-bg-secondary)] px-4 py-3"><dt className="text-xs text-[var(--color-text-muted)]">{label}</dt><dd className="mt-1 text-lg font-semibold tabular-nums text-[var(--color-text)]">{value}</dd></div>)}</dl>}
    <div className="flex flex-wrap gap-1.5" aria-label="Factor category filters"><Button variant={selectedCategory === null ? 'primary' : 'outline'} size="sm" onClick={() => setSelectedCategory(null)} aria-pressed={selectedCategory === null}>All categories</Button>{CATEGORY_ORDER.map(category => <Button key={category} variant={selectedCategory === category ? 'primary' : 'outline'} size="sm" onClick={() => setSelectedCategory(category)} aria-pressed={selectedCategory === category}>{FACTOR_CATEGORY_LABELS[category]} <span className="tabular-nums opacity-70">{factorsByCategory[category]?.length || 0}</span></Button>)}</div>
    {refreshError && <p role="alert" className="rounded-md border border-[var(--color-negative)]/25 p-3 text-sm text-[var(--color-negative)]">The refresh failed. Displayed readings may be from the previous response. Try refreshing again.</p>}
    {isLoading && <SkeletonFactorsPage />}
    {!isLoading && portfolioError && <Card><DataLoadError onRetry={() => refetchPortfolio()} error="Unable to load your portfolio holdings" /></Card>}
    {!isLoading && !portfolioError && factorsError && <Card><DataLoadError onRetry={() => refetchFactors()} error="Failed to load factor data" /></Card>}
    {!isLoading && !portfolioError && !factorsError && symbols.length === 0 && <EmptyState icon={<Layers size={28} />} title="No positions in your portfolio" description="Add positions to review their factor exposures." />}
    {!isLoading && !portfolioError && !factorsError && symbols.length > 0 && totalFactors === 0 && <Card><NoFactorData /></Card>}
    {!isLoading && !portfolioError && !factorsError && noCategoryResults && <Card><div className="py-5 text-center"><p className="mb-3 text-sm text-[var(--color-text-secondary)]">No readings in this category for the selected holdings.</p><Button variant="outline" size="sm" onClick={() => setSelectedCategory(null)} className="mx-auto">Show all categories</Button></div></Card>}
    {!isLoading && !portfolioError && !factorsError && totalFactors > 0 && <><div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{displayCategories.map(category => <FactorCategoryCard key={category} category={category} factors={factorsByCategory[category] || []} />)}</div><ContributionWaterfall factors={allFactors} /></>}
    {!isLoading && !portfolioError && !factorsError && symbols.length > 0 && <div className="grid grid-cols-1 gap-4 lg:grid-cols-2"><SignalTiming symbols={symbols} /><MethodConsensus symbols={symbols} /></div>}
    {insight && !factorsError && <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4"><h2 className="mb-2 text-sm font-semibold text-[var(--color-text)]">Analysis summary</h2><p className="text-sm leading-6 text-[var(--color-text-secondary)]">{insight}</p></section>}
  </div>;
}
