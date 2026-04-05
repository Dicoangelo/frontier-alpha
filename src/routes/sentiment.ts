/**
 * Sentiment routes — Alpha Vantage news sentiment with mock fallback.
 *
 * Ported from `api/v1/sentiment/[symbol].ts` to unify on the single Fastify
 * surface exposed via `buildApp()`. Preserves live/mock dual-path behavior
 * and the X-Data-Source header contract.
 */

import type { FastifyInstance } from 'fastify';
import axios from 'axios';
import { logger } from '../observability/logger.js';
import type { APIResponse } from '../types/index.js';

interface RouteContext {
  server: unknown;
}

interface SentimentSource {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  score: number;
  label: string;
  relevance: number;
}

interface SentimentResult {
  symbol: string;
  score: number;
  label: string;
  confidence: number;
  articleCount: number;
  sources: SentimentSource[];
  timestamp: string;
  bias?: number;
}

const KNOWN_BIASES: Record<string, number> = {
  NVDA: 0.35, TSLA: 0.4, AAPL: 0.25, MSFT: 0.2, META: 0.15,
  GOOGL: 0.15, AMZN: 0.1, AMD: 0.3, PLTR: 0.3, COIN: 0.25,
  NFLX: 0.1, DIS: -0.1, INTC: -0.2, BA: -0.15, GME: 0.0,
};

function getSentimentLabel(score: number): string {
  if (score >= 0.35) return 'Bullish';
  if (score >= 0.15) return 'Somewhat-Bullish';
  if (score <= -0.35) return 'Bearish';
  if (score <= -0.15) return 'Somewhat-Bearish';
  return 'Neutral';
}

function generateMockSentiment(symbol: string): SentimentResult {
  const bias = KNOWN_BIASES[symbol.toUpperCase()] ?? 0;
  const hash = symbol.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const noise = ((hash % 100) / 100 - 0.5) * 0.3;
  const score = Math.max(-1, Math.min(1, bias + noise));
  return {
    symbol: symbol.toUpperCase(),
    score,
    label: getSentimentLabel(score),
    confidence: 0.5,
    articleCount: 0,
    sources: [],
    timestamp: new Date().toISOString(),
    bias,
  };
}

async function fetchAlphaVantageSentiment(symbol: string, apiKey: string): Promise<SentimentResult | null> {
  try {
    const url = 'https://www.alphavantage.co/query';
    const res = await axios.get(url, {
      params: {
        function: 'NEWS_SENTIMENT',
        tickers: symbol.toUpperCase(),
        limit: 50,
        apikey: apiKey,
      },
      timeout: 10000,
    });

    const feed = (res.data as { feed?: unknown[] }).feed;
    if (!feed || !Array.isArray(feed) || feed.length === 0) return null;

    const now = Date.now();
    const windowMs = 168 * 60 * 60 * 1000;
    let weightedSum = 0;
    let weightTotal = 0;
    const sources: SentimentSource[] = [];

    for (const itemUnknown of feed) {
      const item = itemUnknown as Record<string, unknown>;
      const tickerSentiments = item.ticker_sentiment as Array<Record<string, string>> | undefined;
      const match = tickerSentiments?.find((t) => t.ticker === symbol.toUpperCase());
      if (!match) continue;
      const relevance = parseFloat(match.relevance_score || '0');
      if (relevance < 0.3) continue;

      const score = parseFloat(match.ticker_sentiment_score || '0');
      const label = match.ticker_sentiment_label || getSentimentLabel(score);
      const published = String(item.time_published || '');
      // Alpha Vantage format: YYYYMMDDTHHMMSS
      const pubDate =
        published.length >= 15
          ? new Date(
              `${published.slice(0, 4)}-${published.slice(4, 6)}-${published.slice(6, 8)}T${published.slice(9, 11)}:${published.slice(11, 13)}:${published.slice(13, 15)}Z`
            )
          : new Date();
      const ageMs = now - pubDate.getTime();
      if (ageMs > windowMs) continue;
      const recency = Math.max(0, 1 - ageMs / windowMs);
      const weight = relevance * recency;

      weightedSum += score * weight;
      weightTotal += weight;

      if (sources.length < 10) {
        sources.push({
          title: String(item.title || ''),
          url: String(item.url || ''),
          source: String(item.source || ''),
          publishedAt: pubDate.toISOString(),
          score,
          label,
          relevance,
        });
      }
    }

    if (weightTotal === 0) return null;

    const aggregateScore = weightedSum / weightTotal;
    return {
      symbol: symbol.toUpperCase(),
      score: aggregateScore,
      label: getSentimentLabel(aggregateScore),
      confidence: Math.min(1, weightTotal),
      articleCount: sources.length,
      sources,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.warn({ err: error, symbol }, 'Alpha Vantage sentiment fetch failed');
    return null;
  }
}

export async function sentimentRoutes(fastify: FastifyInstance, _opts: RouteContext) {
  fastify.get<{ Params: { symbol: string }; Reply: APIResponse<unknown> }>(
    '/api/v1/sentiment/:symbol',
    async (request, reply) => {
      const start = Date.now();
      const { symbol } = request.params;

      if (!symbol || symbol.length > 10) {
        return reply.status(400).send({
          success: false,
          error: { code: 'BAD_REQUEST', message: 'Invalid symbol' },
        });
      }

      const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
      let result: SentimentResult | null = null;
      let dataSource = 'mock';

      if (apiKey) {
        result = await fetchAlphaVantageSentiment(symbol, apiKey);
        if (result) dataSource = 'live';
      }
      if (!result) result = generateMockSentiment(symbol);

      reply.header('X-Data-Source', dataSource);
      return {
        success: true,
        data: result,
        meta: { timestamp: new Date(), requestId: request.id, latencyMs: Date.now() - start },
      };
    }
  );
}
