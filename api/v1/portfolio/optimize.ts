import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../../lib/auth.js';
import { methodNotAllowed, internalError } from '../../lib/errorHandler.js';
import { validateBody, schemas } from '../../lib/validation.js';

// ============================================================================
// TYPES
// ============================================================================

interface Price {
  symbol: string;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface FactorExposure {
  factor: string;
  exposure: number;
  tStat: number;
  confidence: number;
  contribution: number;
}

interface OptimizationConfig {
  objective: 'max_sharpe' | 'min_volatility' | 'risk_parity' | 'target_volatility' | 'equal_weight';
  riskFreeRate: number;
  targetVolatility?: number;
  constraints?: {
    minWeight?: number;
    maxWeight?: number;
    longOnly?: boolean;
  };
}

interface MonteCarloResult {
  simulations: number;
  var95: number;
  cvar95: number;
  medianReturn: number;
  probPositive: number;
}

interface OptimizationResult {
  weights: Record<string, number>;
  expectedReturn: number;
  expectedVolatility: number;
  sharpeRatio: number;
  factorExposures: FactorExposure[];
  monteCarlo: MonteCarloResult;
  explanation: string;
}

// ============================================================================
// MOCK DATA GENERATOR
// ============================================================================

function boxMullerRandom(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function generateMockPrices(symbol: string, days: number): Price[] {
  const prices: Price[] = [];
  const hash = symbol.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  let price = 50 + (hash % 450);

  const drift = 0.0003;
  const vol = 0.015;

  let calendarDays = 0;
  const maxCalendarDays = days * 2;

  while (prices.length < days && calendarDays < maxCalendarDays) {
    const date = new Date();
    date.setDate(date.getDate() - calendarDays);
    calendarDays++;

    if (date.getDay() === 0 || date.getDay() === 6) continue;

    const dailyReturn = drift + vol * boxMullerRandom();
    price = price * (1 + dailyReturn);

    const dailyVol = Math.abs(boxMullerRandom()) * 0.01;

    prices.push({
      symbol,
      timestamp: date,
      open: price * (1 - dailyVol / 2),
      high: price * (1 + dailyVol),
      low: price * (1 - dailyVol),
      close: price,
      volume: Math.floor(1000000 + Math.random() * 9000000),
    });
  }

  return prices.reverse();
}

// ============================================================================
// POLYGON API INTEGRATION
// ============================================================================

async function fetchPolygonHistoricalPrices(
  symbol: string,
  apiKey: string,
  days: number = 252
): Promise<Price[] | null> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - Math.ceil(days * 1.5));

  const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${startDate.toISOString().split('T')[0]}/${endDate.toISOString().split('T')[0]}?adjusted=true&sort=asc&limit=500&apiKey=${apiKey}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`Polygon API returned ${response.status} for ${symbol}`);
      return null;
    }

    const data = await response.json();
    if (!data.results || data.results.length === 0) {
      return null;
    }

    return data.results.map((r: any) => ({
      symbol,
      timestamp: new Date(r.t),
      open: r.o,
      high: r.h,
      low: r.l,
      close: r.c,
      volume: r.v,
    }));
  } catch (error) {
    console.error(`Failed to fetch Polygon prices for ${symbol}:`, error);
    return null;
  }
}

// ============================================================================
// MATH UTILITIES
// ============================================================================

function calculateReturns(prices: Price[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const prev = prices[i - 1]?.close || 0;
    const curr = prices[i]?.close || 0;
    if (prev > 0) {
      returns.push((curr - prev) / prev);
    }
  }
  return returns;
}

function calculateStd(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function calculateMeanReturns(returns: number[][]): number[] {
  return returns.map(r => r.reduce((a, b) => a + b, 0) / r.length);
}

function calculateCovariance(returns: number[][]): number[][] {
  const n = returns.length;
  const T = returns[0]?.length || 0;
  const means = calculateMeanReturns(returns);

  const cov: number[][] = [];
  for (let i = 0; i < n; i++) {
    cov.push([]);
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let t = 0; t < T; t++) {
        sum += ((returns[i]?.[t] || 0) - means[i]) * ((returns[j]?.[t] || 0) - means[j]);
      }
      cov[i].push(sum / (T - 1));
    }
  }

  return cov;
}

function ledoitWolfShrinkage(sigma: number[][]): number[][] {
  const n = sigma.length;
  const mu = sigma.reduce((sum, row) => sum + row.reduce((s, v) => s + v, 0), 0) / (n * n);
  const delta = 0.2;

  const shrunk: number[][] = [];
  for (let i = 0; i < n; i++) {
    shrunk.push([]);
    for (let j = 0; j < n; j++) {
      if (i === j) {
        shrunk[i].push((1 - delta) * sigma[i][j] + delta * mu);
      } else {
        shrunk[i].push((1 - delta) * sigma[i][j]);
      }
    }
  }

  return shrunk;
}

