import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://rqidgeittsjkpkykmdrz.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface Position {
  symbol: string;
  shares: number;
  avg_cost: number;
}

interface RiskMetrics {
  var95: number;
  cvar95: number;
  sharpeRatio: number;
  sortinoRatio: number;
  volatility: number;
  maxDrawdown: number;
  beta: number;
  informationRatio: number;
  tailRisk: number;
  probPositive: number;
}

// Fetch historical prices from Polygon
async function fetchHistoricalPrices(
  symbols: string[],
  apiKey: string,
  days: number = 252
): Promise<Map<string, number[]>> {
  const pricesMap = new Map<string, number[]>();
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days * 1.5); // Account for weekends/holidays

  const promises = symbols.map(async (symbol) => {
    try {
      const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${startDate.toISOString().split('T')[0]}/${endDate.toISOString().split('T')[0]}?adjusted=true&sort=asc&limit=500&apiKey=${apiKey}`;

      const response = await fetch(url);
      if (!response.ok) return;

      const data = await response.json();
      if (data.results) {
        const closes = data.results.map((r: any) => r.c);
        pricesMap.set(symbol, closes);
      }
    } catch (error) {
      console.error(`Failed to fetch prices for ${symbol}:`, error);
    }
  });

  await Promise.all(promises);
  return pricesMap;
}

// Calculate daily returns from prices
function calculateReturns(prices: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
  }
  return returns;
}

// Calculate portfolio returns given positions and price returns
function calculatePortfolioReturns(
  positions: Position[],
  pricesMap: Map<string, number[]>
): number[] {
  // Get minimum length across all symbols
  const minLength = Math.min(
    ...positions.map(p => (pricesMap.get(p.symbol) || []).length)
  );

  if (minLength < 2) return [];

  // Calculate weights based on current values (use latest prices)
  const values: number[] = positions.map(p => {
    const prices = pricesMap.get(p.symbol) || [];
    const latestPrice = prices[prices.length - 1] || p.avg_cost;
    return p.shares * latestPrice;
  });

  const totalValue = values.reduce((a, b) => a + b, 0);
  const weights = values.map(v => v / totalValue);

  // Calculate portfolio returns
  const portfolioReturns: number[] = [];

  for (let i = 1; i < minLength; i++) {
    let portfolioReturn = 0;

    for (let j = 0; j < positions.length; j++) {
      const symbol = positions[j].symbol;
      const prices = pricesMap.get(symbol) || [];

      if (prices[i] && prices[i - 1] && prices[i - 1] > 0) {
        const assetReturn = (prices[i] - prices[i - 1]) / prices[i - 1];
        portfolioReturn += weights[j] * assetReturn;
      }
    }

    portfolioReturns.push(portfolioReturn);
  }

  return portfolioReturns;
}

// Run Monte Carlo simulation
function runMonteCarloSimulation(
  historicalReturns: number[],
  simulations: number = 10000,
  horizon: number = 252
): { annualReturns: number[]; var95: number; cvar95: number; probPositive: number } {
  if (historicalReturns.length === 0) {
    return { annualReturns: [], var95: 0, cvar95: 0, probPositive: 0.5 };
  }

  const annualReturns: number[] = [];

  for (let sim = 0; sim < simulations; sim++) {
    let cumReturn = 1;

    for (let day = 0; day < horizon; day++) {
      const randomIdx = Math.floor(Math.random() * historicalReturns.length);
      cumReturn *= 1 + historicalReturns[randomIdx];
    }

    annualReturns.push(cumReturn - 1);
  }

  // Sort for percentile calculations
  annualReturns.sort((a, b) => a - b);

  // Calculate VaR and CVaR
  const var95Idx = Math.floor(0.05 * simulations);
  const var95 = annualReturns[var95Idx];

  const cvar95Returns = annualReturns.slice(0, var95Idx);
  const cvar95 =
    cvar95Returns.length > 0
      ? cvar95Returns.reduce((a, b) => a + b, 0) / cvar95Returns.length
      : var95;

  const probPositive = annualReturns.filter(r => r > 0).length / simulations;

  return { annualReturns, var95, cvar95, probPositive };
}

// Calculate risk metrics
function calculateRiskMetrics(
  portfolioReturns: number[],
  benchmarkReturns: number[] = [],
  riskFreeRate: number = 0.05
): RiskMetrics {
  if (portfolioReturns.length === 0) {
    return {
      var95: 0,
      cvar95: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      volatility: 0,
      maxDrawdown: 0,
      beta: 1,
      informationRatio: 0,
      tailRisk: 0,
      probPositive: 0.5,
    };
  }

  const n = portfolioReturns.length;

  // Mean return
  const meanReturn = portfolioReturns.reduce((a, b) => a + b, 0) / n;
  const annualizedReturn = meanReturn * 252;

  // Volatility
  const variance =
    portfolioReturns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / (n - 1);
  const dailyVol = Math.sqrt(variance);
  const annualizedVol = dailyVol * Math.sqrt(252);

  // Sharpe Ratio
  const dailyRf = riskFreeRate / 252;
  const sharpeRatio =
    annualizedVol > 0 ? (annualizedReturn - riskFreeRate) / annualizedVol : 0;

  // Sortino Ratio (downside deviation)
  const negativeReturns = portfolioReturns.filter(r => r < dailyRf);
  const downsideVariance =
    negativeReturns.length > 0
      ? negativeReturns.reduce((sum, r) => sum + Math.pow(r - dailyRf, 2), 0) / negativeReturns.length
      : 0;
  const downsideDeviation = Math.sqrt(downsideVariance) * Math.sqrt(252);
  const sortinoRatio =
    downsideDeviation > 0 ? (annualizedReturn - riskFreeRate) / downsideDeviation : 0;

  // Max Drawdown
  let maxDrawdown = 0;
  let peak = 1;
  let cumValue = 1;

  for (const r of portfolioReturns) {
    cumValue *= 1 + r;
    if (cumValue > peak) {
      peak = cumValue;
    }
    const drawdown = (peak - cumValue) / peak;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  // Beta (vs benchmark or market)
  let beta = 1;
  if (benchmarkReturns.length >= n) {
    const benchMean = benchmarkReturns.slice(0, n).reduce((a, b) => a + b, 0) / n;
    let covariance = 0;
    let benchVariance = 0;

    for (let i = 0; i < n; i++) {
      covariance += (portfolioReturns[i] - meanReturn) * (benchmarkReturns[i] - benchMean);
      benchVariance += Math.pow(benchmarkReturns[i] - benchMean, 2);
    }

    covariance /= n - 1;
    benchVariance /= n - 1;

    beta = benchVariance > 0 ? covariance / benchVariance : 1;
  }

  // Run Monte Carlo for VaR/CVaR
  const mc = runMonteCarloSimulation(portfolioReturns, 10000, 252);

  // Tail risk (average of worst 1% outcomes)
  const worst1Percent = Math.floor(mc.annualReturns.length * 0.01);
  const tailRisk =
    worst1Percent > 0
      ? mc.annualReturns.slice(0, worst1Percent).reduce((a, b) => a + b, 0) / worst1Percent
      : mc.var95;

  // Information Ratio (vs benchmark)
  let informationRatio = 0;
  if (benchmarkReturns.length >= n) {
    const excessReturns: number[] = [];
    for (let i = 0; i < n; i++) {
      excessReturns.push(portfolioReturns[i] - benchmarkReturns[i]);
    }
    const excessMean = excessReturns.reduce((a, b) => a + b, 0) / n;
    const trackingError = Math.sqrt(
      excessReturns.reduce((sum, r) => sum + Math.pow(r - excessMean, 2), 0) / (n - 1)
    );
    informationRatio =
      trackingError > 0 ? (excessMean * 252) / (trackingError * Math.sqrt(252)) : 0;
  }

  return {
    var95: Math.abs(mc.var95),
    cvar95: Math.abs(mc.cvar95),
    sharpeRatio: parseFloat(sharpeRatio.toFixed(2)),
    sortinoRatio: parseFloat(sortinoRatio.toFixed(2)),
    volatility: parseFloat(annualizedVol.toFixed(4)),
    maxDrawdown: parseFloat(maxDrawdown.toFixed(4)),
    beta: parseFloat(beta.toFixed(2)),
    informationRatio: parseFloat(informationRatio.toFixed(2)),
    tailRisk: Math.abs(tailRisk),
    probPositive: mc.probPositive,
  };
}

// Generate mock SPY returns for benchmark
function generateMockBenchmarkReturns(days: number): number[] {
  const returns: number[] = [];
  for (let i = 0; i < days; i++) {
    // Random walk with slight positive drift
    returns.push((Math.random() - 0.48) * 0.02);
  }
  return returns;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const start = Date.now();
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Missing authorization header' },
    });
  }

  const token = authHeader.substring(7);

  try {
    // Verify user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid token' },
      });
    }

    // Get user's portfolio
    const { data: portfolio, error: portfolioError } = await supabase
      .from('frontier_portfolios')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (portfolioError || !portfolio) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'No portfolio found' },
      });
    }

    // Get positions
    const { data: positions, error: positionsError } = await supabase
      .from('frontier_positions')
      .select('symbol, shares, avg_cost')
      .eq('portfolio_id', portfolio.id);

    if (positionsError) {
      return res.status(500).json({
        success: false,
        error: { code: 'DB_ERROR', message: positionsError.message },
      });
    }

    if (!positions || positions.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          var95: 0,
          cvar95: 0,
          sharpeRatio: 0,
          sortinoRatio: 0,
          volatility: 0,
          maxDrawdown: 0,
          beta: 1,
          informationRatio: 0,
          tailRisk: 0,
          probPositive: 0.5,
        },
        meta: {
          timestamp: new Date().toISOString(),
          latencyMs: Date.now() - start,
          source: 'empty_portfolio',
        },
      });
    }

    // Fetch historical prices
    const apiKey = process.env.POLYGON_API_KEY;
    let pricesMap = new Map<string, number[]>();
    let source = 'mock';

    if (apiKey) {
      pricesMap = await fetchHistoricalPrices(
        positions.map(p => p.symbol),
        apiKey,
        252
      );

      if (pricesMap.size > 0) {
        source = 'polygon';
      }
    }

    // Generate mock prices if no real data
    if (pricesMap.size === 0) {
      for (const pos of positions) {
        const mockPrices: number[] = [];
        let price = pos.avg_cost;

        for (let i = 0; i < 252; i++) {
          price *= 1 + (Math.random() - 0.48) * 0.03;
          mockPrices.push(price);
        }

        pricesMap.set(pos.symbol, mockPrices);
      }
    }

    // Calculate portfolio returns
    const portfolioReturns = calculatePortfolioReturns(positions, pricesMap);

    // Get benchmark returns (SPY)
    let benchmarkReturns: number[] = [];
    if (apiKey) {
      const benchPrices = await fetchHistoricalPrices(['SPY'], apiKey, 252);
      const spyPrices = benchPrices.get('SPY') || [];
      benchmarkReturns = calculateReturns(spyPrices);
    }

    if (benchmarkReturns.length === 0) {
      benchmarkReturns = generateMockBenchmarkReturns(portfolioReturns.length);
    }

    // Calculate risk metrics
    const metrics = calculateRiskMetrics(portfolioReturns, benchmarkReturns, 0.05);

    return res.status(200).json({
      success: true,
      data: metrics,
      meta: {
        timestamp: new Date().toISOString(),
        latencyMs: Date.now() - start,
        source,
        dataPoints: portfolioReturns.length,
        simulations: 10000,
      },
    });
  } catch (error: any) {
    console.error('Risk calculation error:', error);

    // Check if it's an external API error
    const isExternalError =
      error.message?.includes('fetch') ||
      error.message?.includes('network') ||
      error.message?.includes('timeout') ||
      error.message?.includes('Polygon') ||
      error.message?.includes('ECONNREFUSED') ||
      error.message?.includes('ETIMEDOUT');

    if (isExternalError) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'External data service temporarily unavailable. Please try again.',
        },
        meta: {
          timestamp: new Date().toISOString(),
          latencyMs: Date.now() - start,
        },
      });
    }

    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message },
      meta: {
        timestamp: new Date().toISOString(),
        latencyMs: Date.now() - start,
      },
    });
  }
}
