import type { VercelRequest, VercelResponse } from '@vercel/node';
import { EarningsOracle } from '../../../../src/earnings/EarningsOracle';

interface EarningsForecast {
  symbol: string;
  reportDate: string;
  expectedMove: number;
  expectedDirection: 'up' | 'down' | 'neutral';
  confidence: number;
  historicalAvgMove: number;
  beatRate?: number;
  recommendation: 'hold' | 'reduce' | 'hedge' | 'add';
  explanation: string;
  factors?: {
    historicalPattern: string;
    recentTrend: string;
    riskAssessment: string;
  };
}

// Fallback mock forecast generator
function generateMockForecast(symbol: string): EarningsForecast {
  const hash = symbol.split('').reduce((a, b) => a + b.charCodeAt(0), 0);

  // Generate report date (within next 30 days)
  const reportDate = new Date();
  reportDate.setDate(reportDate.getDate() + (hash % 30));

  // Sector-aware volatility
  const techSymbols = ['NVDA', 'AAPL', 'MSFT', 'GOOGL', 'META', 'AMD', 'AMZN', 'TSLA', 'NFLX'];
  const isTech = techSymbols.includes(symbol);

  const baseMove = isTech ? 5 + (hash % 5) : 3 + (hash % 4);
  const expectedMove = parseFloat((baseMove / 100).toFixed(3));
  const beatRate = 50 + (hash % 35);

  const directions: ('up' | 'down' | 'neutral')[] = ['up', 'down', 'neutral'];
  const expectedDirection = beatRate > 65 ? 'up' : beatRate < 45 ? 'down' : directions[hash % 3];
  const confidence = parseFloat((0.5 + (beatRate - 50) / 100 + (hash % 20) / 100).toFixed(2));
  const historicalAvgMove = parseFloat((baseMove / 100).toFixed(3));

  // Smarter recommendation based on metrics
  let recommendation: 'hold' | 'reduce' | 'hedge' | 'add';
  let explanation: string;

  if (baseMove > 7) {
    recommendation = 'hedge';
    explanation = `${symbol} has high historical earnings volatility (${baseMove}% average move). Consider protective options to hedge downside risk.`;
  } else if (baseMove > 5 && beatRate < 55) {
    recommendation = 'reduce';
    explanation = `${symbol} shows elevated earnings risk with ${baseMove}% expected move and ${beatRate}% beat rate. Consider reducing position size by 20-30%.`;
  } else if (beatRate > 70 && expectedDirection === 'up') {
    recommendation = 'add';
    explanation = `${symbol} has a strong ${beatRate}% beat rate with historically positive reactions. Risk/reward favors maintaining or adding to position.`;
  } else {
    recommendation = 'hold';
    explanation = `${symbol} has moderate earnings volatility (${baseMove}% average move). With ${beatRate}% beat rate, maintaining current position is reasonable.`;
  }

  return {
    symbol,
    reportDate: reportDate.toISOString().split('T')[0],
    expectedMove,
    expectedDirection,
    confidence: Math.min(0.95, Math.max(0.5, confidence)),
    historicalAvgMove,
    beatRate,
    recommendation,
    explanation,
    factors: {
      historicalPattern: `${beatRate}% beat rate, ${baseMove}% avg move`,
      recentTrend: isTech ? 'Elevated volatility in tech sector' : 'Stable historical patterns',
      riskAssessment: baseMove > 6 ? 'HIGH' : baseMove > 4 ? 'MODERATE' : 'LOW',
    },
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const start = Date.now();
  const { symbol, reportDate } = req.query;

  if (!symbol || typeof symbol !== 'string') {
    return res.status(400).json({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'symbol parameter required' },
    });
  }

  const upperSymbol = symbol.toUpperCase();
  let forecast: EarningsForecast;
  let source = 'mock';

  // Try real Oracle if API keys available
  const alphaVantageKey = process.env.ALPHA_VANTAGE_API_KEY;
  const polygonKey = process.env.POLYGON_API_KEY;

  if (alphaVantageKey && polygonKey && process.env.NODE_ENV === 'production') {
    try {
      const oracle = new EarningsOracle(alphaVantageKey, polygonKey);

      // Use provided report date or generate one
      const forecastDate = typeof reportDate === 'string'
        ? reportDate
        : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      forecast = await oracle.generateForecast(upperSymbol, forecastDate);
      source = 'oracle';
    } catch (error) {
      console.warn('Failed to generate Oracle forecast, using mock:', error);
      forecast = generateMockForecast(upperSymbol);
    }
  } else {
    forecast = generateMockForecast(upperSymbol);
  }

  return res.status(200).json({
    success: true,
    data: forecast,
    meta: {
      timestamp: new Date().toISOString(),
      requestId: `req-${Math.random().toString(36).slice(2, 8)}`,
      latencyMs: Date.now() - start,
      source,
    },
  });
}
