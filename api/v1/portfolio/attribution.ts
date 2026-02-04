import type { VercelRequest, VercelResponse } from '@vercel/node';
import { PerformanceAttribution } from '../../../src/analytics/PerformanceAttribution';

interface PortfolioPosition {
  symbol: string;
  shares: number;
  weight: number;
  costBasis: number;
  currentPrice: number;
}

// Fetch historical returns from Polygon
async function fetchHistoricalReturns(
  symbol: string,
  days: number,
  apiKey: string
): Promise<number | null> {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const from = startDate.toISOString().split('T')[0];
    const to = endDate.toISOString().split('T')[0];

    const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${from}/${to}?adjusted=true&sort=asc&apiKey=${apiKey}`;

    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    if (data.status !== 'OK' || !data.results || data.results.length < 2) {
      return null;
    }

    const firstClose = data.results[0].c;
    const lastClose = data.results[data.results.length - 1].c;

    return (lastClose - firstClose) / firstClose;
  } catch (error) {
    console.error(`Failed to fetch returns for ${symbol}:`, error);
    return null;
  }
}

// Generate mock returns based on symbol hash
function generateMockReturn(symbol: string, days: number): number {
  const hash = symbol.split('').reduce((a, b) => a + b.charCodeAt(0), 0);

  // Base return scaled by period
  const annualReturn = (hash % 30 - 10) / 100; // -10% to +20%
  const periodReturn = annualReturn * (days / 365);

  // Add some volatility
  const volatility = (hash % 10) / 100;
  const noise = (Math.sin(hash * days) * volatility) / 2;

  return periodReturn + noise;
}

// Benchmark returns by period (S&P 500 approximation)
const BENCHMARK_RETURNS: Record<string, number> = {
  '1W': 0.005,
  '1M': 0.02,
  '3M': 0.05,
  '6M': 0.08,
  '1Y': 0.12,
  YTD: 0.08,
};

const PERIOD_DAYS: Record<string, number> = {
  '1W': 7,
  '1M': 30,
  '3M': 90,
  '6M': 180,
  '1Y': 365,
  YTD: Math.floor(
    (new Date().getTime() - new Date(new Date().getFullYear(), 0, 1).getTime()) /
      (1000 * 60 * 60 * 24)
  ),
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const start = Date.now();
  const period = (req.query.period as string) || '1M';
  const days = PERIOD_DAYS[period] || 30;

  // Get portfolio positions from request body or query
  let positions: PortfolioPosition[] = [];

  if (req.method === 'POST' && req.body?.positions) {
    positions = req.body.positions;
  } else {
    // Use symbols from query or default demo positions
    const symbolsParam = req.query.symbols as string;
    const symbols = symbolsParam
      ? symbolsParam.split(',').map((s) => s.trim().toUpperCase())
      : ['NVDA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN'];

    positions = symbols.map((symbol, i) => ({
      symbol,
      shares: 100,
      weight: 1 / symbols.length,
      costBasis: 100,
      currentPrice: 100,
    }));
  }

  const polygonKey = process.env.POLYGON_API_KEY;
  let source = 'mock';

  // Calculate returns for each position
  const portfolioPositions = await Promise.all(
    positions.map(async (pos) => {
      let periodReturn: number | null = null;

      // Try real data in production
      if (polygonKey && process.env.NODE_ENV === 'production') {
        periodReturn = await fetchHistoricalReturns(pos.symbol, days, polygonKey);
        if (periodReturn !== null) {
          source = 'polygon';
        }
      }

      // Fall back to mock
      if (periodReturn === null) {
        periodReturn = generateMockReturn(pos.symbol, days);
      }

      return {
        symbol: pos.symbol,
        weight: pos.weight,
        return: periodReturn,
      };
    })
  );

  // Generate benchmark positions (sector-based)
  const SECTOR_MAP: Record<string, string> = {
    NVDA: 'Technology',
    AAPL: 'Technology',
    MSFT: 'Technology',
    GOOGL: 'Technology',
    META: 'Technology',
    AMD: 'Technology',
    AMZN: 'Consumer Discretionary',
    TSLA: 'Consumer Discretionary',
    JPM: 'Financials',
    V: 'Financials',
    JNJ: 'Healthcare',
    UNH: 'Healthcare',
  };

  const BENCHMARK_SECTOR_WEIGHTS: Record<string, number> = {
    Technology: 0.28,
    Financials: 0.13,
    Healthcare: 0.13,
    'Consumer Discretionary': 0.10,
    'Consumer Staples': 0.07,
    Industrials: 0.09,
    Energy: 0.05,
    Materials: 0.03,
    Utilities: 0.03,
    'Real Estate': 0.03,
    Communications: 0.06,
  };

  const benchmarkReturn = BENCHMARK_RETURNS[period] || 0.02;
  const benchmarkPositions = Object.entries(BENCHMARK_SECTOR_WEIGHTS).map(([sector, weight]) => ({
    symbol: sector,
    weight,
    return: benchmarkReturn * (0.8 + Math.random() * 0.4), // Vary by sector
    sector,
  }));

  // Factor exposures (from portfolio characteristics)
  const techWeight = portfolioPositions
    .filter((p) => ['NVDA', 'AAPL', 'MSFT', 'GOOGL', 'META', 'AMD'].includes(p.symbol))
    .reduce((sum, p) => sum + p.weight, 0);

  const factorExposures = [
    { factor: 'market', exposure: 1.0 + (techWeight - 0.28) * 0.3 },
    { factor: 'momentum', exposure: 0.2 + techWeight * 0.3 },
    { factor: 'quality', exposure: 0.15 + techWeight * 0.2 },
    { factor: 'size', exposure: -0.1 - techWeight * 0.2 }, // Tech tends large cap
    { factor: 'value', exposure: -0.1 - techWeight * 0.3 }, // Tech tends growth
  ];

  // Factor returns for the period
  const factorReturns: Record<string, number> = {
    market: benchmarkReturn,
    momentum: benchmarkReturn * 0.8,
    quality: benchmarkReturn * 0.5,
    size: benchmarkReturn * -0.3,
    value: benchmarkReturn * 0.2,
  };

  // Calculate attribution
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const attribution = PerformanceAttribution.calculateAttribution(
    portfolioPositions.map((p) => ({
      ...p,
      sector: SECTOR_MAP[p.symbol] || 'Other',
    })),
    benchmarkPositions,
    factorExposures,
    factorReturns,
    {
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0],
      label: period,
    }
  );

  return res.status(200).json({
    success: true,
    data: attribution,
    meta: {
      timestamp: new Date().toISOString(),
      requestId: `req-${Math.random().toString(36).slice(2, 8)}`,
      latencyMs: Date.now() - start,
      source,
      period,
      positionCount: positions.length,
    },
  });
}
