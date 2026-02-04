import type { VercelRequest, VercelResponse } from '@vercel/node';

interface EarningsEvent {
  symbol: string;
  reportDate: string;
  reportTime: 'pre_market' | 'post_market' | 'during_market';
  fiscalQuarter: string;
  epsEstimate: number;
  revenueEstimate: number;
}

// Generate mock upcoming earnings for demo symbols
function generateMockEarnings(days: number): EarningsEvent[] {
  const symbols = ['NVDA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'JPM', 'V', 'JNJ'];
  const events: EarningsEvent[] = [];
  const now = new Date();

  for (const symbol of symbols) {
    // Random date within the specified range
    const daysOffset = Math.floor(Math.random() * days);
    const reportDate = new Date(now);
    reportDate.setDate(reportDate.getDate() + daysOffset);

    // Hash-based deterministic values
    const hash = symbol.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    const reportTimes: ('pre_market' | 'post_market' | 'during_market')[] = ['pre_market', 'post_market', 'during_market'];

    events.push({
      symbol,
      reportDate: reportDate.toISOString().split('T')[0],
      reportTime: reportTimes[hash % 3],
      fiscalQuarter: `Q${((Math.floor(reportDate.getMonth() / 3) + 1) % 4) + 1} ${reportDate.getFullYear()}`,
      epsEstimate: parseFloat((1 + (hash % 10) * 0.5).toFixed(2)),
      revenueEstimate: parseFloat(((10 + (hash % 90)) * 1e9).toFixed(0)),
    });
  }

  return events.sort((a, b) => new Date(a.reportDate).getTime() - new Date(b.reportDate).getTime());
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const start = Date.now();
  const days = parseInt(req.query.days as string) || 30;

  const events = generateMockEarnings(days);

  return res.status(200).json({
    success: true,
    data: events,
    meta: {
      timestamp: new Date().toISOString(),
      requestId: `req-${Math.random().toString(36).slice(2, 8)}`,
      latencyMs: Date.now() - start,
    },
  });
}
