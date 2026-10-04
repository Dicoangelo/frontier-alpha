import { useState, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import { Plus, SlidersHorizontal, ArrowRightLeft } from 'lucide-react';
import { useQuotes } from '@/hooks/useQuotes';
import { useAuthStore } from '@/stores/authStore';
import { portfolioApi } from '@/api/portfolio';
import { usePortfolio } from '@/hooks/usePortfolio';
import { PortfolioOverview } from '@/components/portfolio/PortfolioOverview';
import { PositionList } from '@/components/portfolio/PositionList';
import { FactorExposures } from '@/components/factors/FactorExposures';
import { RiskMetrics } from '@/components/risk/RiskMetrics';
import { CognitiveInsight } from '@/components/explainer/CognitiveInsight';
import { FactorDeltas } from '@/components/explainer/FactorDeltas';
import { EquityCurve } from '@/components/charts/EquityCurve';
import { WeightAllocation } from '@/components/portfolio/WeightAllocation';
import { SkeletonDashboard } from '@/components/shared/Skeleton';
import { EmptyPortfolio, DataLoadError } from '@/components/shared/EmptyState';
import { PullToRefresh } from '@/components/shared/PullToRefresh';
import { MarketStatusStrip } from '@/components/dashboard/MarketStatusStrip';
import { DashZone } from '@/components/dashboard/DashZone';
import { getDisplayName } from '@/lib/getDisplayName';
import { type DataSource, EMPTY, wrapReal } from '@/lib/dataSource';
import { DEMO_HOLDINGS, DEMO_CASH, DEMO_TOTAL_VALUE, DEMO_FACTORS } from '@/lib/demoFixtures';
import { aggregatePortfolioFactors } from '@/lib/aggregateFactors';
import { markPortfolio } from '@/lib/markPortfolio';
import { useFeedStatus } from '@/hooks/useFeedStatus';
import { useEquityHistory } from '@/hooks/useEquityHistory';
import './dashboard-saas.css';

// Types
interface Position {
  symbol: string;
  shares: number;
  weight: number;
  costBasis: number;
  currentPrice: number;
  unrealizedPnL: number;
}

interface Portfolio {
  id: string;
  name: string;
  positions: Position[];
  cash: number;
  totalValue: number;
  currency: string;
}

interface FactorExposure {
  factor: string;
  exposure: number;
  tStat: number;
  confidence: number;
  contribution: number;
}

interface RiskMetricsData {
  sharpeRatio: number;
  volatility: number;
  maxDrawdown: number;
  beta: number;
  var95: number;
  cvar95: number;
}

// Default empty state
const EMPTY_PORTFOLIO: Portfolio = {
  id: '',
  name: 'Loading...',
  positions: [],
  cash: 0,
  totalValue: 0,
  currency: 'USD',
};

const EMPTY_FACTORS: FactorExposure[] = [];

// EMPTY_METRICS removed v1.3.2 — calculateMetrics() now returns null when
// data is too sparse, and the caller wraps in EMPTY (DataSource discriminated
// union) instead of seeding zeros that looked real to the user.

// Greeting based on time of day
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

// Use the shared API client so factor requests honor VITE_API_URL and the
// current session in the same way as the canonical portfolio query.
async function fetchFactors(symbols: string[], isAuthenticated: boolean): Promise<FactorExposure[]> {
  if (symbols.length === 0) return [];
  try {
    return aggregatePortfolioFactors(await portfolioApi.getFactors(symbols), symbols);
  } catch {
    // Illustrative fallback belongs only to the anonymous preview.
    return isAuthenticated ? [] : getDemoFactors();
  }
}

/**
 * Compute Risk Metrics, or `null` when factor data is too sparse to derive
 * an honest answer. v1.3.2: previously fell back to vol=0.18 / beta=1.0
 * defaults when factors were missing — that surfaced "Sharpe 0.28 ·
 * Drawdown -27%" looking like real numbers for a fresh single-position
 * account whose factors hadn't been computed yet. Now the caller wraps the
 * result in `EMPTY` instead, and the RiskMetrics component shows its
 * insufficient-data placeholder.
 */
function calculateMetrics(portfolio: Portfolio, factors: FactorExposure[]): RiskMetricsData | null {
  // Calculate metrics from portfolio and factors
  const positions = portfolio.positions;

  if (positions.length === 0) {
    return null;
  }

  // Need both market AND volatility factors to compute honest metrics.
  // Without them we'd be inventing values — show the empty state instead.
  const marketFactor = factors.find(f => f.factor === 'market');
  const volFactor = factors.find(f => f.factor === 'volatility');
  if (!marketFactor || !volFactor) {
    return null;
  }

  const beta = marketFactor.exposure;
  const volatility = volFactor.contribution;

  // Sharpe ratio estimate
  const expectedReturn = 0.10 + (beta - 1) * 0.05;  // Simple CAPM estimate
  const riskFreeRate = 0.05;  // 5% risk-free
  const sharpeRatio = volatility > 0 ? (expectedReturn - riskFreeRate) / volatility : 0;

  // VaR and CVaR (95%)
  const var95 = volatility * 1.645 / Math.sqrt(252);  // Daily VaR
  const cvar95 = volatility * 2.063 / Math.sqrt(252);  // Daily CVaR (assuming normal)

  // Max drawdown estimate from volatility
  const maxDrawdown = -Math.min(0.5, volatility * 1.5);

  return {
    sharpeRatio: Math.round(sharpeRatio * 100) / 100,
    volatility: Math.round(volatility * 1000) / 1000,
    maxDrawdown: Math.round(maxDrawdown * 1000) / 1000,
    beta: Math.round(beta * 100) / 100,
    var95: Math.round(var95 * 10000) / 10000,
    cvar95: Math.round(cvar95 * 10000) / 10000,
  };
}

// Generate cognitive insight from factors
function generateInsight(factors: FactorExposure[]): string {
  if (factors.length === 0) {
    return 'Connect your portfolio to see factor analysis and insights.';
  }

  const insights: string[] = [];

  // Find dominant factors
  const topFactor = factors[0];
  if (topFactor) {
    const direction = topFactor.exposure > 0 ? 'positive' : 'negative';
    insights.push(
      `Your portfolio has ${direction} ${topFactor.factor.replace('_', ' ')} exposure (${topFactor.exposure.toFixed(2)}).`
    );
  }

  // Momentum insight
  const momentum = factors.find(f => f.factor.includes('momentum'));
  if (momentum && Math.abs(momentum.exposure) > 0.5) {
    insights.push(
      momentum.exposure > 0
        ? 'Strong momentum exposure performs well in trending markets but may underperform during reversals.'
        : 'Negative momentum exposure suggests contrarian positioning.'
    );
  }

  // Quality insight
  const quality = factors.find(f => ['roe', 'roa', 'gross_margin'].includes(f.factor));
  if (quality && quality.exposure > 0.5) {
    insights.push('High quality exposure provides downside protection during market stress.');
  }

  // Sector concentration
  const sectorFactors = factors.filter(f => f.factor.startsWith('sector_') && f.exposure > 0.5);
  if (sectorFactors.length === 1) {
    const sector = sectorFactors[0].factor.replace('sector_', '').replace('_', ' ');
    insights.push(`Consider diversifying beyond ${sector} to reduce sector concentration.`);
  }

  return insights.slice(0, 3).join(' ');
}

// Demo data for unauthenticated users — sourced from the shared golden-state
// fixtures so the Dashboard preview matches the Portfolio page exactly.
function getDemoPortfolio(): Portfolio {
  return {
    id: 'demo',
    name: 'Demo Portfolio',
    positions: DEMO_HOLDINGS.map((h) => ({ ...h })),
    cash: DEMO_CASH,
    totalValue: DEMO_TOTAL_VALUE,
    currency: 'USD',
  };
}

function getDemoFactors(): FactorExposure[] {
  return DEMO_FACTORS.map((f) => ({ ...f }));
}

// Quick action pill component
function QuickAction({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-2 px-3 py-2 min-h-10 rounded-lg text-sm font-medium
        bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]
        border border-[var(--color-border-light)]
        hover:border-[var(--color-accent)] hover:text-[var(--color-accent-text)]
        transition-[border-color,color,background-color] duration-150"
    >
      {icon}
      {label}
    </Link>
  );
}

