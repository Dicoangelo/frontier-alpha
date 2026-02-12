import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import { methodNotAllowed, badRequest, internalError } from '../../lib/errorHandler.js';

interface IVData {
  symbol: string;
  currentPrice: number;
  ivRank: number;
  ivPercentile: number;
  atmIV: number;
  iv30: number;
  iv60: number;
  iv90: number;
  hv30: number;
  hv60: number;
  hv90: number;
  putCallRatio: number;
  expectedMove: {
    weekly: number;
    monthly: number;
    quarterly: number;
    earnings?: number;
  };
  expectedMoveInDollars?: {
    weekly: number;
    monthly: number;
    quarterly: number;
    earnings?: number;
  };
  skew: number;
  termStructure: 'contango' | 'backwardation' | 'flat';
  dataSource: 'options' | 'historical' | 'hybrid';
  straddlePrice?: number;
  timestamp: string;
  signal: 'high_iv' | 'low_iv' | 'neutral';
  recommendation: string;
  ivVsHV: number;
}

// Cache for IV data and historical prices
const ivCache = new Map<string, { data: IVData; expires: number }>();
const hvCache = new Map<string, { prices: number[]; expires: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const HV_CACHE_TTL = 60 * 60 * 1000; // 1 hour
const DAYS_IN_YEAR = 365;
const TRADING_DAYS_IN_YEAR = 252;

/**
 * Calculate historical volatility from price data
 */
function calculateHistoricalVolatility(prices: number[], days: number): number {
  if (prices.length < days + 1) {
    days = Math.max(5, prices.length - 1);
  }

  const recentPrices = prices.slice(0, days + 1);
  const returns: number[] = [];

  for (let i = 1; i < recentPrices.length; i++) {
    const logReturn = Math.log(recentPrices[i - 1] / recentPrices[i]);
    returns.push(logReturn);
  }

  if (returns.length === 0) return 0.25;

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (returns.length - 1);
  const dailyVol = Math.sqrt(variance);

  return dailyVol * Math.sqrt(TRADING_DAYS_IN_YEAR);
}

/**
 * Fetch historical prices for HV calculation
 */
async function fetchHistoricalPrices(symbol: string): Promise<number[]> {
  const cached = hvCache.get(symbol);
  if (cached && cached.expires > Date.now()) {
    return cached.prices;
  }

  try {
    const now = Math.floor(Date.now() / 1000);
    const oneYearAgo = now - 365 * 24 * 60 * 60;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${oneYearAgo}&period2=${now}&interval=1d`;

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 10000,
    });

    const result = response.data?.chart?.result?.[0];
    if (!result?.indicators?.quote?.[0]?.close) {
      return [];
    }

    const closes = result.indicators.quote[0].close.filter((c: any) => c != null);
    const prices = closes.reverse(); // Most recent first

    hvCache.set(symbol, { prices, expires: Date.now() + HV_CACHE_TTL });
    return prices;
  } catch (error) {
    console.error(`[IV] Error fetching historical prices for ${symbol}:`, error);
    return [];
  }
}

async function fetchIVData(symbol: string): Promise<IVData | null> {
  // Check cache first
  const cached = ivCache.get(symbol);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }

  try {
    // Fetch options and historical prices in parallel
    const [optionsResponse, historicalPrices] = await Promise.all([
      axios.get(`https://query1.finance.yahoo.com/v7/finance/options/${symbol}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        timeout: 10000,
      }).catch(() => null),
      fetchHistoricalPrices(symbol),
    ]);

    // Calculate historical volatilities
    const hv30 = historicalPrices.length > 0
      ? calculateHistoricalVolatility(historicalPrices, 30)
      : 0.25;
    const hv60 = historicalPrices.length > 0
      ? calculateHistoricalVolatility(historicalPrices, 60)
      : 0.26;
    const hv90 = historicalPrices.length > 0
      ? calculateHistoricalVolatility(historicalPrices, 90)
      : 0.27;

    const currentPrice = historicalPrices[0] || 0;

    // Check if we have options data
    const data = optionsResponse?.data;
    if (!data?.optionChain?.result?.[0]?.options?.[0]) {
      // Fall back to HV-based metrics
      return getHVBasedIVData(symbol, currentPrice, hv30, hv60, hv90);
    }

    const result = data.optionChain.result[0];
    const options = result.options[0];
    const underlyingPrice = result.quote?.regularMarketPrice || currentPrice;
    const calls = options.calls || [];
    const puts = options.puts || [];

    // Find ATM options
    const strikes = Array.from(new Set([...calls, ...puts].map((o: any) => o.strike))).sort(
      (a: number, b: number) => Math.abs(a - underlyingPrice) - Math.abs(b - underlyingPrice)
    );
    const atmStrike = strikes[0] || underlyingPrice;

    const atmCall = calls.find((c: any) => c.strike === atmStrike);
    const atmPut = puts.find((p: any) => p.strike === atmStrike);

    // Extract IVs
    const callIVs = calls
      .filter((c: any) => c.impliedVolatility > 0 && c.impliedVolatility < 5)
      .map((c: any) => c.impliedVolatility);
    const putIVs = puts
      .filter((p: any) => p.impliedVolatility > 0 && p.impliedVolatility < 5)
      .map((p: any) => p.impliedVolatility);

    const allIVs = [...callIVs, ...putIVs];
    const atmIV = allIVs.length > 0
      ? allIVs.reduce((a: number, b: number) => a + b, 0) / allIVs.length
      : hv30 * 1.1; // Use HV with premium if no options IV

    // Calculate ATM straddle price
    const straddlePrice = atmCall && atmPut
      ? ((atmCall.bid + atmCall.ask) / 2 || atmCall.lastPrice || 0) +
        ((atmPut.bid + atmPut.ask) / 2 || atmPut.lastPrice || 0)
      : undefined;

    // Calculate put/call ratio
    const totalCallVolume = calls.reduce((sum: number, c: any) => sum + (c.volume || 0), 0);
    const totalPutVolume = puts.reduce((sum: number, p: any) => sum + (p.volume || 0), 0);
    const putCallRatio = totalCallVolume > 0 ? totalPutVolume / totalCallVolume : 1;

    // Calculate skew
    const avgCallIV = callIVs.length > 0
      ? callIVs.reduce((a: number, b: number) => a + b, 0) / callIVs.length
      : atmIV;
    const avgPutIV = putIVs.length > 0
      ? putIVs.reduce((a: number, b: number) => a + b, 0) / putIVs.length
      : atmIV;
    const skew = avgPutIV - avgCallIV;

    // Calculate term structure (group by expiration)
    const expirations = result.expirationDates || [];
    let iv60 = atmIV * 1.02;
    let iv90 = atmIV * 1.04;

    if (expirations.length > 1) {
      // Try to find options at different expirations
      const now = Date.now() / 1000;
      const exp60 = expirations.find((e: number) => e > now + 45 * 86400 && e < now + 75 * 86400);
      const exp90 = expirations.find((e: number) => e > now + 75 * 86400);

      // Note: Would need additional API calls to get IV at different expirations
      // For now, estimate term structure
      iv60 = atmIV * 1.02;
      iv90 = atmIV * 1.04;
    }

    // Determine term structure
    const termStructure: 'contango' | 'backwardation' | 'flat' =
      iv60 > atmIV * 1.05 ? 'contango' :
      iv60 < atmIV * 0.95 ? 'backwardation' : 'flat';

    // IV Rank (improved calculation)
    const ivRank = Math.min(100, Math.max(0, ((atmIV - 0.15) / (0.80 - 0.15)) * 100));

    // IV vs HV ratio
    const ivVsHV = hv30 > 0 ? atmIV / hv30 : 1;

    // Expected moves
    const weeklyMove = atmIV * Math.sqrt(7 / DAYS_IN_YEAR);
    const monthlyMove = atmIV * Math.sqrt(30 / DAYS_IN_YEAR);
    const quarterlyMove = atmIV * Math.sqrt(90 / DAYS_IN_YEAR);
    const earningsMove = straddlePrice && underlyingPrice > 0
      ? straddlePrice / underlyingPrice
      : undefined;

    // Signal analysis with enhanced logic
    let signal: 'high_iv' | 'low_iv' | 'neutral' = 'neutral';
    let recommendation = 'No strong IV-based signal.';

    if (ivRank >= 70) {
      signal = 'high_iv';
      recommendation = `IV elevated (rank: ${Math.round(ivRank)}, IV/HV: ${ivVsHV.toFixed(2)}x). `;
      if (termStructure === 'backwardation') {
        recommendation += 'Near-term IV is elevated - sell front-month options.';
      } else {
        recommendation += 'Consider selling premium or waiting for IV crush.';
      }
      if (putCallRatio > 1.3) {
        recommendation += ' High put/call ratio suggests fear - puts may be overpriced.';
      }
    } else if (ivRank <= 30) {
      signal = 'low_iv';
      recommendation = `IV depressed (rank: ${Math.round(ivRank)}, IV/HV: ${ivVsHV.toFixed(2)}x). `;
      recommendation += 'Options are cheap - good time for protective puts or straddles.';
    }

    const ivData: IVData = {
      symbol,
      currentPrice: Math.round(underlyingPrice * 100) / 100,
      ivRank: Math.round(ivRank),
      ivPercentile: Math.round(ivRank),
      atmIV: Math.round(atmIV * 10000) / 100,
      iv30: Math.round(atmIV * 10000) / 100,
      iv60: Math.round(iv60 * 10000) / 100,
      iv90: Math.round(iv90 * 10000) / 100,
      hv30: Math.round(hv30 * 10000) / 100,
      hv60: Math.round(hv60 * 10000) / 100,
      hv90: Math.round(hv90 * 10000) / 100,
      putCallRatio: Math.round(putCallRatio * 100) / 100,
      expectedMove: {
        weekly: Math.round(weeklyMove * 10000) / 100,
        monthly: Math.round(monthlyMove * 10000) / 100,
        quarterly: Math.round(quarterlyMove * 10000) / 100,
        earnings: earningsMove ? Math.round(earningsMove * 10000) / 100 : undefined,
      },
      expectedMoveInDollars: underlyingPrice > 0 ? {
        weekly: Math.round(underlyingPrice * weeklyMove * 100) / 100,
        monthly: Math.round(underlyingPrice * monthlyMove * 100) / 100,
        quarterly: Math.round(underlyingPrice * quarterlyMove * 100) / 100,
        earnings: straddlePrice ? Math.round(straddlePrice * 100) / 100 : undefined,
      } : undefined,
      skew: Math.round(skew * 10000) / 100,
      termStructure,
      dataSource: 'options',
      straddlePrice: straddlePrice ? Math.round(straddlePrice * 100) / 100 : undefined,
      timestamp: new Date().toISOString(),
      signal,
      recommendation,
      ivVsHV: Math.round(ivVsHV * 100) / 100,
    };

    // Cache result
    ivCache.set(symbol, { data: ivData, expires: Date.now() + CACHE_TTL });

    return ivData;
  } catch (error) {
    console.error(`[IV] Error fetching IV for ${symbol}:`, error);
    return getDefaultIVData(symbol);
  }
}

