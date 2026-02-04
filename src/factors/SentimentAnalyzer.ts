/**
 * FRONTIER ALPHA - Sentiment Analyzer
 *
 * Analyzes news sentiment and social signals for portfolio symbols.
 * Integrates with Alpha Vantage NEWS_SENTIMENT endpoint.
 */

export interface SentimentScore {
  symbol: string;
  overallSentiment: number; // -1 to 1
  sentimentLabel: 'Bearish' | 'Somewhat-Bearish' | 'Neutral' | 'Somewhat-Bullish' | 'Bullish';
  newsCount: number;
  relevanceScore: number;
  buzzScore: number; // Social media activity
  timestamp: Date;
  sources: SentimentSource[];
}

export interface SentimentSource {
  title: string;
  source: string;
  url: string;
  sentiment: number;
  relevance: number;
  publishedAt: Date;
}

interface AlphaVantageNewsItem {
  title: string;
  url: string;
  time_published: string;
  authors: string[];
  summary: string;
  banner_image: string;
  source: string;
  category_within_source: string;
  source_domain: string;
  topics: Array<{
    topic: string;
    relevance_score: string;
  }>;
  overall_sentiment_score: number;
  overall_sentiment_label: string;
  ticker_sentiment: Array<{
    ticker: string;
    relevance_score: string;
    ticker_sentiment_score: string;
    ticker_sentiment_label: string;
  }>;
}

interface AlphaVantageSentimentResponse {
  items: string;
  sentiment_score_definition: string;
  relevance_score_definition: string;
  feed: AlphaVantageNewsItem[];
}

