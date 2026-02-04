import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';

interface IVData {
  symbol: string;
  ivRank: number;
  ivPercentile: number;
  atmIV: number;
  iv30: number;
  putCallRatio: number;
  expectedMove: {
    weekly: number;
    monthly: number;
    quarterly: number;
  };
  skew: number;
  timestamp: string;
  signal: 'high_iv' | 'low_iv' | 'neutral';
  recommendation: string;
}

// Cache for IV data
const ivCache = new Map<string, { data: IVData; expires: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchIVData(symbol: string): Promise<IVData | null> {
  // Check cache first
  const cached = ivCache.get(symbol);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }

  try {
    // Fetch from Yahoo Finance options API
    const url = `https://query1.finance.yahoo.com/v7/finance/options/${symbol}`;

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 10000,
    });

    const data = response.data;
    if (!data?.optionChain?.result?.[0]) {
      return getDefaultIVData(symbol);
    }

    const result = data.optionChain.result[0];
    const options = result.options?.[0];

    if (!options) {
      return getDefaultIVData(symbol);
    }

    // Extract IV from options
    const calls = options.calls || [];
    const puts = options.puts || [];

    const callIVs = calls
      .filter((c: any) => c.impliedVolatility > 0)
      .map((c: any) => c.impliedVolatility);
    const putIVs = puts
      .filter((p: any) => p.impliedVolatility > 0)
      .map((p: any) => p.impliedVolatility);

    const allIVs = [...callIVs, ...putIVs];
    const atmIV = allIVs.length > 0
      ? allIVs.reduce((a: number, b: number) => a + b, 0) / allIVs.length
      : 0.25;

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

    // IV Rank (simplified)
    const ivRank = Math.min(100, Math.max(0, ((atmIV - 0.15) / (0.80 - 0.15)) * 100));

    // Expected moves
    const DAYS_IN_YEAR = 365;
    const weeklyMove = atmIV * Math.sqrt(7 / DAYS_IN_YEAR);
    const monthlyMove = atmIV * Math.sqrt(30 / DAYS_IN_YEAR);
    const quarterlyMove = atmIV * Math.sqrt(90 / DAYS_IN_YEAR);

    // Signal analysis
    let signal: 'high_iv' | 'low_iv' | 'neutral' = 'neutral';
    let recommendation = 'No strong IV-based signal.';

    if (ivRank >= 70) {
      signal = 'high_iv';
      recommendation = 'IV elevated. Consider selling premium or waiting for IV crush.';
    } else if (ivRank <= 30) {
      signal = 'low_iv';
      recommendation = 'IV depressed. Consider buying protective puts.';
    }

    const ivData: IVData = {
      symbol,
      ivRank: Math.round(ivRank),
      ivPercentile: Math.round(ivRank),
      atmIV: Math.round(atmIV * 10000) / 100,
      iv30: Math.round(atmIV * 10000) / 100,
      putCallRatio: Math.round(putCallRatio * 100) / 100,
      expectedMove: {
        weekly: Math.round(weeklyMove * 10000) / 100,
        monthly: Math.round(monthlyMove * 10000) / 100,
        quarterly: Math.round(quarterlyMove * 10000) / 100,
      },
      skew: Math.round(skew * 10000) / 100,
      timestamp: new Date().toISOString(),
      signal,
      recommendation,
    };

    // Cache result
    ivCache.set(symbol, { data: ivData, expires: Date.now() + CACHE_TTL });

    return ivData;
  } catch (error) {
    console.error(`[IV] Error fetching IV for ${symbol}:`, error);
    return getDefaultIVData(symbol);
  }
}

function getDefaultIVData(symbol: string): IVData {
  const defaultIV = 0.25;
  const DAYS_IN_YEAR = 365;

  return {
    symbol,
    ivRank: 50,
    ivPercentile: 50,
    atmIV: 25,
    iv30: 25,
    putCallRatio: 1.0,
    expectedMove: {
      weekly: Math.round(defaultIV * Math.sqrt(7 / DAYS_IN_YEAR) * 10000) / 100,
      monthly: Math.round(defaultIV * Math.sqrt(30 / DAYS_IN_YEAR) * 10000) / 100,
      quarterly: Math.round(defaultIV * Math.sqrt(90 / DAYS_IN_YEAR) * 10000) / 100,
    },
    skew: 0,
    timestamp: new Date().toISOString(),
    signal: 'neutral',
    recommendation: 'IV data unavailable. Using market average.',
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
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
    });
  }

  const requestId = `req-${Math.random().toString(36).slice(2, 8)}`;

  try {
    const symbolsParam = req.query.symbols as string;
    const symbols = symbolsParam
      ? symbolsParam.split(',').map((s) => s.trim().toUpperCase())
      : [];

    if (symbols.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'symbols parameter is required',
        meta: { requestId },
      });
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

    return res.status(200).json({
      success: true,
      data: {
        symbols: results,
        portfolio: {
          averageIV: Math.round(avgIV * 100) / 100,
          averageIVRank: Math.round(avgIVRank),
          highIVPositions: allIVs.filter(d => d.signal === 'high_iv').map(d => d.symbol),
          lowIVPositions: allIVs.filter(d => d.signal === 'low_iv').map(d => d.symbol),
        },
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId,
        symbolsRequested: limitedSymbols.length,
        symbolsReturned: Object.keys(results).length,
      },
    });
  } catch (error) {
    console.error('IV endpoint error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      meta: { requestId },
    });
  }
}
