/**
 * FRONTIER ALPHA - Earnings Impact Oracle
 * 
 * Predicts stock price reaction to earnings announcements using:
 * - Historical earnings reactions
 * - Factor exposures at announcement time
 * - Options implied volatility
 * - Sentiment leading into earnings
 * 
 * INNOVATION: Factor-adjusted expected moves, not just historical averages.
 */

import type {
  EarningsImpactForecast,
  EarningsEvent,
  EarningsReaction,
  FactorExposure,
  SentimentScore,
} from '../types/index.js';

// ============================================================================
// EARNINGS ORACLE
// ============================================================================

export class EarningsOracle {
  private historicalReactions: Map<string, EarningsReaction[]> = new Map();
  
  /**
   * Forecast earnings impact for a symbol
   */
  async forecast(
    symbol: string,
    upcomingEarnings: EarningsEvent,
    currentFactors: FactorExposure[],
    currentSentiment?: SentimentScore
  ): Promise<EarningsImpactForecast> {
    // Get historical reactions
    const historical = this.historicalReactions.get(symbol) || 
                       await this.fetchHistoricalReactions(symbol);
    
    // Calculate base expected move from history
    const baseMove = this.calculateHistoricalAvgMove(historical);
    
    // Adjust for current factor exposures
    const factorAdjustment = this.factorAdjustment(currentFactors, historical);
    
    // Adjust for sentiment
    const sentimentAdjustment = this.sentimentAdjustment(currentSentiment);
    
    // Combine adjustments
    const expectedMove = baseMove * (1 + factorAdjustment + sentimentAdjustment);
    
    // Determine expected direction
    const direction = this.predictDirection(currentFactors, currentSentiment, historical);
    
    // Calculate confidence
    const confidence = this.calculateConfidence(historical.length, currentFactors);
    
    // Generate recommendation
    const recommendation = this.generateRecommendation(expectedMove, confidence, direction);
    
    // Generate explanation
    const explanation = this.generateExplanation(
      symbol, upcomingEarnings, expectedMove, direction, baseMove, 
      factorAdjustment, sentimentAdjustment, recommendation
    );
    
    return {
      symbol,
      reportDate: upcomingEarnings.reportDate,
      expectedMove,
      expectedDirection: direction,
      confidence,
      historicalAvgMove: baseMove,
      recommendation,
      explanation,
    };
  }

  /**
   * Get upcoming earnings for a list of symbols
   */
  async getUpcomingEarnings(
    symbols: string[],
    daysAhead: number = 14
  ): Promise<EarningsEvent[]> {
    // In production: Fetch from Alpha Vantage or earnings calendar API
    // Mock: Generate random earnings dates
    
    const events: EarningsEvent[] = [];
    const now = new Date();
    
    for (const symbol of symbols) {
      // Simulate ~25% of stocks reporting in next 14 days
      if (Math.random() > 0.25) continue;
      
      const daysUntil = Math.floor(Math.random() * daysAhead) + 1;
      const reportDate = new Date(now.getTime() + daysUntil * 24 * 60 * 60 * 1000);
      
      // Generate mock estimates
      const hash = symbol.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
      const baseEPS = 1 + (hash % 10) / 2;
      
      events.push({
        symbol,
        reportDate,
        fiscalQuarter: this.getCurrentQuarter(),
        epsEstimate: baseEPS,
        revenueEstimate: baseEPS * 10_000_000_000,
      });
    }
    
    return events.sort((a, b) => a.reportDate.getTime() - b.reportDate.getTime());
  }

  // ============================================================================
  // ADJUSTMENT CALCULATIONS
  // ============================================================================

  /**
   * Calculate factor-based adjustment to expected move
   */
  private factorAdjustment(
    currentFactors: FactorExposure[],
    _historical: EarningsReaction[]
  ): number {
    // Key factors that amplify/dampen earnings reactions
    const factorWeights: Record<string, number> = {
      'momentum_12m': 0.15,    // High momentum stocks move more
      'volatility': 0.20,      // High vol stocks move more
      'sentiment_news': 0.10,  // Positive sentiment dampens negative reactions
      'market': 0.05,          // High beta stocks move more
    };
    
    let adjustment = 0;
    
    for (const factor of currentFactors) {
      const weight = factorWeights[factor.factor] || 0;
      if (weight > 0) {
        // Positive exposure amplifies, negative dampens
        adjustment += weight * factor.exposure;
      }
    }
    
    // Cap adjustment at ±30%
    return Math.max(-0.3, Math.min(0.3, adjustment));
  }

  /**
   * Calculate sentiment-based adjustment
   */
  private sentimentAdjustment(sentiment?: SentimentScore): number {
    if (!sentiment) return 0;
    
    // Very positive sentiment heading in -> expectations high -> harder to beat
    if (sentiment.label === 'positive' && sentiment.confidence > 0.7) {
      return -0.1;  // Reduce expected positive reaction
    }
    
    // Very negative sentiment -> low expectations -> easier to surprise
    if (sentiment.label === 'negative' && sentiment.confidence > 0.7) {
      return 0.1;  // Increase expected positive reaction
    }
    
    return 0;
  }

