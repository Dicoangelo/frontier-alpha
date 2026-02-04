/**
 * EarningsOracle - Historical earnings analysis and forecasting
 *
 * Fetches and analyzes historical earnings reactions to provide
 * data-driven forecasts for upcoming earnings announcements.
 */

interface HistoricalEarning {
  reportDate: string;
  fiscalQuarter: string;
  estimatedEps: number;
  actualEps: number | null;
  surprise: number | null; // % surprise vs estimate
  priceMove: number | null; // % move on earnings day
  postEarningsDrift: number | null; // % move in following 5 days
}

interface EarningsPattern {
  symbol: string;
  avgMove: number;
  avgBeatMove: number;
  avgMissMove: number;
  beatRate: number; // % of time they beat
  reactions: HistoricalEarning[];
  volatilityTrend: 'increasing' | 'decreasing' | 'stable';
}

interface EarningsForecast {
  symbol: string;
  reportDate: string;
  expectedMove: number;
  expectedDirection: 'up' | 'down' | 'neutral';
  confidence: number;
  historicalAvgMove: number;
  beatRate: number;
  recommendation: 'hold' | 'reduce' | 'hedge' | 'add';
  explanation: string;
  factors: {
    historicalPattern: string;
    recentTrend: string;
    riskAssessment: string;
  };
}

interface DailyPrice {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjustedClose: number;
  volume: number;
}

export class EarningsOracle {
  private apiKey: string;
  private polygonApiKey: string;
  private historicalReactions: Map<string, EarningsPattern> = new Map();
  private priceCache: Map<string, DailyPrice[]> = new Map();

  constructor(apiKey: string, polygonApiKey?: string) {
    this.apiKey = apiKey;
    this.polygonApiKey = polygonApiKey || '';
  }

