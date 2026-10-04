import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Plus, SlidersHorizontal, ArrowRightLeft } from 'lucide-react';
import { useQuotes } from '@/hooks/useQuotes';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
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

// API functions
//
// v1.3.0: previously read `localStorage.getItem('supabase_token')` which is
// the WRONG key — Supabase JS stores the token under `sb-{projectRef}-auth-token`.
// Result: every authed user got a 401 and fell back to demo data, masking
// the real portfolio. Read the live session via the supabase SDK instead;
// it's already cached locally so this is a synchronous-feeling call.
async function fetchPortfolio(): Promise<Portfolio | null> {
  let signedIn = false;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    signedIn = Boolean(token);
    // Anonymous visitor: the endpoint can only 401. Go straight to the demo
    // fixture instead of logging a failed request on every public page load.
    if (!token) return getDemoPortfolio();
    const response = await fetch('/api/v1/portfolio', {
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        // Not authenticated — fall back to demo portfolio
        return getDemoPortfolio();
      }
      throw new Error(`Portfolio fetch failed: ${response.status}`);
    }

    const json = await response.json();
    // Server returns { success, data: { positions, cash, totalValue, ... }, meta }
    // — unwrap the envelope. Falls back to .portfolio (legacy shape) or the raw
    // body so callers and tests stay tolerant.
    return (json.data || json.portfolio || json) as Portfolio;
  } catch (error) {
    console.error('Failed to fetch portfolio:', error);
    // A signed-in user whose fetch failed (404 on a fresh account, 5xx, network)
    // must NEVER see the $125K demo fixture under a LIVE badge — that is what
    // every new account saw in production. Return null so the caller renders
    // the honest empty state; demo data is for anonymous visitors only.
    return signedIn ? null : getDemoPortfolio();
  }
}