/**
 * Generate IV data from historical volatility when options unavailable
 */
function getHVBasedIVData(
  symbol: string,
  currentPrice: number,
  hv30: number,
  hv60: number,
  hv90: number
): IVData {
  // Use HV with typical IV premium
  const ivPremium = 1.1;
  const atmIV = hv30 * ivPremium;
  const iv60 = hv60 * ivPremium;
  const iv90 = hv90 * ivPremium;

  const ivRank = Math.min(100, Math.max(0, ((atmIV - 0.15) / (0.80 - 0.15)) * 100));

  const weeklyMove = atmIV * Math.sqrt(7 / DAYS_IN_YEAR);
  const monthlyMove = atmIV * Math.sqrt(30 / DAYS_IN_YEAR);
  const quarterlyMove = atmIV * Math.sqrt(90 / DAYS_IN_YEAR);

  return {
    symbol,
    currentPrice: Math.round(currentPrice * 100) / 100,
    ivRank: Math.round(ivRank),
    ivPercentile: Math.round(ivRank),
    atmIV: Math.round(atmIV * 10000) / 100,
    iv30: Math.round(atmIV * 10000) / 100,
    iv60: Math.round(iv60 * 10000) / 100,
    iv90: Math.round(iv90 * 10000) / 100,
    hv30: Math.round(hv30 * 10000) / 100,
    hv60: Math.round(hv60 * 10000) / 100,
    hv90: Math.round(hv90 * 10000) / 100,
    putCallRatio: 1.0,
    expectedMove: {
      weekly: Math.round(weeklyMove * 10000) / 100,
      monthly: Math.round(monthlyMove * 10000) / 100,
      quarterly: Math.round(quarterlyMove * 10000) / 100,
    },
    expectedMoveInDollars: currentPrice > 0 ? {
      weekly: Math.round(currentPrice * weeklyMove * 100) / 100,
      monthly: Math.round(currentPrice * monthlyMove * 100) / 100,
      quarterly: Math.round(currentPrice * quarterlyMove * 100) / 100,
    } : undefined,
    skew: 0,
    termStructure: 'flat',
    dataSource: 'historical',
    timestamp: new Date().toISOString(),
    signal: 'neutral',
    recommendation: 'IV data from historical volatility. Options data unavailable.',
    ivVsHV: 1.1,
  };
}

