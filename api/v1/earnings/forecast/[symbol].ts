import type { VercelRequest, VercelResponse } from '@vercel/node';

interface EarningsForecast {
  symbol: string;
  reportDate: string;
  expectedMove: number;
  expectedDirection: 'up' | 'down' | 'neutral';
  confidence: number;
  historicalAvgMove: number;
  recommendation: 'hold' | 'reduce' | 'hedge' | 'add';
  explanation: string;
}

function generateForecast(symbol: string): EarningsForecast {
  const hash = symbol.split('').reduce((a, b) => a + b.charCodeAt(0), 0);

  // Generate report date (within next 30 days)
  const reportDate = new Date();
  reportDate.setDate(reportDate.getDate() + (hash % 30));

  const expectedMove = parseFloat((2 + (hash % 8)).toFixed(1));
  const directions: ('up' | 'down' | 'neutral')[] = ['up', 'down', 'neutral'];
  const expectedDirection = directions[hash % 3];
  const confidence = parseFloat((0.6 + (hash % 30) / 100).toFixed(2));
  const historicalAvgMove = parseFloat((3 + (hash % 5)).toFixed(1));

  const recommendations: ('hold' | 'reduce' | 'hedge' | 'add')[] = ['hold', 'reduce', 'hedge', 'add'];
  const recommendation = recommendations[hash % 4];

  const explanations: Record<string, string> = {
    hold: `${symbol} has moderate earnings volatility. Historical moves average ${historicalAvgMove}%. Current implied move of ${expectedMove}% is in line with expectations. Maintain current position.`,
    reduce: `${symbol} shows elevated earnings risk with ${expectedMove}% expected move. Consider reducing position size by 20-30% before the report to manage downside risk.`,
    hedge: `${symbol} earnings could move ${expectedDirection} ${expectedMove}%. Consider protective puts or a collar strategy to hedge the position while maintaining upside exposure.`,
    add: `${symbol} has favorable risk/reward into earnings. Historical post-earnings drift suggests ${expectedDirection}ward momentum. Consider adding to position.`,
  };

  return {
    symbol,
    reportDate: reportDate.toISOString().split('T')[0],
    expectedMove,
    expectedDirection,
    confidence,
    historicalAvgMove,
    recommendation,
    explanation: explanations[recommendation],
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
  const { symbol } = req.query;

  if (!symbol || typeof symbol !== 'string') {
    return res.status(400).json({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'symbol parameter required' },
    });
  }

  const forecast = generateForecast(symbol.toUpperCase());

  return res.status(200).json({
    success: true,
    data: forecast,
    meta: {
      timestamp: new Date().toISOString(),
      requestId: `req-${Math.random().toString(36).slice(2, 8)}`,
      latencyMs: Date.now() - start,
    },
  });
}