async function fetchFactors(symbols: string[]): Promise<FactorExposure[]> {
  if (symbols.length === 0) return [];

  try {
    const response = await fetch(`/api/v1/portfolio/factors/${symbols.join(',')}`);
    if (!response.ok) {
      throw new Error(`Factor fetch failed: ${response.status}`);
    }

    const json: unknown = await response.json();

    // The server wraps the per-symbol map in { success, data }. Indexing the
    // envelope by symbol (the previous code) silently yielded nothing, which
    // blanked Factor Exposures, Risk Metrics and the AI Insight for every
    // visitor. `aggregatePortfolioFactors` unwraps and folds to a portfolio-
    // level top-10 (average across holdings, ranked by |exposure|).
    return aggregatePortfolioFactors(json, symbols);
  } catch (error) {
    console.error('Failed to fetch factors:', error);
    // Demo factors are for the anonymous preview only. A signed-in user whose
    // factor fetch failed gets an honest empty card, never fixture numbers.
    return useAuthStore.getState().session ? [] : getDemoFactors();
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
  const [portfolioSnapshot, setPortfolio] = useState<Portfolio>(EMPTY_PORTFOLIO);
  const [factors, setFactors] = useState<FactorExposure[]>(EMPTY_FACTORS);
  const [metrics, setMetrics] = useState<DataSource<RiskMetricsData>>(EMPTY);
  const [insight, setInsight] = useState<string>('Loading portfolio data...');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contentVisible, setContentVisible] = useState(false);

  // Real-time quote streaming via useQuotes hook
  const symbols = portfolioSnapshot.positions.map(p => p.symbol);
  const { quotes, isConnected, lastUpdate } = useQuotes(symbols);
  const portfolio = useMemo(() => markPortfolio(portfolioSnapshot, quotes), [portfolioSnapshot, quotes]);
  const feed = useFeedStatus();
  // Real equity history (holdings marked to cached daily closes). The chart
  // used to fall back to a seeded random walk when this was absent.
  const equity = useEquityHistory(portfolio.positions, portfolio.cash);

  // Fetch portfolio data
  const loadPortfolioData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Fetch portfolio
      let portfolioData = await fetchPortfolio();
      // v1.3.1: read auth state from authStore (already hydrated via US-003
      // isReady gate before this hook fires) — wrong-key localStorage check
      // was always returning false and forcing demo data even for authed users.
      const isAuthenticated = Boolean(useAuthStore.getState().session);

      // If empty portfolio, seed from imported_symbols (welcome handoff)
      // or analyze_symbols (raw landing flow). Authenticated users with no
      // positions see the empty state — never synthesized demo numbers.
      // Unauthenticated visitors fall back to the demo portfolio so the
      // dashboard remains a useful preview surface.
      if (!portfolioData || !portfolioData.positions || portfolioData.positions.length === 0) {
        const stored =
          localStorage.getItem('imported_symbols') ||
          localStorage.getItem('analyze_symbols');
        if (stored) {
          try {
            const symbols: string[] = JSON.parse(stored);
            if (Array.isArray(symbols) && symbols.length > 0) {
              const weight = 1 / symbols.length;
              portfolioData = {
                id: 'demo',
                name: 'Demo Portfolio',
                positions: symbols.map(s => ({
                  symbol: s,
                  shares: 100,
                  weight,
                  costBasis: 100,
                  currentPrice: 100,
                  unrealizedPnL: 0,
                })),
                cash: 10000,
                totalValue: symbols.length * 100 * 100 + 10000,
                currency: 'USD',
              };
            }
          } catch { /* ignore parse errors */ }
        }
        if (
          (!portfolioData || portfolioData.positions.length === 0) &&
          !isAuthenticated
        ) {
          portfolioData = getDemoPortfolio();
        }
        if (!portfolioData) {
          portfolioData = {
            ...EMPTY_PORTFOLIO,
            id: 'user',
            name: 'My Portfolio',
          };
        }
      }

      setPortfolio(portfolioData);

      // Fetch factors for portfolio symbols
      const symbols = portfolioData.positions.map(p => p.symbol);
      const factorData = await fetchFactors(symbols);
      setFactors(factorData);

      // Calculate metrics — wrap as `empty` when there are no positions
      // OR when factor data is too sparse to derive honest values.
      // calculateMetrics now returns null in both cases (v1.3.2). Otherwise
      // wrap as `real`. Synthesizing zeros / CAPM defaults into the
      // components has been the source of every "Sharpe 0.28 / Drawdown
      // -27%" leak on fresh accounts.
      const metricsData = calculateMetrics(portfolioData, factorData);
      setMetrics(metricsData ? wrapReal(metricsData) : EMPTY);

      // Generate insight
      const insightText = generateInsight(factorData);
      setInsight(insightText);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load portfolio');
      // Demo fallback is for UNAUTHENTICATED preview only. An authenticated
      // user whose portfolio fetch errored (e.g. upstream quote 500) must see
      // the honest error/empty state — the walkthrough on 2026-06-11 caught
      // this path rendering $125K synthetic numbers under a LIVE badge.
      if (useAuthStore.getState().session) {
        setPortfolio({ ...EMPTY_PORTFOLIO, id: 'user', name: 'My Portfolio' });
        setFactors(EMPTY_FACTORS);
      } else {
        setPortfolio(getDemoPortfolio());
        setFactors(getDemoFactors());
      }
      setMetrics(EMPTY);
    } finally {
      setIsLoading(false);
      // Trigger fade-in after a tick to allow DOM paint
      requestAnimationFrame(() => setContentVisible(true));
    }
  }, []);

  // Load portfolio data on mount
  useEffect(() => {
    loadPortfolioData();
  }, [loadPortfolioData]);

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
          style={{ opacity: contentVisible ? 1 : 0 }}
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

          <div className="animate-fade-in-up" style={{ animationDelay: '50ms', animationFillMode: 'both' }}>
            <EmptyPortfolio onAddPosition={() => navigate('/portfolio')} />
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
        style={{ opacity: contentVisible ? 1 : 0 }}
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

        <div className="desk-chart-grid">
          <div data-tour="equity-curve" className="min-w-0">
            <EquityCurve
              portfolioValue={portfolio.totalValue}
              series={equity.series}
              seriesStatus={equity.status}
            />
          </div>
          <div data-tour="weight-allocation" className="min-w-0">
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
