import type { VercelRequest, VercelResponse } from '@vercel/node';

interface SentimentScore {
  symbol: string;
  overallSentiment: number;
  sentimentLabel: string;
  newsCount: number;
  relevanceScore: number;
  buzzScore: number;
  timestamp: string;
  sources: Array<{
    title: string;
    source: string;
    url: string;
    sentiment: number;
    relevance: number;
    publishedAt: string;
  }>;
}

// Alpha Vantage API response type
interface AlphaVantageNewsResponse {
  feed?: Array<{
    title: string;
    source: string;
    url: string;
    time_published: string;
    ticker_sentiment?: Array<{
      ticker: string;
      ticker_sentiment_score: string;
      relevance_score: string;
    }>;
  }>;
}

// Known sentiment biases for demo
const KNOWN_BIASES: Record<string, number> = {
  NVDA: 0.35,
  AAPL: 0.15,
  MSFT: 0.20,
  GOOGL: 0.10,
  AMZN: 0.05,
  META: 0.25,
  TSLA: 0.40,
  JPM: 0.05,
  BAC: -0.05,
  GS: 0.10,
  AMD: 0.30,
  NFLX: 0.15,
  V: 0.10,
  MA: 0.10,
  JNJ: 0.05,
  UNH: 0.08,
  PFE: -0.10,
  MRK: 0.05,
};

function getSentimentLabel(score: number): string {
  if (score <= -0.35) return 'Bearish';
  if (score <= -0.15) return 'Somewhat-Bearish';
  if (score <= 0.15) return 'Neutral';
  if (score <= 0.35) return 'Somewhat-Bullish';
  return 'Bullish';
}

function generateMockSentiment(symbol: string): SentimentScore {
  const hash = symbol.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  const baseSentiment = KNOWN_BIASES[symbol] || ((hash % 100) - 50) / 100;
  const noise = ((hash * 13) % 20 - 10) / 100;
  const overallSentiment = Math.max(-1, Math.min(1, baseSentiment + noise));

  return {
    symbol,
    overallSentiment,
    sentimentLabel: getSentimentLabel(overallSentiment),
    newsCount: 5 + (hash % 20),
    relevanceScore: 0.5 + ((hash % 50) / 100),
    buzzScore: 0.8 + ((hash % 40) / 100),
    timestamp: new Date().toISOString(),
    sources: [],
  };
}

async function fetchAlphaVantageSentiment(
  symbol: string,
  apiKey: string
): Promise<SentimentScore | null> {
  try {
    const url = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${symbol}&apikey=${apiKey}&limit=50`;

    const response = await fetch(url);
    if (!response.ok) return null;

    const data: AlphaVantageNewsResponse = await response.json();

    if (!data.feed || data.feed.length === 0) return null;

    // Process sentiment data
    let totalWeight = 0;
    let weightedSentiment = 0;
    let totalRelevance = 0;
    const sources: SentimentScore['sources'] = [];

    for (const item of data.feed.slice(0, 20)) {
      const tickerSentiment = item.ticker_sentiment?.find(
        (ts: any) => ts.ticker === symbol
      );

      if (tickerSentiment) {
        const sentiment = parseFloat(tickerSentiment.ticker_sentiment_score);
        const relevance = parseFloat(tickerSentiment.relevance_score);

        if (relevance > 0.3) {
          // Parse date
          const dateStr = item.time_published;
          const year = parseInt(dateStr.slice(0, 4));
          const month = parseInt(dateStr.slice(4, 6)) - 1;
          const day = parseInt(dateStr.slice(6, 8));
          const hour = parseInt(dateStr.slice(9, 11));
          const minute = parseInt(dateStr.slice(11, 13));
          const publishedAt = new Date(year, month, day, hour, minute);

          const hoursAgo = (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60);
          const recencyWeight = Math.max(0, 1 - hoursAgo / 168);
          const weight = relevance * (0.5 + 0.5 * recencyWeight);

          weightedSentiment += sentiment * weight;
          totalWeight += weight;
          totalRelevance += relevance;

          sources.push({
            title: item.title,
            source: item.source,
            url: item.url,
            sentiment,
            relevance,
            publishedAt: publishedAt.toISOString(),
          });
        }
      }
    }

    const overallSentiment = totalWeight > 0 ? weightedSentiment / totalWeight : 0;
    const avgRelevance = sources.length > 0 ? totalRelevance / sources.length : 0;
    const buzzScore = Math.min(sources.length / 35, 2);

    return {
      symbol,
      overallSentiment,
      sentimentLabel: getSentimentLabel(overallSentiment),
      newsCount: sources.length,
      relevanceScore: avgRelevance,
      buzzScore,
      timestamp: new Date().toISOString(),
      sources: sources.slice(0, 10),
    };
  } catch (error) {
    console.error(`Failed to fetch sentiment for ${symbol}:`, error);
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const start = Date.now();
  const symbol = (req.query.symbol as string)?.toUpperCase();

  if (!symbol || symbol.length > 10) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid symbol' },
    });
  }

  let sentiment: SentimentScore;
  let dataSource: 'mock' | 'live' = 'mock';

  // Try Alpha Vantage first
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (apiKey) {
    const realSentiment = await fetchAlphaVantageSentiment(symbol, apiKey);
    if (realSentiment) {
      sentiment = realSentiment;
      dataSource = 'live';
    } else {
      sentiment = generateMockSentiment(symbol);
    }
  } else {
    sentiment = generateMockSentiment(symbol);
  }

  res.setHeader('X-Data-Source', dataSource);
  return res.status(200).json({
    success: true,
    data: sentiment,
    dataSource,
    meta: {
      timestamp: new Date().toISOString(),
      requestId: `req-${Math.random().toString(36).slice(2, 8)}`,
      latencyMs: Date.now() - start,
    },
  });
}