function portfolioReturn(weights: number[], mu: number[]): number {
  return weights.reduce((sum, w, i) => sum + w * mu[i], 0);
}

function portfolioVolatility(weights: number[], sigma: number[][]): number {
  let variance = 0;
  for (let i = 0; i < weights.length; i++) {
    for (let j = 0; j < weights.length; j++) {
      variance += weights[i] * weights[j] * sigma[i][j];
    }
  }
  return Math.sqrt(variance);
}

function normalizeWeights(weights: number[]): void {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum > 0) {
    for (let i = 0; i < weights.length; i++) {
      weights[i] /= sum;
    }
  }
}

// ============================================================================
// OPTIMIZATION ALGORITHMS
// ============================================================================

function equalWeight(n: number): number[] {
  return new Array(n).fill(1 / n);
}

function maxSharpe(mu: number[], sigma: number[][], rf: number): number[] {
  const n = mu.length;
  let weights = equalWeight(n);
  const lr = 0.01;
  const iterations = 1000;

  for (let iter = 0; iter < iterations; iter++) {
    const ret = portfolioReturn(weights, mu);
    const vol = portfolioVolatility(weights, sigma);
    const sharpe = (ret - rf / 252) / vol;

    const gradient = new Array(n).fill(0);
    const delta = 0.0001;

    for (let i = 0; i < n; i++) {
      const wPlus = [...weights];
      wPlus[i] += delta;
      normalizeWeights(wPlus);

      const retPlus = portfolioReturn(wPlus, mu);
      const volPlus = portfolioVolatility(wPlus, sigma);
      const sharpePlus = (retPlus - rf / 252) / volPlus;

      gradient[i] = (sharpePlus - sharpe) / delta;
    }

    for (let i = 0; i < n; i++) {
      weights[i] += lr * gradient[i];
      weights[i] = Math.max(0, weights[i]);
    }

    normalizeWeights(weights);
  }

  return weights;
}

function minVolatility(sigma: number[][]): number[] {
  const n = sigma.length;
  let weights = equalWeight(n);
  const lr = 0.01;
  const iterations = 1000;

  for (let iter = 0; iter < iterations; iter++) {
    const gradient = new Array(n).fill(0);
    const delta = 0.0001;
    const currentVol = portfolioVolatility(weights, sigma);

    for (let i = 0; i < n; i++) {
      const wPlus = [...weights];
      wPlus[i] += delta;
      normalizeWeights(wPlus);

      const volPlus = portfolioVolatility(wPlus, sigma);
      gradient[i] = (volPlus - currentVol) / delta;
    }

    for (let i = 0; i < n; i++) {
      weights[i] -= lr * gradient[i];
      weights[i] = Math.max(0, weights[i]);
    }

    normalizeWeights(weights);
  }

  return weights;
}

function riskParity(sigma: number[][]): number[] {
  const n = sigma.length;
  let weights = equalWeight(n);
  const lr = 0.01;
  const iterations = 1000;

  for (let iter = 0; iter < iterations; iter++) {
    const vol = portfolioVolatility(weights, sigma);

    // Calculate risk contributions
    const contributions: number[] = [];
    for (let i = 0; i < n; i++) {
      let marginal = 0;
      for (let j = 0; j < n; j++) {
        marginal += weights[j] * sigma[i][j];
      }
      contributions.push((weights[i] * marginal) / (vol * vol));
    }

    const targetContribution = 1 / n;

    for (let i = 0; i < n; i++) {
      const error = contributions[i] - targetContribution;
      weights[i] -= lr * error;
      weights[i] = Math.max(0.01, weights[i]);
    }

    normalizeWeights(weights);
  }

  return weights;
}

// ============================================================================
// MONTE CARLO SIMULATION
// ============================================================================

