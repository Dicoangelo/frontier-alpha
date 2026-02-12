import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../../../lib/auth.js';

// Inline types
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

// ============================================================================
// FACTOR ENGINE (Inline for serverless)
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

function calcMarketBeta(assetPrices: Price[], marketPrices: Price[]): FactorExposure {
  const assetReturns = calculateReturns(assetPrices);
  const marketReturns = calculateReturns(marketPrices);
  const aligned = alignReturns(assetReturns, marketReturns);
  const beta = linearRegression(aligned.asset, aligned.market);

  return {
    factor: 'market',
    exposure: beta.slope,
    tStat: beta.tStat,
    confidence: Math.min(Math.abs(beta.tStat) / 2, 1),
    contribution: beta.slope * calculateStd(aligned.market),
  };
}

function calcMomentum(prices: Price[], lookback: number, name: string): FactorExposure {
  if (prices.length < lookback + 21) {
    return { factor: name, exposure: 0, tStat: 0, confidence: 0, contribution: 0 };
  }

  const startIdx = prices.length - lookback;
  const endIdx = prices.length - 21;

  const startPrice = prices[startIdx]?.close || 0;
  const endPrice = prices[endIdx]?.close || 0;

  if (startPrice === 0) {
    return { factor: name, exposure: 0, tStat: 0, confidence: 0, contribution: 0 };
  }

  const momentum = (endPrice - startPrice) / startPrice;
  const zScore = (momentum - 0.10) / 0.20;

  return {
    factor: name,
    exposure: Math.max(-3, Math.min(3, zScore)),
    tStat: zScore * Math.sqrt(lookback / 21),
    confidence: Math.min(Math.abs(zScore) / 2, 1),
    contribution: momentum,
  };
}

function calcVolatility(prices: Price[]): FactorExposure {
  const returns = calculateReturns(prices.slice(-63));
  const vol = calculateStd(returns) * Math.sqrt(252);
  const zScore = (vol - 0.16) / 0.08;

  return {
    factor: 'volatility',
    exposure: Math.max(-3, Math.min(3, zScore)),
    tStat: zScore * 2,
    confidence: 0.9,
    contribution: vol,
  };
}

function calculateExposures(
  symbols: string[],
  prices: Map<string, Price[]>
): Map<string, FactorExposure[]> {
  const exposures = new Map<string, FactorExposure[]>();

  for (const symbol of symbols) {
    const symbolPrices = prices.get(symbol);
    if (!symbolPrices || symbolPrices.length < 252) continue;

    const symbolExposures: FactorExposure[] = [];
    const spyPrices = prices.get('SPY') || [];

    symbolExposures.push(calcMarketBeta(symbolPrices, spyPrices));
    symbolExposures.push(calcMomentum(symbolPrices, 252, 'momentum_12m'));
    symbolExposures.push(calcMomentum(symbolPrices, 126, 'momentum_6m'));
    symbolExposures.push(calcMomentum(symbolPrices, 21, 'momentum_1m'));
    symbolExposures.push(calcVolatility(symbolPrices));

    const volExposure = calcVolatility(symbolPrices);
    symbolExposures.push({
      ...volExposure,
      factor: 'low_vol',
      exposure: -volExposure.exposure,
    });

    exposures.set(symbol, symbolExposures);
  }

  return exposures;
}

// ============================================================================
// MOCK PRICE GENERATOR
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
// HANDLER
// ============================================================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const start = Date.now();
  const { symbols } = req.query;

  if (!symbols || typeof symbols !== 'string') {
    return res.status(400).json({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'symbols parameter required' },
    });
  }

  try {
    const symbolList = symbols.split(',').map(s => s.trim().toUpperCase());
    const prices = new Map<string, Price[]>();
    const dataSource = 'mock' as const;

    // Generate 300 days of mock prices for each symbol + SPY
    for (const symbol of [...symbolList, 'SPY']) {
      const symbolPrices = generateMockPrices(symbol, 300);
      prices.set(symbol, symbolPrices);
    }

    const exposures = calculateExposures(symbolList, prices);

    res.setHeader('X-Data-Source', dataSource);
    return res.status(200).json({
      success: true,
      data: Object.fromEntries(exposures),
      dataSource,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: `req-${Math.random().toString(36).slice(2, 8)}`,
        latencyMs: Date.now() - start,
      },
    });
  } catch (error: any) {
    // Check if it's an external API error
    const isExternalError =
      error.message?.includes('fetch') ||
      error.message?.includes('network') ||
      error.message?.includes('timeout') ||
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
      error: { code: 'FACTOR_ERROR', message: error.message },
      meta: {
        timestamp: new Date().toISOString(),
        latencyMs: Date.now() - start,
      },
    });
  }
}
