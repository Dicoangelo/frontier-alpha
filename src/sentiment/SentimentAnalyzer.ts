/**
 * FRONTIER ALPHA - Sentiment Analyzer
 * 
 * Multi-source sentiment analysis for trading signals:
 * - News headlines (Reuters, Bloomberg, CNBC)
 * - Social media (Twitter/X, Reddit, StockTwits)
 * - SEC filings (8-K, 10-Q, 10-K sentiment extraction)
 * - Earnings call transcripts
 * 
 * Uses FinBERT for financial domain-specific sentiment.
 */

import type { SentimentScore, SentimentLabel } from '../types/index.js';

// ============================================================================
// TYPES
// ============================================================================

export interface SentimentSource {
  type: 'news' | 'social' | 'sec' | 'earnings';
  title: string;
  content: string;
  url?: string;
  timestamp: Date;
  author?: string;
}

export interface SentimentSignal {
  symbol: string;
  source: SentimentSource;
  sentiment: SentimentScore;
  impact: 'high' | 'medium' | 'low';
  keywords: string[];
}

export interface AggregateSentiment {
  symbol: string;
  period: '1h' | '4h' | '1d' | '1w';
  score: number;  // -1 to +1
  signalCount: number;
  trend: 'improving' | 'stable' | 'deteriorating';
  breakdown: {
    news: number;
    social: number;
    sec: number;
    earnings: number;
  };
}

// ============================================================================
// FINBERT KEYWORDS (for lightweight analysis)
// ============================================================================

const POSITIVE_KEYWORDS = new Set([
  'beat', 'beats', 'exceeded', 'exceeds', 'surpassed', 'outperform',
  'growth', 'growing', 'grew', 'profit', 'profitable', 'gains',
  'upgrade', 'upgraded', 'buy', 'bullish', 'strong', 'strength',
  'record', 'high', 'innovation', 'breakthrough', 'expansion',
  'acquisition', 'partnership', 'dividend', 'buyback', 'repurchase',
  'optimistic', 'confident', 'momentum', 'rally', 'surge', 'soar',
  'accelerate', 'accelerating', 'robust', 'solid', 'impressive'
]);

const NEGATIVE_KEYWORDS = new Set([
  'miss', 'missed', 'misses', 'below', 'disappointing', 'disappointed',
  'decline', 'declining', 'fell', 'fall', 'loss', 'losses', 'losing',
  'downgrade', 'downgraded', 'sell', 'bearish', 'weak', 'weakness',
  'low', 'lawsuit', 'investigation', 'probe', 'scandal', 'fraud',
  'layoff', 'layoffs', 'cut', 'cuts', 'cutting', 'restructuring',
  'pessimistic', 'concern', 'concerned', 'warning', 'warns', 'risk',
  'volatile', 'volatility', 'crash', 'plunge', 'tumble', 'slump'
]);

const INTENSIFIERS = new Set([
  'very', 'extremely', 'significantly', 'substantially', 'dramatically',
  'sharply', 'strongly', 'considerably', 'notably', 'remarkably'
]);

// ============================================================================
// SENTIMENT ANALYZER
// ============================================================================

export class SentimentAnalyzer {
  private signalCache: Map<string, SentimentSignal[]> = new Map();
  private mlEndpoint?: string;

  constructor(mlEndpoint?: string) {
    this.mlEndpoint = mlEndpoint || process.env.ML_SENTIMENT_ENDPOINT;
  }

  /**
   * Analyze sentiment of a single text
   */
  async analyze(text: string): Promise<SentimentScore> {
    // Try ML endpoint first (FinBERT)
    if (this.mlEndpoint) {
      try {
        const mlResult = await this.callFinBERT(text);
        if (mlResult) return mlResult;
      } catch (e) {
        console.warn('FinBERT fallback to keyword analysis:', e);
      }
    }

    // Fallback: Keyword-based analysis
    return this.keywordAnalysis(text);
  }

  /**
   * Analyze multiple sources for a symbol
   */
  async analyzeSources(
    symbol: string,
    sources: SentimentSource[]
  ): Promise<SentimentSignal[]> {
    const signals: SentimentSignal[] = [];

    for (const source of sources) {
      const text = `${source.title} ${source.content}`;
      const sentiment = await this.analyze(text);
      const keywords = this.extractKeywords(text);
      const impact = this.assessImpact(source, sentiment);

      signals.push({
        symbol,
        source,
        sentiment,
        impact,
        keywords,
      });
    }

    // Cache signals
    this.signalCache.set(symbol, signals);

    return signals;
  }