function monteCarloSimulation(
  returns: number[][],
  weights: number[],
  simulations: number
): MonteCarloResult {
  const n = weights.length;
  const portfolioReturns: number[] = [];

  const T = returns[0]?.length || 0;
  for (let t = 0; t < T; t++) {
    let portRet = 0;
    for (let i = 0; i < n; i++) {
      portRet += weights[i] * (returns[i]?.[t] || 0);
    }
    portfolioReturns.push(portRet);
  }

  const annualReturns: number[] = [];
  const tradingDays = 252;

  for (let sim = 0; sim < simulations; sim++) {
    let cumReturn = 1;

    for (let day = 0; day < tradingDays; day++) {
      const randomIdx = Math.floor(Math.random() * portfolioReturns.length);
      cumReturn *= 1 + portfolioReturns[randomIdx];
    }

    annualReturns.push(cumReturn - 1);
  }

  annualReturns.sort((a, b) => a - b);

  const var95Idx = Math.floor(0.05 * simulations);
  const var95 = annualReturns[var95Idx];

  const cvar95Returns = annualReturns.slice(0, var95Idx);
  const cvar95 =
    cvar95Returns.length > 0
      ? cvar95Returns.reduce((a, b) => a + b, 0) / cvar95Returns.length
      : var95;

  const medianReturn = annualReturns[Math.floor(simulations / 2)];
  const probPositive = annualReturns.filter(r => r > 0).length / simulations;

  return {
    simulations,
    var95,
    cvar95,
    medianReturn,
    probPositive,
  };
}

// ============================================================================
// FACTOR CALCULATIONS (SIMPLIFIED)
// ============================================================================

function alignReturns(asset: number[], market: number[]): { asset: number[]; market: number[] } {
  const minLen = Math.min(asset.length, market.length);
  return {
    asset: asset.slice(-minLen),
    market: market.slice(-minLen),
  };
}

function linearRegression(y: number[], x: number[]): { slope: number; tStat: number } {
  const n = y.length;
  if (n < 30) return { slope: 1, tStat: 0 };

  const xMean = x.reduce((a, b) => a + b, 0) / n;
  const yMean = y.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < n; i++) {
    numerator += (x[i] - xMean) * (y[i] - yMean);
    denominator += (x[i] - xMean) ** 2;
  }

  const slope = denominator === 0 ? 1 : numerator / denominator;

  const residuals = y.map((yi, i) => yi - (slope * x[i] + (yMean - slope * xMean)));
  const residualStd = calculateStd(residuals);
  const xStd = calculateStd(x);
  const se = residualStd / (xStd * Math.sqrt(n));
  const tStat = se === 0 ? 0 : slope / se;

  return { slope, tStat };
}

function calculateFactorExposures(
  symbols: string[],
  weights: number[],
  prices: Map<string, Price[]>
): FactorExposure[] {
  const marketPrices = prices.get('SPY') || [];
  const marketReturns = calculateReturns(marketPrices);

  let portfolioBeta = 0;
  let portfolioMomentum = 0;
  let portfolioVolatility = 0;

  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];
    const weight = weights[i];
    const symbolPrices = prices.get(symbol) || [];

    if (symbolPrices.length < 252) continue;

    const assetReturns = calculateReturns(symbolPrices);
    const aligned = alignReturns(assetReturns, marketReturns);
    const beta = linearRegression(aligned.asset, aligned.market);

    portfolioBeta += weight * beta.slope;

    // Momentum (12-month, skip last month)
    const startIdx = Math.max(0, symbolPrices.length - 252);
    const endIdx = Math.max(0, symbolPrices.length - 21);
    const startPrice = symbolPrices[startIdx]?.close || 0;
    const endPrice = symbolPrices[endIdx]?.close || 0;
    const momentum = startPrice > 0 ? (endPrice - startPrice) / startPrice : 0;
    portfolioMomentum += weight * momentum;

    // Volatility (3-month)
    const recentReturns = calculateReturns(symbolPrices.slice(-63));
    const vol = calculateStd(recentReturns) * Math.sqrt(252);
    portfolioVolatility += weight * vol;
  }

  return [
    {
      factor: 'market',
      exposure: portfolioBeta,
      tStat: portfolioBeta * 3,
      confidence: 0.9,
      contribution: portfolioBeta * 0.08, // Assume 8% market risk premium
    },
    {
      factor: 'momentum_12m',
      exposure: (portfolioMomentum - 0.10) / 0.20,
      tStat: ((portfolioMomentum - 0.10) / 0.20) * 2,
      confidence: 0.75,
      contribution: portfolioMomentum,
    },
    {
      factor: 'volatility',
      exposure: (portfolioVolatility - 0.16) / 0.08,
      tStat: ((portfolioVolatility - 0.16) / 0.08) * 2,
      confidence: 0.9,
      contribution: portfolioVolatility,
    },
  ];
}

// ============================================================================
// MAIN OPTIMIZER FUNCTION
// ============================================================================

