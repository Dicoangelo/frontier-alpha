import type { VercelRequest, VercelResponse } from '@vercel/node';

interface Quote {
  symbol: string;
  timestamp: string;
  bid: number;
  ask: number;
  last: number;
  change: number;
  changePercent: number;
}

function generateMockQuote(symbol: string): Quote {
  const hash = symbol.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  const basePrice = 50 + (hash % 450);

  const noise = (Math.random() - 0.5) * 0.02;
  const price = basePrice * (1 + noise);
  const change = price * noise;

  return {
    symbol,
    timestamp: new Date().toISOString(),
    bid: price * 0.9999,
    ask: price * 1.0001,
    last: price,
    change,
    changePercent: noise * 100,
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

  const quote = generateMockQuote(symbol.toUpperCase());
  const dataSource = 'mock' as const;

  res.setHeader('X-Data-Source', dataSource);
  return res.status(200).json({
    success: true,
    data: quote,
    dataSource,
    meta: {
      timestamp: new Date().toISOString(),
      requestId: `req-${Math.random().toString(36).slice(2, 8)}`,
      latencyMs: Date.now() - start,
    },
  });
}