export function Dashboard() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isReady = useAuthStore((s) => s.isReady);
  const session = useAuthStore((s) => s.session);
  const isAuthenticated = Boolean(session?.access_token);
  const portfolioQuery = usePortfolio({ retry: false });
  const [chartExpanded, setChartExpanded] = useState(false);

  // Dashboard and Portfolio must render the same saved snapshot. An empty or
  // failed account never acquires positions from a demo/import preview.
  const portfolioSnapshot = useMemo<Portfolio>(() => {
    if (!isReady) return EMPTY_PORTFOLIO;
    if (!isAuthenticated) return getDemoPortfolio();
    return portfolioQuery.data
      ? { ...portfolioQuery.data, currency: portfolioQuery.data.currency ?? 'USD' }
      : { ...EMPTY_PORTFOLIO, name: 'My Portfolio' };
  }, [isReady, isAuthenticated, portfolioQuery.data]);

  const symbols = useMemo(() => portfolioSnapshot.positions.map(p => p.symbol), [portfolioSnapshot]);
  const { quotes, isConnected, lastUpdate } = useQuotes(symbols);
  const portfolio = useMemo(() => markPortfolio(portfolioSnapshot, quotes), [portfolioSnapshot, quotes]);
  const feed = useFeedStatus();
  const equity = useEquityHistory(portfolio.positions, portfolio.cash);
  const factorsEnabled = isReady && (!isAuthenticated || portfolioQuery.isSuccess) && symbols.length > 0;
  const factorsQuery = useQuery({
    queryKey: ['dashboard-factors', session?.user?.id ?? null, symbols],
    queryFn: () => fetchFactors(symbols, isAuthenticated),
    enabled: factorsEnabled,
    retry: false,
  });
  const factors = factorsQuery.data ?? EMPTY_FACTORS;
  const metrics = useMemo<DataSource<RiskMetricsData>>(() => {
    const calculated = calculateMetrics(portfolio, factors);
    return calculated ? wrapReal(calculated) : EMPTY;
  }, [portfolio, factors]);
  const insight = generateInsight(factors);
  const isLoading = !isReady || (isAuthenticated && portfolioQuery.isPending) || (factorsEnabled && factorsQuery.isPending);
  const error = isAuthenticated && portfolioQuery.error
    ? portfolioQuery.error.message || 'Failed to load portfolio'
    : null;

  const loadPortfolioData = useCallback(async () => {
    if (isAuthenticated) await portfolioQuery.refetch();
    if (factorsEnabled) await factorsQuery.refetch();
  }, [isAuthenticated, portfolioQuery, factorsEnabled, factorsQuery]);

  // Show skeleton while loading. Render inside the SAME PullToRefresh +
  // pt-6 chrome the loaded view uses, so the only thing that swaps is
  // skeleton-shimmer -> content within identically-sized boxes.
  if (isLoading) {
    return (
      <div className="dashboard-workspace min-h-screen">
        <SkeletonDashboard />
      </div>
    );
  }

  // Show error state with retry
  if (error) {
    return (
      <div className="min-h-[400px] flex items-center justify-center animate-fade-in">
        <DataLoadError onRetry={loadPortfolioData} error={error} />
      </div>
    );
  }

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  // Show empty state if no positions. Keep the greeting + quick actions row
  // visible above so the page never feels blank, but hide every card that
  // would otherwise render synthesized numbers (Risk Metrics, AI Insights,
  // Holdings, Equity curve).
  if (portfolio.positions.length === 0 && portfolio.id !== 'demo') {
    return (
      <PullToRefresh onRefresh={loadPortfolioData} className="dashboard-workspace min-h-screen">
        <div
          className="desk-content transition-opacity duration-200 ease-out"
        >
          {/* Hero Header — Greeting + Quick Actions (kept visible per US-005) */}
          <div className="desk-page-header">
            <div>
              <h1 className="text-xl lg:text-2xl font-semibold tracking-tight">
                <span className="text-[var(--color-text)]">Portfolio overview</span>
              </h1>
              <p className="text-sm text-[var(--color-text-muted)] mt-1">{getGreeting()}, {getDisplayName(user?.email)}. {today}.</p>
              <div className="desk-quick-actions">
                <QuickAction to="/portfolio" icon={<Plus className="w-4 h-4" />} label="Add position" />
                <QuickAction to="/optimize" icon={<SlidersHorizontal className="w-4 h-4" />} label="Optimize" />
                <QuickAction to="/trade" icon={<ArrowRightLeft className="w-4 h-4" />} label="Trade" />
              </div>
            </div>
          </div>

          <PortfolioOverview portfolio={portfolio} />
          <div className="animate-fade-in-up" style={{ animationDelay: '50ms', animationFillMode: 'both' }}>
            <EmptyPortfolio onAddPosition={() => navigate('/portfolio')} showDemoAction={!isAuthenticated} />
          </div>
        </div>
      </PullToRefresh>
    );
  }

  return (
    <PullToRefresh onRefresh={loadPortfolioData} className="dashboard-workspace min-h-screen">
      <div className="dashboard-market-status">
        <MarketStatusStrip
          isConnected={isConnected}
          lastUpdate={lastUpdate ? lastUpdate.getTime() : null}
        />
      </div>
      <div
        className="desk-content transition-opacity duration-200 ease-out"
        data-testid="visual-dashboard-ready"
      >

        <div className="desk-page-header">
          <div>
            <h1 className="text-xl lg:text-2xl font-semibold tracking-tight text-[var(--color-text)]">Portfolio overview</h1>
            <div className="desk-header-caption">
              <p>{getGreeting()}, {getDisplayName(user?.email)}. {today}.</p>
          <div
            className="desk-feed-status"
          >
            <span
              className={`inline-block w-2 h-2 rounded-full transition-colors duration-300 ${
                isConnected
                  ? 'bg-[var(--color-positive)]'
                  : 'bg-[var(--color-text-muted)]'
              }`}
            />
            <span
              className={`text-xs font-medium transition-colors duration-300 inline-block ${feed.tone === 'live' ? 'text-[var(--color-positive)]' : feed.tone === 'delayed' ? 'text-[var(--color-warning)]' : 'text-[var(--color-text-muted)]'}`}
              title={feed.aria}
            >
              {feed.label}
            </span>
            <span
              className="text-xs text-[var(--color-text-muted)] border-l border-[var(--color-border-light)] pl-2 ml-0.5 tabular-nums inline-block min-w-[64px]"
              aria-live="off"
            >
              {lastUpdate
                ? lastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                : ' '}
            </span>
          </div>
            </div>
          </div>
          <div className="desk-quick-actions">
            <QuickAction to="/portfolio" icon={<Plus className="w-4 h-4" />} label="Add position" />
            <QuickAction to="/optimize" icon={<SlidersHorizontal className="w-4 h-4" />} label="Optimize" />
            <QuickAction to="/trade" icon={<ArrowRightLeft className="w-4 h-4" />} label="Trade" />
          </div>
        </div>

        <div data-tour="portfolio-overview">
          <PortfolioOverview portfolio={portfolio} />
        </div>

        <div className={`desk-chart-grid${chartExpanded ? ' desk-chart-grid-expanded' : ''}`}>
          <div data-tour="equity-curve" className="min-w-0">
            <EquityCurve
              portfolioValue={portfolio.totalValue}
              series={equity.series}
              seriesStatus={equity.status}
              expanded={chartExpanded}
              onToggleExpand={() => setChartExpanded(value => !value)}
            />
          </div>
          <div data-tour="weight-allocation" className="min-w-0" hidden={chartExpanded}>
            <WeightAllocation positions={portfolio.positions} />
          </div>
        </div>

        <div data-tour="positions">
          <PositionList positions={portfolio.positions} quotes={quotes} />
        </div>

        {/* Tertiary zone — collapsible analytics */}
        <DashZone
          id="analytics"
          title="Portfolio analysis"
          subtitle="Factor exposures, risk metrics, and portfolio insights"
          weight="tertiary"
          collapsible
          className="dashboard-zone animate-fade-in-up"
        >
          {/* Tertiary tiles — match skeleton min-h so async cognitive-insight
              fetch can't push the page footer when it lands. */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div data-tour="factors" className="min-h-[280px]">
              <FactorExposures factors={factors} insight={insight} />
            </div>
            <div data-tour="risk-metrics" className="min-h-[280px]">
              <RiskMetrics metrics={metrics} />
            </div>
            {/* CognitiveInsight + FactorDeltas (DASH3-005) share the third
                column. FactorDeltas is intentionally a sibling to the GPT-4o
                explainer so the user reads "what's currently happening" and
                "what changed" in the same visual zone. */}
            <div className="space-y-5">
              <div data-tour="cognitive-insight" className="min-h-[280px]">
                <CognitiveInsight symbols={portfolio.positions.map((p) => p.symbol)} factors={factors} />
              </div>
              <div data-tour="factor-deltas" className="min-h-[280px]">
                <FactorDeltas
                  portfolioId={portfolio.id}
                  symbols={portfolio.positions.map((p) => p.symbol)}
                />
              </div>
            </div>
          </div>
        </DashZone>
      </div>
    </PullToRefresh>
  );
}