  /**
   * Get aggregated sentiment for a symbol
   */
  async getAggregate(
    symbol: string,
    period: '1h' | '4h' | '1d' | '1w' = '1d'
  ): Promise<AggregateSentiment> {
    const signals = this.signalCache.get(symbol) || [];
    const now = Date.now();

    // Filter by period
    const periodMs = {
      '1h': 60 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
      '1w': 7 * 24 * 60 * 60 * 1000,
    };

    const filteredSignals = signals.filter(
      s => now - s.source.timestamp.getTime() < periodMs[period]
    );

    if (filteredSignals.length === 0) {
      return {
        symbol,
        period,
        score: 0,
        signalCount: 0,
        trend: 'stable',
        breakdown: { news: 0, social: 0, sec: 0, earnings: 0 },
      };
    }

    // Calculate weighted average
    const weights = { high: 3, medium: 2, low: 1 };
    let totalWeight = 0;
    let weightedSum = 0;
    const breakdown = { news: 0, social: 0, sec: 0, earnings: 0 };
    const breakdownCount = { news: 0, social: 0, sec: 0, earnings: 0 };

    for (const signal of filteredSignals) {
      const weight = weights[signal.impact];
      const score = this.sentimentToScore(signal.sentiment);
      
      totalWeight += weight;
      weightedSum += weight * score;
      
      const sourceType = signal.source.type as keyof typeof breakdown;
      breakdown[sourceType] += score;
      breakdownCount[sourceType]++;
    }

    // Normalize breakdown
    for (const key of Object.keys(breakdown) as (keyof typeof breakdown)[]) {
      if (breakdownCount[key] > 0) {
        breakdown[key] /= breakdownCount[key];
      }
    }

    // Calculate trend (compare first half vs second half)
    const midpoint = filteredSignals.length / 2;
    const firstHalf = filteredSignals.slice(0, Math.floor(midpoint));
    const secondHalf = filteredSignals.slice(Math.floor(midpoint));

    const firstAvg = firstHalf.reduce((sum, s) => sum + this.sentimentToScore(s.sentiment), 0) / (firstHalf.length || 1);
    const secondAvg = secondHalf.reduce((sum, s) => sum + this.sentimentToScore(s.sentiment), 0) / (secondHalf.length || 1);

    let trend: 'improving' | 'stable' | 'deteriorating' = 'stable';
    if (secondAvg - firstAvg > 0.1) trend = 'improving';
    if (secondAvg - firstAvg < -0.1) trend = 'deteriorating';

    return {
      symbol,
      period,
      score: totalWeight > 0 ? weightedSum / totalWeight : 0,
      signalCount: filteredSignals.length,
      trend,
      breakdown,
    };
  }

