import { useEffect, useState, useCallback } from 'react';
import { wsClient } from '@/api/websocket';
import { useQuotesStore } from '@/stores/quotesStore';
import { PortfolioOverview } from '@/components/portfolio/PortfolioOverview';
import { PositionList } from '@/components/portfolio/PositionList';
import { FactorExposures } from '@/components/factors/FactorExposures';
import { RiskMetrics } from '@/components/risk/RiskMetrics';
import { CognitiveInsight } from '@/components/explainer/CognitiveInsight';
import { EquityCurve } from '@/components/charts/EquityCurve';
import { SkeletonDashboard } from '@/components/shared/Skeleton';
import { EmptyPortfolio, DataLoadError } from '@/components/shared/EmptyState';

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

const EMPTY_METRICS: RiskMetricsData = {
  sharpeRatio: 0,
  volatility: 0,
  maxDrawdown: 0,
  beta: 0,
  var95: 0,
  cvar95: 0,
};

// API functions
async function fetchPortfolio(): Promise<Portfolio | null> {
  try {
    const token = localStorage.getItem('supabase_token');
    const response = await fetch('/api/v1/portfolio', {
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        console.log('Not authenticated, using demo portfolio');
        return getDemoPortfolio();
      }
      throw new Error(`Portfolio fetch failed: ${response.status}`);
    }

    const data = await response.json();
    return data.portfolio || data;
  } catch (error) {
    console.error('Failed to fetch portfolio:', error);
    return getDemoPortfolio();
  }
}

async function fetchFactors(symbols: string[]): Promise<FactorExposure[]> {
  if (symbols.length === 0) return [];

  try {
    const response = await fetch(`/api/v1/portfolio/factors/${symbols.join(',')}`);
    if (!response.ok) {
      throw new Error(`Factor fetch failed: ${response.status}`);
    }

    const data = await response.json();

    // Convert API response to array format
    // API returns: { symbol: FactorExposure[], ... }
    // We want portfolio-level aggregate
    const factorTotals = new Map<string, { exposure: number; tStat: number; contribution: number; count: number }>();

    for (const symbol of symbols) {
      const symbolFactors = data[symbol] || [];
      for (const f of symbolFactors) {
        const existing = factorTotals.get(f.factor) || { exposure: 0, tStat: 0, contribution: 0, count: 0 };
        factorTotals.set(f.factor, {
          exposure: existing.exposure + f.exposure,
          tStat: existing.tStat + f.tStat,
          contribution: existing.contribution + f.contribution,
          count: existing.count + 1,
        });
      }
    }

    // Average across symbols
    const aggregated: FactorExposure[] = [];
    for (const [factor, totals] of factorTotals) {
      aggregated.push({
        factor,
        exposure: totals.exposure / totals.count,
        tStat: totals.tStat / totals.count,
        confidence: Math.min(Math.abs(totals.tStat / totals.count) / 2, 1),
        contribution: totals.contribution / totals.count,
      });
    }

    // Sort by absolute exposure
    return aggregated.sort((a, b) => Math.abs(b.exposure) - Math.abs(a.exposure)).slice(0, 10);
  } catch (error) {
    console.error('Failed to fetch factors:', error);
    return getDemoFactors();
  }
}