  /**
   * Fetch historical earnings for a symbol from Alpha Vantage
   */
  async fetchHistoricalEarnings(symbol: string): Promise<HistoricalEarning[]> {
    const url = `https://www.alphavantage.co/query?function=EARNINGS&symbol=${symbol}&apikey=${this.apiKey}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Alpha Vantage API error: ${response.status}`);
      }

      const data = await response.json();

      // Check for rate limit or error
      if (data.Note || data['Error Message']) {
        console.warn(`Alpha Vantage warning for ${symbol}:`, data.Note || data['Error Message']);
        return [];
      }

      const quarterlyEarnings = data.quarterlyEarnings || [];

      // Convert to our format (last 8 quarters)
      const earnings: HistoricalEarning[] = [];
      for (let i = 0; i < Math.min(8, quarterlyEarnings.length); i++) {
        const e = quarterlyEarnings[i];
        const estimated = parseFloat(e.estimatedEPS) || 0;
        const actual = parseFloat(e.reportedEPS);
        const surprise = estimated !== 0 && !isNaN(actual)
          ? ((actual - estimated) / Math.abs(estimated)) * 100
          : null;

        earnings.push({
          reportDate: e.reportedDate || e.fiscalDateEnding,
          fiscalQuarter: e.fiscalDateEnding,
          estimatedEps: estimated,
          actualEps: isNaN(actual) ? null : actual,
          surprise,
          priceMove: null, // Will be populated from price data
          postEarningsDrift: null,
        });
      }

      return earnings;
    } catch (error) {
      console.error(`Failed to fetch earnings for ${symbol}:`, error);
      return [];
    }
  }

  /**
   * Fetch historical daily prices from Polygon.io
   */
  async fetchHistoricalPrices(symbol: string, years: number = 2): Promise<DailyPrice[]> {
    // Check cache first
    const cached = this.priceCache.get(symbol);
    if (cached && cached.length > 0) {
      return cached;
    }

    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - years);

    const from = startDate.toISOString().split('T')[0];
    const to = endDate.toISOString().split('T')[0];

    const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${from}/${to}?adjusted=true&sort=asc&apiKey=${this.polygonApiKey}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Polygon API error: ${response.status}`);
      }

      const data = await response.json();

      if (data.status !== 'OK' || !data.results) {
        console.warn(`No price data for ${symbol}`);
        return [];
      }

      const prices: DailyPrice[] = data.results.map((bar: any) => ({
        date: new Date(bar.t).toISOString().split('T')[0],
        open: bar.o,
        high: bar.h,
        low: bar.l,
        close: bar.c,
        adjustedClose: bar.c,
        volume: bar.v,
      }));

      this.priceCache.set(symbol, prices);
      return prices;
    } catch (error) {
      console.error(`Failed to fetch prices for ${symbol}:`, error);
      return [];
    }
  }

  /**
   * Calculate price reaction around an earnings date
   */
  calculatePriceReaction(
    prices: DailyPrice[],
    earningsDate: string
  ): { priceMove: number | null; postEarningsDrift: number | null } {
    // Find the earnings date index
    const earningsIdx = prices.findIndex(p => p.date >= earningsDate);
    if (earningsIdx < 1) {
      return { priceMove: null, postEarningsDrift: null };
    }

    // Price move: close on earnings day vs previous close
    const prevClose = prices[earningsIdx - 1]?.close;
    const earningsClose = prices[earningsIdx]?.close;

    let priceMove: number | null = null;
    if (prevClose && earningsClose) {
      priceMove = ((earningsClose - prevClose) / prevClose) * 100;
    }

    // Post-earnings drift: 5-day move after earnings
    let postEarningsDrift: number | null = null;
    const fiveDaysLater = prices[earningsIdx + 5]?.close;
    if (earningsClose && fiveDaysLater) {
      postEarningsDrift = ((fiveDaysLater - earningsClose) / earningsClose) * 100;
    }

    return { priceMove, postEarningsDrift };
  }

  /**
   * Build complete earnings pattern for a symbol
   */
  async buildEarningsPattern(symbol: string): Promise<EarningsPattern | null> {
    // Check cache first
    const cached = this.historicalReactions.get(symbol);
    if (cached) {
      return cached;
    }

    // Fetch earnings and prices
    const [earnings, prices] = await Promise.all([
      this.fetchHistoricalEarnings(symbol),
      this.fetchHistoricalPrices(symbol),
    ]);

    if (earnings.length === 0) {
      return null;
    }

    // Calculate price reactions for each earnings
    const earningsWithPrices = earnings.map(e => {
      const { priceMove, postEarningsDrift } = this.calculatePriceReaction(prices, e.reportDate);
      return { ...e, priceMove, postEarningsDrift };
    });

    // Calculate pattern statistics
    const movesWithData = earningsWithPrices.filter(e => e.priceMove !== null);
    const beats = earningsWithPrices.filter(e => e.surprise !== null && e.surprise > 0);
    const misses = earningsWithPrices.filter(e => e.surprise !== null && e.surprise < 0);

    const avgMove = movesWithData.length > 0
      ? movesWithData.reduce((sum, e) => sum + Math.abs(e.priceMove!), 0) / movesWithData.length
      : 5; // Default 5%

    const beatsWithMoves = beats.filter(e => e.priceMove !== null);
    const avgBeatMove = beatsWithMoves.length > 0
      ? beatsWithMoves.reduce((sum, e) => sum + e.priceMove!, 0) / beatsWithMoves.length
      : 3;

    const missesWithMoves = misses.filter(e => e.priceMove !== null);
    const avgMissMove = missesWithMoves.length > 0
      ? missesWithMoves.reduce((sum, e) => sum + e.priceMove!, 0) / missesWithMoves.length
      : -3;

    const beatRate = earningsWithPrices.filter(e => e.surprise !== null).length > 0
      ? (beats.length / earningsWithPrices.filter(e => e.surprise !== null).length) * 100
      : 50;

    // Determine volatility trend
    let volatilityTrend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (movesWithData.length >= 4) {
      const recent = movesWithData.slice(0, 2).reduce((s, e) => s + Math.abs(e.priceMove!), 0) / 2;
      const older = movesWithData.slice(-2).reduce((s, e) => s + Math.abs(e.priceMove!), 0) / 2;
      if (recent > older * 1.3) volatilityTrend = 'increasing';
      else if (recent < older * 0.7) volatilityTrend = 'decreasing';
    }

    const pattern: EarningsPattern = {
      symbol,
      avgMove,
      avgBeatMove,
      avgMissMove,
      beatRate,
      reactions: earningsWithPrices,
      volatilityTrend,
    };

    this.historicalReactions.set(symbol, pattern);
    return pattern;
  }

  /**
   * Generate earnings forecast based on historical patterns
   */
  async generateForecast(symbol: string, reportDate: string): Promise<EarningsForecast> {
    const pattern = await this.buildEarningsPattern(symbol);

    // Base forecast on historical patterns
    const avgMove = pattern?.avgMove || 5;
    const beatRate = pattern?.beatRate || 50;
    const volatilityTrend = pattern?.volatilityTrend || 'stable';

    // Adjust expected move based on volatility trend
    let expectedMove = avgMove / 100; // Convert to decimal
    if (volatilityTrend === 'increasing') {
      expectedMove *= 1.2;
    } else if (volatilityTrend === 'decreasing') {
      expectedMove *= 0.8;
    }

    // Determine expected direction based on beat rate and recent patterns
    let expectedDirection: 'up' | 'down' | 'neutral' = 'neutral';
    if (pattern) {
      const recentReactions = pattern.reactions.slice(0, 3);
      const recentPositive = recentReactions.filter(r => r.priceMove !== null && r.priceMove > 0).length;

      if (beatRate > 70 && recentPositive >= 2) {
        expectedDirection = 'up';
      } else if (beatRate < 40 || recentPositive === 0) {
        expectedDirection = 'down';
      }
    }

    // Calculate confidence based on data quality
    let confidence = 0.5;
    if (pattern) {
      const dataPoints = pattern.reactions.filter(r => r.priceMove !== null).length;
      confidence = Math.min(0.95, 0.5 + (dataPoints / 16)); // Max 8 quarters = 0.5 bonus
    }

    // Generate recommendation
    let recommendation: 'hold' | 'reduce' | 'hedge' | 'add' = 'hold';
    let explanation: string;

    const factors = {
      historicalPattern: '',
      recentTrend: '',
      riskAssessment: '',
    };

    if (expectedMove > 0.08) {
      recommendation = 'hedge';
      explanation = `${symbol} shows high historical earnings volatility (${(avgMove).toFixed(1)}% average move). `;
      explanation += `Consider protective options to hedge downside risk before the ${reportDate} report.`;
      factors.historicalPattern = `Average earnings move: ${avgMove.toFixed(1)}%`;
      factors.recentTrend = `Volatility trend: ${volatilityTrend}`;
      factors.riskAssessment = 'HIGH - Consider position protection';
    } else if (expectedMove > 0.06 && volatilityTrend === 'increasing') {
      recommendation = 'reduce';
      explanation = `${symbol} has increasing earnings volatility with recent moves exceeding historical average. `;
      explanation += `Consider reducing position by 20-30% ahead of the report to manage risk.`;
      factors.historicalPattern = `Beat rate: ${beatRate.toFixed(0)}%, Avg move: ${avgMove.toFixed(1)}%`;
      factors.recentTrend = 'Volatility increasing in recent quarters';
      factors.riskAssessment = 'ELEVATED - Position reduction recommended';
    } else if (beatRate > 75 && expectedDirection === 'up' && confidence > 0.7) {
      recommendation = 'add';
      explanation = `${symbol} has a strong ${beatRate.toFixed(0)}% beat rate with positive post-earnings drift. `;
      explanation += `Historical patterns suggest favorable risk/reward for holding or adding ahead of earnings.`;
      factors.historicalPattern = `${beatRate.toFixed(0)}% beat rate over ${pattern?.reactions.length || 0} quarters`;
      factors.recentTrend = `Average beat move: +${pattern?.avgBeatMove?.toFixed(1) || 3}%`;
      factors.riskAssessment = 'FAVORABLE - Historically positive reactions';
    } else {
      recommendation = 'hold';
      explanation = `${symbol} shows moderate earnings volatility (${avgMove.toFixed(1)}% average move). `;
      explanation += `With a ${beatRate.toFixed(0)}% historical beat rate, maintaining current position is reasonable.`;
      factors.historicalPattern = `${pattern?.reactions.length || 0} quarters of data`;
      factors.recentTrend = `Volatility trend: ${volatilityTrend}`;
      factors.riskAssessment = 'MODERATE - Standard position management';
    }

    return {
      symbol,
      reportDate,
      expectedMove: parseFloat(expectedMove.toFixed(4)),
      expectedDirection,
      confidence: parseFloat(confidence.toFixed(2)),
      historicalAvgMove: parseFloat((avgMove / 100).toFixed(4)),
      beatRate: parseFloat(beatRate.toFixed(1)),
      recommendation,
      explanation,
      factors,
    };
  }

  /**
   * Get historical reactions for a symbol (for display)
   */
  async getHistoricalReactions(symbol: string): Promise<HistoricalEarning[]> {
    const pattern = await this.buildEarningsPattern(symbol);
    return pattern?.reactions || [];
  }

  /**
   * Generate mock patterns for development/fallback
   */
  static generateMockPattern(symbol: string): EarningsPattern {
    const hash = symbol.split('').reduce((a, b) => a + b.charCodeAt(0), 0);

    // Sector-based characteristics
    const techSymbols = ['NVDA', 'AAPL', 'MSFT', 'GOOGL', 'META', 'AMD', 'AMZN', 'TSLA', 'NFLX'];
    const isTech = techSymbols.includes(symbol);

    const baseMove = isTech ? 6 + (hash % 5) : 3 + (hash % 4);
    const beatRate = 50 + (hash % 40); // 50-90%

    // Generate mock historical reactions
    const reactions: HistoricalEarning[] = [];
    for (let i = 0; i < 8; i++) {
      const date = new Date();
      date.setMonth(date.getMonth() - (i * 3));

      const beat = (hash + i) % 10 < beatRate / 10;
      const surprise = beat ? 2 + (hash % 15) : -(1 + (hash % 10));
      const priceMove = beat ? 1 + (hash % baseMove) : -(1 + (hash % baseMove));

      reactions.push({
        reportDate: date.toISOString().split('T')[0],
        fiscalQuarter: `Q${4 - (i % 4)} ${date.getFullYear()}`,
        estimatedEps: 1 + (hash % 5) * 0.5,
        actualEps: 1 + (hash % 5) * 0.5 + surprise * 0.01,
        surprise,
        priceMove,
        postEarningsDrift: priceMove * 0.3,
      });
    }

    return {
      symbol,
      avgMove: baseMove,
      avgBeatMove: baseMove * 0.8,
      avgMissMove: -baseMove * 0.9,
      beatRate,
      reactions,
      volatilityTrend: isTech ? 'increasing' : 'stable',
    };
  }
}