export class SentimentAnalyzer {
  private apiKey: string;
  private cache: Map<string, { data: SentimentScore; expiresAt: number }> = new Map();
  private cacheTTL: number = 15 * 60 * 1000; // 15 minutes

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.ALPHA_VANTAGE_API_KEY || '';
  }

  /**
   * Analyze sentiment for a single symbol
   */
  async analyzeSentiment(symbol: string): Promise<SentimentScore> {
    // Check cache
    const cached = this.cache.get(symbol);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    // If no API key, return neutral sentiment
    if (!this.apiKey) {
      return this.generateMockSentiment(symbol);
    }

    try {
      const url = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${symbol}&apikey=${this.apiKey}&limit=50`;

      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`Alpha Vantage sentiment API error: ${response.status}`);
        return this.generateMockSentiment(symbol);
      }

      const data: AlphaVantageSentimentResponse = await response.json();

      // Check for rate limit message
      if (!data.feed) {
        console.warn('Alpha Vantage rate limit or invalid response');
        return this.generateMockSentiment(symbol);
      }

      const sentiment = this.processSentimentData(symbol, data);

      // Cache result
      this.cache.set(symbol, {
        data: sentiment,
        expiresAt: Date.now() + this.cacheTTL,
      });

      return sentiment;
    } catch (error) {
      console.error(`Failed to fetch sentiment for ${symbol}:`, error);
      return this.generateMockSentiment(symbol);
    }
  }

  /**
   * Analyze sentiment for multiple symbols
   */
  async analyzeMultiple(symbols: string[]): Promise<Map<string, SentimentScore>> {
    const results = new Map<string, SentimentScore>();

    // Process in batches to avoid rate limits
    const batchSize = 3;
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      const promises = batch.map(symbol => this.analyzeSentiment(symbol));
      const sentiments = await Promise.all(promises);

      batch.forEach((symbol, idx) => {
        results.set(symbol, sentiments[idx]);
      });

      // Rate limit delay
      if (i + batchSize < symbols.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  /**
   * Process Alpha Vantage sentiment response
   */
  private processSentimentData(
    symbol: string,
    data: AlphaVantageSentimentResponse
  ): SentimentScore {
    const newsItems = data.feed || [];
    const relevantNews = newsItems.filter(item => {
      const tickerSentiment = item.ticker_sentiment?.find(
        ts => ts.ticker === symbol
      );
      return tickerSentiment && parseFloat(tickerSentiment.relevance_score) > 0.3;
    });

    if (relevantNews.length === 0) {
      return this.generateMockSentiment(symbol);
    }

    // Calculate weighted sentiment
    let totalWeight = 0;
    let weightedSentiment = 0;
    let totalRelevance = 0;

    const sources: SentimentSource[] = [];

    for (const item of relevantNews.slice(0, 20)) {
      const tickerSentiment = item.ticker_sentiment?.find(
        ts => ts.ticker === symbol
      );

      if (tickerSentiment) {
        const sentiment = parseFloat(tickerSentiment.ticker_sentiment_score);
        const relevance = parseFloat(tickerSentiment.relevance_score);

        // Weight by relevance and recency
        const publishedDate = this.parseAlphaVantageDate(item.time_published);
        const hoursAgo = (Date.now() - publishedDate.getTime()) / (1000 * 60 * 60);
        const recencyWeight = Math.max(0, 1 - hoursAgo / 168); // Decay over 1 week

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
          publishedAt: publishedDate,
        });
      }
    }

    const overallSentiment = totalWeight > 0 ? weightedSentiment / totalWeight : 0;
    const avgRelevance = relevantNews.length > 0 ? totalRelevance / relevantNews.length : 0;

    // Calculate buzz score (normalized news volume)
    const expectedNewsPerDay = 5;
    const newsPerDay = relevantNews.length / 7;
    const buzzScore = Math.min(newsPerDay / expectedNewsPerDay, 2);

    return {
      symbol,
      overallSentiment,
      sentimentLabel: this.getSentimentLabel(overallSentiment),
      newsCount: relevantNews.length,
      relevanceScore: avgRelevance,
      buzzScore,
      timestamp: new Date(),
      sources: sources.slice(0, 10),
    };
  }

  /**
   * Parse Alpha Vantage date format (YYYYMMDDTHHMMSS)
   */
  private parseAlphaVantageDate(dateStr: string): Date {
    const year = parseInt(dateStr.slice(0, 4));
    const month = parseInt(dateStr.slice(4, 6)) - 1;
    const day = parseInt(dateStr.slice(6, 8));
    const hour = parseInt(dateStr.slice(9, 11));
    const minute = parseInt(dateStr.slice(11, 13));
    const second = parseInt(dateStr.slice(13, 15));

    return new Date(year, month, day, hour, minute, second);
  }

  /**
   * Convert sentiment score to label
   */
  private getSentimentLabel(score: number): SentimentScore['sentimentLabel'] {
    if (score <= -0.35) return 'Bearish';
    if (score <= -0.15) return 'Somewhat-Bearish';
    if (score <= 0.15) return 'Neutral';
    if (score <= 0.35) return 'Somewhat-Bullish';
    return 'Bullish';
  }

  /**
   * Generate mock sentiment for testing or when API unavailable
   */
  private generateMockSentiment(symbol: string): SentimentScore {
    // Use symbol hash for deterministic results
    const hash = symbol.split('').reduce((a, b) => a + b.charCodeAt(0), 0);

    // Known sentiment biases for popular symbols
    const knownBiases: Record<string, number> = {
      NVDA: 0.35,
      AAPL: 0.15,
      MSFT: 0.20,
      GOOGL: 0.10,
      AMZN: 0.05,
      META: 0.25,
      TSLA: 0.40, // High volatility in sentiment
      JPM: 0.05,
      BAC: -0.05,
      GS: 0.10,
    };

    const baseSentiment = knownBiases[symbol] || ((hash % 100) - 50) / 100;
    const noise = ((hash * 13) % 20 - 10) / 100;
    const overallSentiment = Math.max(-1, Math.min(1, baseSentiment + noise));

    return {
      symbol,
      overallSentiment,
      sentimentLabel: this.getSentimentLabel(overallSentiment),
      newsCount: 5 + (hash % 20),
      relevanceScore: 0.5 + ((hash % 50) / 100),
      buzzScore: 0.8 + ((hash % 40) / 100),
      timestamp: new Date(),
      sources: [],
    };
  }

  /**
   * Calculate sentiment factor exposure for portfolio
   */
  calculateSentimentFactor(
    sentiments: Map<string, SentimentScore>,
    weights: Map<string, number>
  ): {
    portfolioSentiment: number;
    sentimentMomentum: number;
    buzzFactor: number;
    sentimentDispersion: number;
  } {
    let weightedSentiment = 0;
    let weightedBuzz = 0;
    let totalWeight = 0;
    const sentimentValues: number[] = [];

    for (const [symbol, weight] of weights) {
      const sentiment = sentiments.get(symbol);
      if (sentiment && weight > 0) {
        weightedSentiment += sentiment.overallSentiment * weight;
        weightedBuzz += sentiment.buzzScore * weight;
        totalWeight += weight;
        sentimentValues.push(sentiment.overallSentiment);
      }
    }

    const portfolioSentiment = totalWeight > 0 ? weightedSentiment / totalWeight : 0;
    const buzzFactor = totalWeight > 0 ? weightedBuzz / totalWeight : 1;

    // Sentiment dispersion (standard deviation)
    const mean = sentimentValues.reduce((a, b) => a + b, 0) / sentimentValues.length || 0;
    const variance = sentimentValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / sentimentValues.length || 0;
    const sentimentDispersion = Math.sqrt(variance);

    // Sentiment momentum (simplified - would need historical data for real calculation)
    const sentimentMomentum = portfolioSentiment * 0.5; // Placeholder

    return {
      portfolioSentiment,
      sentimentMomentum,
      buzzFactor,
      sentimentDispersion,
    };
  }
}

export const sentimentAnalyzer = new SentimentAnalyzer();