function calculateMetrics(portfolio: Portfolio, factors: FactorExposure[]): RiskMetricsData {
  // Calculate metrics from portfolio and factors
  const positions = portfolio.positions;

  if (positions.length === 0) {
    return EMPTY_METRICS;
  }

  // Beta: weighted average of position betas (use market factor if available)
  const marketFactor = factors.find(f => f.factor === 'market');
  const beta = marketFactor?.exposure || 1.0;

  // Volatility: use volatility factor or estimate from positions
  const volFactor = factors.find(f => f.factor === 'volatility');
  const volatility = volFactor?.contribution || 0.18;  // Default 18%

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

// Demo data for unauthenticated users
function getDemoPortfolio(): Portfolio {
  return {
    id: 'demo',
    name: 'Demo Portfolio',
    positions: [
      { symbol: 'NVDA', shares: 50, weight: 0.22, costBasis: 450, currentPrice: 520, unrealizedPnL: 3500 },
      { symbol: 'MSFT', shares: 30, weight: 0.18, costBasis: 380, currentPrice: 415, unrealizedPnL: 1050 },
      { symbol: 'AAPL', shares: 100, weight: 0.15, costBasis: 175, currentPrice: 195, unrealizedPnL: 2000 },
      { symbol: 'GOOGL', shares: 25, weight: 0.14, costBasis: 140, currentPrice: 165, unrealizedPnL: 625 },
      { symbol: 'AMZN', shares: 40, weight: 0.12, costBasis: 180, currentPrice: 205, unrealizedPnL: 1000 },
    ],
    cash: 15000,
    totalValue: 125000,
    currency: 'USD',
  };
}

function getDemoFactors(): FactorExposure[] {
  return [
    { factor: 'momentum_12m', exposure: 0.85, tStat: 2.31, confidence: 0.92, contribution: 0.04 },
    { factor: 'roe', exposure: 0.62, tStat: 1.89, confidence: 0.85, contribution: 0.02 },
    { factor: 'low_vol', exposure: -0.42, tStat: -1.45, confidence: 0.78, contribution: 0.01 },
    { factor: 'value', exposure: -0.28, tStat: -0.92, confidence: 0.65, contribution: -0.01 },
    { factor: 'sector_tech', exposure: 0.85, tStat: 8.5, confidence: 0.99, contribution: 0.05 },
  ];
}

export function Dashboard() {
  const quotes = useQuotesStore((state) => state.quotes);
  const updateQuote = useQuotesStore((state) => state.updateQuote);

  const [portfolio, setPortfolio] = useState<Portfolio>(EMPTY_PORTFOLIO);
  const [factors, setFactors] = useState<FactorExposure[]>(EMPTY_FACTORS);
  const [metrics, setMetrics] = useState<RiskMetricsData>(EMPTY_METRICS);
  const [insight, setInsight] = useState<string>('Loading portfolio data...');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch portfolio data
  const loadPortfolioData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Fetch portfolio
      const portfolioData = await fetchPortfolio();
      if (portfolioData) {
        setPortfolio(portfolioData);

        // Fetch factors for portfolio symbols
        const symbols = portfolioData.positions.map(p => p.symbol);
        const factorData = await fetchFactors(symbols);
        setFactors(factorData);

        // Calculate metrics
        const metricsData = calculateMetrics(portfolioData, factorData);
        setMetrics(metricsData);

        // Generate insight
        const insightText = generateInsight(factorData);
        setInsight(insightText);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load portfolio');
      // Fall back to demo data
      setPortfolio(getDemoPortfolio());
      setFactors(getDemoFactors());
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load portfolio data on mount
  useEffect(() => {
    loadPortfolioData();
  }, [loadPortfolioData]);

  // Connect WebSocket and subscribe to quotes
  useEffect(() => {
    if (portfolio.positions.length === 0) return;

    wsClient.connect();

    const symbols = portfolio.positions.map((p) => p.symbol);
    wsClient.subscribe(symbols);

    const unsubscribe = wsClient.on('quote', (quote: unknown) => {
      // Type assertion after validating quote structure
      if (quote && typeof quote === 'object' && 'symbol' in quote) {
        updateQuote(quote as import('@/types').Quote);
      }
    });

    return () => {
      unsubscribe();
      wsClient.disconnect();
    };
  }, [portfolio.positions, updateQuote]);

  // Update position prices when quotes change
  useEffect(() => {
    if (quotes.size === 0) return;

    setPortfolio(prev => {
      let totalValue = prev.cash;
      const updatedPositions = prev.positions.map(pos => {
        const quote = quotes.get(pos.symbol);
        if (quote) {
          const currentPrice = quote.last;
          const positionValue = pos.shares * currentPrice;
          totalValue += positionValue;
          return {
            ...pos,
            currentPrice,
            unrealizedPnL: (currentPrice - pos.costBasis) * pos.shares,
          };
        }
        totalValue += pos.shares * pos.currentPrice;
        return pos;
      });

      // Recalculate weights
      const positionsWithWeights = updatedPositions.map(pos => ({
        ...pos,
        weight: totalValue > 0 ? (pos.shares * pos.currentPrice) / totalValue : 0,
      }));

      return {
        ...prev,
        positions: positionsWithWeights,
        totalValue,
      };
    });
  }, [quotes]);

  // Show skeleton while loading
  if (isLoading) {
    return <SkeletonDashboard />;
  }

  // Show error state with retry
  if (error) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <DataLoadError onRetry={loadPortfolioData} error={error} />
      </div>
    );
  }

  // Show empty state if no positions
  if (portfolio.positions.length === 0 && portfolio.id !== 'demo') {
    return (
      <div className="min-h-[400px] flex items-center justify-center bg-white rounded-xl shadow-lg">
        <EmptyPortfolio onAddPosition={() => window.location.href = '/portfolio'} />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">

      <PortfolioOverview portfolio={portfolio} />

      <EquityCurve portfolioValue={portfolio.totalValue} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PositionList positions={portfolio.positions} quotes={quotes} />
        <FactorExposures factors={factors} insight={insight} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RiskMetrics metrics={metrics} />
        <CognitiveInsight symbols={portfolio.positions.map((p) => p.symbol)} factors={factors} />
      </div>
    </div>
  );
}
