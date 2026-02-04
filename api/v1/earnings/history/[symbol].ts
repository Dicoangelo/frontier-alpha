import type { VercelRequest, VercelResponse } from '@vercel/node';
import { EarningsOracle } from '../../../../src/earnings/EarningsOracle';

interface HistoricalReaction {
  reportDate: string;
  fiscalQuarter: string;
  estimatedEps: number;
  actualEps: number | null;
  surprise: number | null;
  priceMove: number | null;
  postEarningsDrift: number | null;
  outcome: 'beat' | 'miss' | 'inline' | 'unknown';
}

// Generate mock historical data as fallback
function generateMockHistory(symbol: string): HistoricalReaction[] {
  const hash = symbol.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  const reactions: HistoricalReaction[] = [];

  // Tech stocks have higher volatility
  const techSymbols = ['NVDA', 'AAPL', 'MSFT', 'GOOGL', 'META', 'AMD', 'AMZN', 'TSLA', 'NFLX'];
  const isTech = techSymbols.includes(symbol);
  const baseVol = isTech ? 6 : 3;

  for (let i = 0; i < 8; i++) {
    const date = new Date();
    date.setMonth(date.getMonth() - (i * 3));

    // Deterministic but varied outcomes
    const quarterSeed = hash + i * 17;
    const beat = quarterSeed % 10 < 6; // ~60% beat rate
    const surpriseMagnitude = 1 + (quarterSeed % 15);
    const surprise = beat ? surpriseMagnitude : -surpriseMagnitude * 0.7;

    // Price moves correlate with surprise but have some noise
    const basePriceMove = surprise * 0.3;
    const noise = ((quarterSeed % 10) - 5) * 0.5;
    const priceMove = basePriceMove + noise;

    // Post-earnings drift
    const drift = beat ? priceMove * 0.2 : priceMove * 0.1;

    const estimatedEps = 1 + ((hash % 20) * 0.1);
    const actualEps = estimatedEps * (1 + surprise / 100);

    let outcome: 'beat' | 'miss' | 'inline' | 'unknown';
    if (surprise > 2) outcome = 'beat';
    else if (surprise < -2) outcome = 'miss';
    else outcome = 'inline';

    reactions.push({
      reportDate: date.toISOString().split('T')[0],
      fiscalQuarter: `Q${4 - (i % 4)} ${date.getFullYear()}`,
      estimatedEps: parseFloat(estimatedEps.toFixed(2)),
      actualEps: parseFloat(actualEps.toFixed(2)),
      surprise: parseFloat(surprise.toFixed(1)),
      priceMove: parseFloat(priceMove.toFixed(2)),
      postEarningsDrift: parseFloat(drift.toFixed(2)),
      outcome,
    });
  }

  return reactions;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const start = Date.now();
  const { symbol } = req.query;

  if (!symbol || typeof symbol !== 'string') {
    return res.status(400).json({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'symbol parameter required' },
    });
  }

  const upperSymbol = symbol.toUpperCase();
  let reactions: HistoricalReaction[] = [];
  let source = 'mock';

  // Try real data if API keys available
  const alphaVantageKey = process.env.ALPHA_VANTAGE_API_KEY;
  const polygonKey = process.env.POLYGON_API_KEY;

  if (alphaVantageKey && polygonKey && process.env.NODE_ENV === 'production') {
    try {
      const oracle = new EarningsOracle(alphaVantageKey, polygonKey);
      const historicalData = await oracle.getHistoricalReactions(upperSymbol);

      if (historicalData.length > 0) {
        reactions = historicalData.map(h => ({
          ...h,
          outcome: h.surprise === null ? 'unknown' as const :
            h.surprise > 2 ? 'beat' as const :
              h.surprise < -2 ? 'miss' as const : 'inline' as const,
        }));
        source = 'alpha_vantage';
      }
    } catch (error) {
      console.warn('Failed to fetch real earnings history:', error);
    }
  }

  // Fallback to mock data
  if (reactions.length === 0) {
    reactions = generateMockHistory(upperSymbol);
  }

  // Calculate summary statistics
  const withMoves = reactions.filter(r => r.priceMove !== null);
  const beats = reactions.filter(r => r.outcome === 'beat');
  const misses = reactions.filter(r => r.outcome === 'miss');

  const summary = {
    quarters: reactions.length,
    beatRate: reactions.length > 0 ? (beats.length / reactions.length) * 100 : 0,
    avgMove: withMoves.length > 0
      ? withMoves.reduce((s, r) => s + Math.abs(r.priceMove!), 0) / withMoves.length
      : 0,
    avgBeatMove: beats.filter(r => r.priceMove !== null).length > 0
      ? beats.filter(r => r.priceMove !== null).reduce((s, r) => s + r.priceMove!, 0) / beats.filter(r => r.priceMove !== null).length
      : 0,
    avgMissMove: misses.filter(r => r.priceMove !== null).length > 0
      ? misses.filter(r => r.priceMove !== null).reduce((s, r) => s + r.priceMove!, 0) / misses.filter(r => r.priceMove !== null).length
      : 0,
  };

  return res.status(200).json({
    success: true,
    data: {
      symbol: upperSymbol,
      reactions,
      summary: {
        quarters: summary.quarters,
        beatRate: parseFloat(summary.beatRate.toFixed(1)),
        avgMove: parseFloat(summary.avgMove.toFixed(2)),
        avgBeatMove: parseFloat(summary.avgBeatMove.toFixed(2)),
        avgMissMove: parseFloat(summary.avgMissMove.toFixed(2)),
      },
    },
    meta: {
      timestamp: new Date().toISOString(),
      requestId: `req-${Math.random().toString(36).slice(2, 8)}`,
      latencyMs: Date.now() - start,
      source,
    },
  });
}