  /**
   * Get real-time sentiment feed for symbols
   */
  async streamSentiment(
    symbols: string[],
    onSignal: (signal: SentimentSignal) => void
  ): Promise<() => void> {
    // In production: Connect to news/social APIs
    // Mock: Generate random signals
    
    const interval = setInterval(async () => {
      const symbol = symbols[Math.floor(Math.random() * symbols.length)];
      const mockSource: SentimentSource = {
        type: ['news', 'social', 'sec', 'earnings'][Math.floor(Math.random() * 4)] as any,
        title: this.generateMockHeadline(symbol),
        content: '',
        timestamp: new Date(),
      };

      const sentiment = await this.analyze(mockSource.title);
      const signal: SentimentSignal = {
        symbol,
        source: mockSource,
        sentiment,
        impact: this.assessImpact(mockSource, sentiment),
        keywords: this.extractKeywords(mockSource.title),
      };

      // Update cache
      const existing = this.signalCache.get(symbol) || [];
      existing.push(signal);
      if (existing.length > 100) existing.shift();  // Keep last 100
      this.signalCache.set(symbol, existing);

      onSignal(signal);
    }, 5000);  // Every 5 seconds

    return () => clearInterval(interval);
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async callFinBERT(text: string): Promise<SentimentScore | null> {
    if (!this.mlEndpoint) return null;

    try {
      const response = await fetch(`${this.mlEndpoint}/sentiment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts: [text] }),
      });

      if (!response.ok) return null;

      const results = await response.json();
      const result = results[0];

      return {
        label: result.label as SentimentLabel,
        confidence: result.confidence,
        scores: result.scores || {
          positive: result.label === 'positive' ? result.confidence : 0.1,
          neutral: result.label === 'neutral' ? result.confidence : 0.1,
          negative: result.label === 'negative' ? result.confidence : 0.1,
        },
      };
    } catch {
      return null;
    }
  }

  private keywordAnalysis(text: string): SentimentScore {
    const words = text.toLowerCase().split(/\W+/);
    
    let positiveCount = 0;
    let negativeCount = 0;
    let intensifierBonus = 0;

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const prevWord = words[i - 1];

      if (POSITIVE_KEYWORDS.has(word)) {
        positiveCount++;
        if (prevWord && INTENSIFIERS.has(prevWord)) intensifierBonus += 0.5;
      }
      if (NEGATIVE_KEYWORDS.has(word)) {
        negativeCount++;
        if (prevWord && INTENSIFIERS.has(prevWord)) intensifierBonus += 0.5;
      }
    }

    const total = positiveCount + negativeCount + 1;  // +1 to avoid division by zero
    const rawPositive = (positiveCount + intensifierBonus * (positiveCount > negativeCount ? 1 : 0)) / total;
    const rawNegative = (negativeCount + intensifierBonus * (negativeCount > positiveCount ? 1 : 0)) / total;
    const rawNeutral = 1 - rawPositive - rawNegative;

    // Normalize to ensure sum = 1
    const sum = rawPositive + rawNegative + Math.max(0, rawNeutral);
    const positive = rawPositive / sum;
    const negative = rawNegative / sum;
    const neutral = Math.max(0, rawNeutral) / sum;

    let label: SentimentLabel = 'neutral';
    let confidence = neutral;

    if (positive > negative && positive > neutral) {
      label = 'positive';
      confidence = positive;
    } else if (negative > positive && negative > neutral) {
      label = 'negative';
      confidence = negative;
    }

    return {
      label,
      confidence: Math.min(0.95, Math.max(0.3, confidence)),
      scores: { positive, neutral, negative },
    };
  }

  private extractKeywords(text: string): string[] {
    const words = text.toLowerCase().split(/\W+/);
    const keywords: string[] = [];

    for (const word of words) {
      if (POSITIVE_KEYWORDS.has(word) || NEGATIVE_KEYWORDS.has(word)) {
        keywords.push(word);
      }
    }

    return [...new Set(keywords)].slice(0, 5);
  }

  private assessImpact(
    source: SentimentSource,
    sentiment: SentimentScore
  ): 'high' | 'medium' | 'low' {
    // High confidence + strong sentiment = high impact
    if (sentiment.confidence > 0.8) {
      if (sentiment.label !== 'neutral') return 'high';
    }

    // SEC filings and earnings are high impact
    if (source.type === 'sec' || source.type === 'earnings') {
      return sentiment.confidence > 0.6 ? 'high' : 'medium';
    }

    // News is medium impact
    if (source.type === 'news') {
      return sentiment.confidence > 0.7 ? 'medium' : 'low';
    }

    // Social is usually low impact
    return 'low';
  }

  private sentimentToScore(sentiment: SentimentScore): number {
    // Convert sentiment to -1 to +1 scale
    return sentiment.scores.positive - sentiment.scores.negative;
  }

  private generateMockHeadline(symbol: string): string {
    const headlines = [
      `${symbol} beats quarterly earnings expectations, stock surges`,
      `${symbol} announces major partnership with tech giant`,
      `Analysts upgrade ${symbol} to buy rating`,
      `${symbol} faces regulatory investigation`,
      `${symbol} reports disappointing Q4 results`,
      `${symbol} announces $1B stock buyback program`,
      `${symbol} CEO steps down amid restructuring`,
      `${symbol} innovation drives strong momentum`,
      `Concerns grow over ${symbol} market position`,
      `${symbol} expands into emerging markets`,
    ];
    return headlines[Math.floor(Math.random() * headlines.length)];
  }
}

export const sentimentAnalyzer = new SentimentAnalyzer();