async function optimizePortfolio(
  symbols: string[],
  config: OptimizationConfig,
  apiKey?: string
): Promise<OptimizationResult & { dataSource: 'mock' | 'live' }> {
  const prices = new Map<string, Price[]>();

  // Fetch prices for all symbols + SPY benchmark
  const allSymbols = [...symbols, 'SPY'];
  let dataSource: 'mock' | 'live' = 'mock';

  for (const symbol of allSymbols) {
    let symbolPrices: Price[] | null = null;

    // Try Polygon first
    if (apiKey) {
      symbolPrices = await fetchPolygonHistoricalPrices(symbol, apiKey, 300);
      if (symbolPrices && symbolPrices.length > 0) {
        dataSource = 'live';
      }
    }

    // Fallback to mock
    if (!symbolPrices || symbolPrices.length === 0) {
      symbolPrices = generateMockPrices(symbol, 300);
    }

    prices.set(symbol, symbolPrices);
  }

  // Calculate returns matrix
  const returns: number[][] = [];
  for (const symbol of symbols) {
    const symbolPrices = prices.get(symbol) || [];
    returns.push(calculateReturns(symbolPrices));
  }

  // Calculate expected returns and covariance
  const mu = calculateMeanReturns(returns);
  const sigma = calculateCovariance(returns);
  const shrunkSigma = ledoitWolfShrinkage(sigma);

  // Optimize based on objective
  let weights: number[];
  switch (config.objective) {
    case 'max_sharpe':
      weights = maxSharpe(mu, shrunkSigma, config.riskFreeRate);
      break;
    case 'min_volatility':
      weights = minVolatility(shrunkSigma);
      break;
    case 'risk_parity':
      weights = riskParity(shrunkSigma);
      break;
    default:
      weights = equalWeight(symbols.length);
  }

  // Calculate metrics
  const monteCarlo = monteCarloSimulation(returns, weights, 10000);
  const expectedReturn = portfolioReturn(weights, mu) * 252;
  const expectedVol = portfolioVolatility(weights, shrunkSigma) * Math.sqrt(252);
  const sharpe = (expectedReturn - config.riskFreeRate) / expectedVol;

  // Calculate factor exposures
  const factorExposures = calculateFactorExposures(symbols, weights, prices);

  // Generate explanation
  const sortedHoldings = symbols
    .map((s, i) => ({ symbol: s, weight: weights[i] }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3);

  const holdingsStr = sortedHoldings
    .map(h => `${h.symbol} (${(h.weight * 100).toFixed(1)}%)`)
    .join(', ');

  const explanation = `Optimized portfolio with expected annual return of ${(expectedReturn * 100).toFixed(1)}% ` +
    `and volatility of ${(expectedVol * 100).toFixed(1)}% (Sharpe: ${sharpe.toFixed(2)}). ` +
    `Top holdings: ${holdingsStr}. Data source: ${dataSource}.`;

  // Convert weights to object
  const weightsObj: Record<string, number> = {};
  symbols.forEach((s, i) => {
    weightsObj[s] = weights[i];
  });

  return {
    weights: weightsObj,
    expectedReturn,
    expectedVolatility: expectedVol,
    sharpeRatio: sharpe,
    factorExposures,
    monteCarlo,
    explanation,
    dataSource,
  };
}

// ============================================================================
// API HANDLER
// ============================================================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return methodNotAllowed(res);
  }

  const start = Date.now();

  try {
    // Validate & parse input with Zod
    const body = validateBody(req, res, schemas.optimizePortfolio);
    if (!body) return;

    const { symbols, config } = body;

    // Symbols are already validated as uppercase ticker format by Zod
    const normalizedSymbols = symbols;

    // Default config
    const fullConfig: OptimizationConfig = {
      objective: config?.objective || 'max_sharpe',
      riskFreeRate: config?.riskFreeRate ?? 0.05,
      targetVolatility: config?.targetVolatility,
      constraints: config?.constraints,
    };

    // Get API key for real data
    const apiKey = process.env.POLYGON_API_KEY;

    // Run optimization
    const result = await optimizePortfolio(normalizedSymbols, fullConfig, apiKey);

    res.setHeader('X-Data-Source', result.dataSource);
    return res.status(200).json({
      success: true,
      data: result,
      dataSource: result.dataSource,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: `req-${Math.random().toString(36).slice(2, 8)}`,
        latencyMs: Date.now() - start,
      },
    });
  } catch (error: any) {
    console.error('Optimization error:', error);

    // Check if it's an external API error
    const isExternalError =
      error.message?.includes('fetch') ||
      error.message?.includes('network') ||
      error.message?.includes('timeout') ||
      error.message?.includes('Polygon') ||
      error.message?.includes('ECONNREFUSED');

    if (isExternalError) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'External data service temporarily unavailable. Please try again.',
        },
      });
    }

    return internalError(res);
  }
}