  /**
   * Predict direction of earnings reaction
   */
  private predictDirection(
    factors: FactorExposure[],
    sentiment?: SentimentScore,
    historical?: EarningsReaction[]
  ): 'up' | 'down' | 'neutral' {
    let score = 0;
    
    // Factor signals
    const momentumFactor = factors.find(f => f.factor === 'momentum_12m');
    if (momentumFactor) {
      score += momentumFactor.exposure > 0.5 ? 1 : momentumFactor.exposure < -0.5 ? -1 : 0;
    }
    
    // Sentiment signal
    if (sentiment) {
      score += sentiment.label === 'positive' ? 0.5 : sentiment.label === 'negative' ? -0.5 : 0;
    }
    
    // Historical pattern
    if (historical && historical.length >= 4) {
      const lastFour = historical.slice(-4);
      const avgReaction = lastFour.reduce((sum, r) => sum + r.priceChangePost, 0) / 4;
      score += avgReaction > 0.02 ? 0.5 : avgReaction < -0.02 ? -0.5 : 0;
    }
    
    if (score > 0.5) return 'up';
    if (score < -0.5) return 'down';
    return 'neutral';
  }

  /**
   * Calculate confidence in forecast
   */
  private calculateConfidence(
    historicalCount: number,
    factors: FactorExposure[]
  ): number {
    let confidence = 0.5;
    
    // More history = more confidence
    confidence += Math.min(historicalCount / 20, 0.2);
    
    // High factor confidence = more confidence
    const avgFactorConf = factors.reduce((sum, f) => sum + f.confidence, 0) / factors.length;
    confidence += avgFactorConf * 0.2;
    
    return Math.min(0.95, Math.max(0.3, confidence));
  }

  /**
   * Generate recommendation based on forecast
   */
  private generateRecommendation(
    expectedMove: number,
    confidence: number,
    direction: 'up' | 'down' | 'neutral'
  ): 'hold' | 'reduce' | 'hedge' {
    // High expected move + uncertain direction = hedge
    if (expectedMove > 0.08 && direction === 'neutral') {
      return 'hedge';
    }
    
    // High expected move + bearish + confident = reduce
    if (expectedMove > 0.06 && direction === 'down' && confidence > 0.6) {
      return 'reduce';
    }
    
    // Low expected move or bullish = hold
    return 'hold';
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private async fetchHistoricalReactions(symbol: string): Promise<EarningsReaction[]> {
    // In production: Fetch from earnings history API
    // Mock: Generate realistic historical reactions
    
    const reactions: EarningsReaction[] = [];
    const now = new Date();
    
    // Generate last 12 quarters
    for (let q = 0; q < 12; q++) {
      const reportDate = new Date(now);
      reportDate.setMonth(reportDate.getMonth() - 3 * q);
      
      // Random but somewhat consistent reactions
      const hash = (symbol.charCodeAt(0) + q) % 10;
      const baseMove = (hash - 5) / 50;  // -10% to +10%
      const noise = (Math.random() - 0.5) * 0.04;
      
      reactions.push({
        symbol,
        reportDate,
        priceChangePre: (Math.random() - 0.5) * 0.02,
        priceChangePost: baseMove + noise,
        volumeRatio: 1.5 + Math.random() * 2,
        impliedMove: Math.abs(baseMove) + 0.02,
        actualMove: Math.abs(baseMove + noise),
      });
    }
    
    this.historicalReactions.set(symbol, reactions);
    return reactions;
  }

  private calculateHistoricalAvgMove(reactions: EarningsReaction[]): number {
    if (reactions.length === 0) return 0.05;  // Default 5%
    
    const avgMove = reactions.reduce((sum, r) => sum + Math.abs(r.actualMove), 0) / reactions.length;
    return avgMove;
  }

  private getCurrentQuarter(): string {
    const now = new Date();
    const quarter = Math.floor(now.getMonth() / 3) + 1;
    return `Q${quarter} ${now.getFullYear()}`;
  }

  private generateExplanation(
    symbol: string,
    earnings: EarningsEvent,
    expectedMove: number,
    direction: 'up' | 'down' | 'neutral',
    baseMove: number,
    factorAdj: number,
    sentimentAdj: number,
    recommendation: 'hold' | 'reduce' | 'hedge'
  ): string {
    const movePct = (expectedMove * 100).toFixed(1);
    const basePct = (baseMove * 100).toFixed(1);
    const factorAdjPct = (factorAdj * 100).toFixed(1);
    
    let explanation = `${symbol} reports ${earnings.fiscalQuarter} earnings on ${earnings.reportDate.toLocaleDateString()}. `;
    explanation += `Expected move: ±${movePct}% (historical avg: ±${basePct}%). `;
    
    if (factorAdj !== 0) {
      explanation += `Factor adjustment: ${factorAdj > 0 ? '+' : ''}${factorAdjPct}% due to current momentum/volatility. `;
    }
    
    if (sentimentAdj !== 0) {
      explanation += `Sentiment adjustment: ${sentimentAdj > 0 ? 'lowered expectations' : 'elevated expectations'}. `;
    }
    
    if (direction !== 'neutral') {
      explanation += `Leaning ${direction} based on factor signals. `;
    }
    
    explanation += `Recommendation: ${recommendation.toUpperCase()}.`;
    
    return explanation;
  }
}

export const earningsOracle = new EarningsOracle();