function getDefaultIVData(symbol: string): IVData {
  const defaultIV = 0.25;

  return {
    symbol,
    currentPrice: 0,
    ivRank: 50,
    ivPercentile: 50,
    atmIV: 25,
    iv30: 25,
    iv60: 26,
    iv90: 27,
    hv30: 23,
    hv60: 24,
    hv90: 24,
    putCallRatio: 1.0,
    expectedMove: {
      weekly: Math.round(defaultIV * Math.sqrt(7 / DAYS_IN_YEAR) * 10000) / 100,
      monthly: Math.round(defaultIV * Math.sqrt(30 / DAYS_IN_YEAR) * 10000) / 100,
      quarterly: Math.round(defaultIV * Math.sqrt(90 / DAYS_IN_YEAR) * 10000) / 100,
    },
    skew: 0,
    termStructure: 'flat',
    dataSource: 'historical',
    timestamp: new Date().toISOString(),
    signal: 'neutral',
    recommendation: 'IV data unavailable. Using market average.',
    ivVsHV: 1.09,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return methodNotAllowed(res);
  }

  const requestId = `req-${Math.random().toString(36).slice(2, 8)}`;

  try {
    const symbolsParam = req.query.symbols as string;
    const symbols = symbolsParam
      ? symbolsParam.split(',').map((s) => s.trim().toUpperCase())
      : [];

    if (symbols.length === 0) {
      return badRequest(res, 'symbols parameter is required');
    }

    // Limit to 10 symbols to prevent abuse
    const limitedSymbols = symbols.slice(0, 10);

    const results: Record<string, IVData> = {};

    for (const symbol of limitedSymbols) {
      const ivData = await fetchIVData(symbol);
      if (ivData) {
        results[symbol] = ivData;
      }
      // Rate limit
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    // Calculate portfolio-level IV metrics
    const allIVs = Object.values(results);
    const avgIV = allIVs.length > 0
      ? allIVs.reduce((sum, d) => sum + d.atmIV, 0) / allIVs.length
      : 0;
    const avgIVRank = allIVs.length > 0
      ? allIVs.reduce((sum, d) => sum + d.ivRank, 0) / allIVs.length
      : 0;
    const avgHV = allIVs.length > 0
      ? allIVs.reduce((sum, d) => sum + d.hv30, 0) / allIVs.length
      : 0;
    const avgIVvsHV = allIVs.length > 0
      ? allIVs.reduce((sum, d) => sum + d.ivVsHV, 0) / allIVs.length
      : 1;

    // Find positions with notable characteristics
    const highIVPositions = allIVs.filter(d => d.signal === 'high_iv').map(d => d.symbol);
    const lowIVPositions = allIVs.filter(d => d.signal === 'low_iv').map(d => d.symbol);
    const highSkewPositions = allIVs.filter(d => d.skew > 3).map(d => d.symbol);
    const backwardationPositions = allIVs.filter(d => d.termStructure === 'backwardation').map(d => d.symbol);

    // Determine top-level dataSource: 'live' if any symbol used options data, else 'mock'
    const hasLiveOptionsData = allIVs.some(d => d.dataSource === 'options');
    const topLevelDataSource: 'mock' | 'live' = hasLiveOptionsData ? 'live' : 'mock';

    res.setHeader('X-Data-Source', topLevelDataSource);
    return res.status(200).json({
      success: true,
      data: {
        symbols: results,
        portfolio: {
          averageIV: Math.round(avgIV * 100) / 100,
          averageHV: Math.round(avgHV * 100) / 100,
          averageIVRank: Math.round(avgIVRank),
          averageIVvsHV: Math.round(avgIVvsHV * 100) / 100,
          highIVPositions,
          lowIVPositions,
          highSkewPositions, // Elevated put skew (fear)
          backwardationPositions, // Near-term IV elevated
          insights: {
            overallSignal: avgIVRank >= 70 ? 'high_iv' : avgIVRank <= 30 ? 'low_iv' : 'neutral',
            recommendation: avgIVRank >= 70
              ? 'Portfolio IV is elevated. Consider reducing premium exposure or selling covered calls.'
              : avgIVRank <= 30
              ? 'Portfolio IV is low. Good time for protective hedges or long options.'
              : 'Portfolio IV is in normal range. No urgent action needed.',
          },
        },
      },
      dataSource: topLevelDataSource,
      meta: {
        timestamp: new Date().toISOString(),
        requestId,
        symbolsRequested: limitedSymbols.length,
        symbolsReturned: Object.keys(results).length,
        dataQuality: {
          optionsData: allIVs.filter(d => d.dataSource === 'options').length,
          historicalData: allIVs.filter(d => d.dataSource === 'historical').length,
        },
      },
    });
  } catch (error) {
    console.error('IV endpoint error:', error);
    return internalError(res);
  }
}
