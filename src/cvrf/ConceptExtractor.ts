/**
 * FRONTIER ALPHA - CVRF Concept Extractor
 *
 * Extracts conceptual insights from trading episodes by analyzing:
 * - Profitable vs losing trades
 * - Factor exposure patterns
 * - Sentiment signals
 * - Timing characteristics
 * - Risk events
 *
 * Generates natural language conceptual insights that form the
 * "textual gradients" for belief optimization.
 */

import type {
  Episode,
  EpisodeComparison,
  TradingDecision,
  ConceptualInsight,
  AnalystPerspective,
  MetaPrompt,
  CVRFConfig,
} from './types.js';
import type { FactorExposure } from '../types/index.js';
import { DEFAULT_CVRF_CONFIG } from './types.js';

// ============================================================================
// CONCEPT EXTRACTION TEMPLATES
// ============================================================================

const INSIGHT_TEMPLATES = {
  factor: {
    positive: 'Strong {factor} exposure ({value}) contributed to {return}% outperformance',
    negative: 'Excessive {factor} exposure ({value}) led to {return}% underperformance',
    neutral: '{factor} exposure remained stable at {value}, providing baseline returns',
  },
  sentiment: {
    positive: 'Bullish sentiment signals ({confidence}% confidence) preceded {return}% gains',
    negative: 'Ignored bearish sentiment warnings, resulting in {return}% losses',
    neutral: 'Mixed sentiment provided no clear directional signal',
  },
  timing: {
    positive: 'Entry timing on {symbol} captured {return}% of the move',
    negative: 'Late entry on {symbol} missed {return}% of upside',
    neutral: 'Timing was neutral on {symbol}',
  },
  risk: {
    positive: 'Risk management limited drawdown to {drawdown}% during volatility spike',
    negative: 'Inadequate hedging led to {drawdown}% drawdown',
    neutral: 'Risk levels remained within tolerance at {drawdown}%',
  },
  allocation: {
    positive: 'Concentration in {symbol} ({weight}%) drove {return}% alpha',
    negative: 'Over-concentration in {symbol} ({weight}%) amplified {return}% loss',
    neutral: 'Balanced allocation maintained portfolio stability',
  },
  regime: {
    positive: 'Correctly identified {regime} regime and positioned accordingly',
    negative: 'Failed to adapt to {regime} regime shift',
    neutral: 'Regime remained consistent with expectations',
  },
};

// ============================================================================
// CONCEPT EXTRACTOR
// ============================================================================

export class ConceptExtractor {
  private config: CVRFConfig;
  private insightCounter = 0;

  constructor(config: Partial<CVRFConfig> = {}) {
    this.config = { ...DEFAULT_CVRF_CONFIG, ...config };
  }

  // ============================================================================
  // MAIN EXTRACTION METHODS
  // ============================================================================

  /**
   * Extract conceptual insights from an episode comparison
   */
  extractInsights(comparison: EpisodeComparison): ConceptualInsight[] {
    const insights: ConceptualInsight[] = [];

    // Extract factor insights
    insights.push(...this.extractFactorInsights(comparison));

    // Extract sentiment insights
    insights.push(...this.extractSentimentInsights(comparison));

    // Extract timing insights
    insights.push(...this.extractTimingInsights(comparison));

    // Extract risk insights
    insights.push(...this.extractRiskInsights(comparison));

    // Extract allocation insights
    insights.push(...this.extractAllocationInsights(comparison));

    // Extract regime insights
    insights.push(...this.extractRegimeInsights(comparison));

    // Filter by confidence and limit count
    return insights
      .filter(i => i.confidence >= this.config.minInsightConfidence)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, this.config.maxInsightsPerEpisode);
  }

  /**
   * Generate analyst perspectives from insights
   */
  generateAnalystPerspectives(insights: ConceptualInsight[]): AnalystPerspective[] {
    const perspectives: AnalystPerspective[] = [];

    // Group insights by analyst type
    const analystMapping: Record<string, AnalystPerspective['analyst']> = {
      factor: 'value',
      sentiment: 'sentiment',
      timing: 'technical',
      risk: 'risk',
      allocation: 'macro',
      regime: 'macro',
    };

    const grouped = new Map<AnalystPerspective['analyst'], ConceptualInsight[]>();

    for (const insight of insights) {
      const analyst = analystMapping[insight.type] || 'value';
      const existing = grouped.get(analyst) || [];
      existing.push(insight);
      grouped.set(analyst, existing);
    }

    // Build perspectives
    for (const [analyst, analystInsights] of grouped) {
      perspectives.push({
        analyst,
        insights: analystInsights,
        keyIndicators: this.extractKeyIndicators(analystInsights),
      });
    }

    return perspectives;
  }

  /**
   * Generate meta-prompt from insights (the textual optimization direction)
   */
  generateMetaPrompt(
    comparison: EpisodeComparison,
    insights: ConceptualInsight[]
  ): MetaPrompt {
    // Separate positive and negative insights
    const positiveInsights = insights.filter(i => i.impactDirection === 'positive');
    const negativeInsights = insights.filter(i => i.impactDirection === 'negative');

    // Generate optimization direction
    const optimizationDirection = this.composeOptimizationDirection(
      positiveInsights,
      negativeInsights,
      comparison.performanceDelta
    );

    // Extract key learnings
    const keyLearnings = this.extractKeyLearnings(insights);

    // Calculate factor adjustments
    const factorAdjustments = this.calculateFactorAdjustments(
      comparison.betterEpisode.factorExposures || [],
      comparison.worseEpisode.factorExposures || []
    );

    // Generate risk guidance
    const riskGuidance = this.generateRiskGuidance(comparison, insights);

    // Generate timing insights
    const timingInsights = this.generateTimingInsights(insights);

    return {
      optimizationDirection,
      keyLearnings,
      factorAdjustments,
      riskGuidance,
      timingInsights,
      generatedAt: new Date(),
    };
  }

  // ============================================================================
  // FACTOR INSIGHT EXTRACTION
  // ============================================================================

  private extractFactorInsights(comparison: EpisodeComparison): ConceptualInsight[] {
    const insights: ConceptualInsight[] = [];
    const { betterEpisode, worseEpisode, performanceDelta } = comparison;

    // Guard: factorExposures may not be populated
    const betterFactors = betterEpisode.factorExposures || [];
    const worseFactors = worseEpisode.factorExposures || [];

    if (betterFactors.length === 0) {
      return insights; // No factor data available
    }

    // Compare factor exposures between episodes
    for (const betterFactor of betterFactors) {
      const worseFactor = worseFactors.find(
        f => f.factor === betterFactor.factor
      );

      if (!worseFactor) continue;

      const exposureDiff = betterFactor.exposure - worseFactor.exposure;
      const absExposureDiff = Math.abs(exposureDiff);

      if (absExposureDiff > 0.2) {
        const direction = exposureDiff > 0 ? 'positive' : 'negative';
        const template = INSIGHT_TEMPLATES.factor[direction];

        insights.push({
          id: `insight_factor_${++this.insightCounter}`,
          type: 'factor',
          concept: template
            .replace('{factor}', betterFactor.factor)
            .replace('{value}', betterFactor.exposure.toFixed(2))
            .replace('{return}', (performanceDelta * 100).toFixed(1)),
          evidence: [
            `Better episode ${betterFactor.factor}: ${betterFactor.exposure.toFixed(2)}`,
            `Worse episode ${worseFactor.factor}: ${worseFactor.exposure.toFixed(2)}`,
            `Difference: ${exposureDiff.toFixed(2)}`,
          ],
          confidence: Math.min(0.95, betterFactor.confidence + absExposureDiff / 2),
          sourceEpisode: betterEpisode.id,
          impactDirection: direction,
        });
      }
    }

    return insights;
  }

  // ============================================================================
  // SENTIMENT INSIGHT EXTRACTION
  // ============================================================================

  private extractSentimentInsights(comparison: EpisodeComparison): ConceptualInsight[] {
    const insights: ConceptualInsight[] = [];
    const { betterEpisode, worseEpisode, profitableTrades, losingTrades } = comparison;

    // Analyze sentiment in profitable trades
    const profitableWithSentiment = profitableTrades.filter(t => t.sentiment);
    const losingWithSentiment = losingTrades.filter(t => t.sentiment);

    if (profitableWithSentiment.length > 0) {
      const avgConfidence = profitableWithSentiment.reduce(
        (sum, t) => sum + (t.sentiment?.confidence || 0), 0
      ) / profitableWithSentiment.length;

      const dominantLabel = this.getDominantSentimentLabel(profitableWithSentiment);

      insights.push({
        id: `insight_sentiment_${++this.insightCounter}`,
        type: 'sentiment',
        concept: `Following ${dominantLabel} sentiment signals (avg ${(avgConfidence * 100).toFixed(0)}% confidence) led to profitable trades`,
        evidence: profitableWithSentiment.map(t =>
          `${t.symbol}: ${t.sentiment?.label} (${((t.sentiment?.confidence || 0) * 100).toFixed(0)}%)`
        ),
        confidence: avgConfidence,
        sourceEpisode: betterEpisode.id,
        impactDirection: 'positive',
      });
    }

    if (losingWithSentiment.length > 0) {
      const avgConfidence = losingWithSentiment.reduce(
        (sum, t) => sum + (t.sentiment?.confidence || 0), 0
      ) / losingWithSentiment.length;

      const dominantLabel = this.getDominantSentimentLabel(losingWithSentiment);

      insights.push({
        id: `insight_sentiment_${++this.insightCounter}`,
        type: 'sentiment',
        concept: `Ignoring ${dominantLabel} sentiment signals resulted in losses`,
        evidence: losingWithSentiment.map(t =>
          `${t.symbol}: ${t.sentiment?.label} was ignored`
        ),
        confidence: avgConfidence,
        sourceEpisode: worseEpisode.id,
        impactDirection: 'negative',
      });
    }

    return insights;
  }

  // ============================================================================
  // TIMING INSIGHT EXTRACTION
  // ============================================================================

  private extractTimingInsights(comparison: EpisodeComparison): ConceptualInsight[] {
    const insights: ConceptualInsight[] = [];
    const { betterEpisode, profitableTrades, losingTrades } = comparison;

    // Analyze timing patterns in profitable vs losing trades
    if (profitableTrades.length > 0 && losingTrades.length > 0) {
      // Check if profitable trades had better timing (earlier entry)
      const avgProfitableTimestamp = this.getAverageTimestamp(profitableTrades);
      const avgLosingTimestamp = this.getAverageTimestamp(losingTrades);

      const timingDiff = avgLosingTimestamp - avgProfitableTimestamp;
      const daysDiff = timingDiff / (1000 * 60 * 60 * 24);

      if (Math.abs(daysDiff) > 1) {
        const direction = daysDiff > 0 ? 'positive' : 'negative';
        insights.push({
          id: `insight_timing_${++this.insightCounter}`,
          type: 'timing',
          concept: daysDiff > 0
            ? `Earlier entry timing (avg ${Math.abs(daysDiff).toFixed(1)} days) captured more upside`
            : `Delayed entries missed optimal entry points by ${Math.abs(daysDiff).toFixed(1)} days`,
          evidence: [
            `Profitable trades avg entry: relative day 0`,
            `Losing trades avg entry: ${daysDiff.toFixed(1)} days later`,
          ],
          confidence: Math.min(0.9, 0.5 + Math.abs(daysDiff) / 10),
          sourceEpisode: betterEpisode.id,
          impactDirection: direction,
        });
      }
    }

    return insights;
  }

  // ============================================================================
  // RISK INSIGHT EXTRACTION
  // ============================================================================

  private extractRiskInsights(comparison: EpisodeComparison): ConceptualInsight[] {
    const insights: ConceptualInsight[] = [];
    const { betterEpisode, worseEpisode, performanceDelta } = comparison;

    // Compare drawdowns (with safe defaults)
    const betterDrawdown = betterEpisode.maxDrawdown || 0;
    const worseDrawdown = worseEpisode.maxDrawdown || 0;
    const drawdownDiff = worseDrawdown - betterDrawdown;

    if (drawdownDiff > 0.02) { // 2% difference is significant
      insights.push({
        id: `insight_risk_${++this.insightCounter}`,
        type: 'risk',
        concept: INSIGHT_TEMPLATES.risk.positive
          .replace('{drawdown}', (betterDrawdown * 100).toFixed(1)),
        evidence: [
          `Better episode max drawdown: ${(betterDrawdown * 100).toFixed(1)}%`,
          `Worse episode max drawdown: ${(worseDrawdown * 100).toFixed(1)}%`,
          `Risk management saved: ${(drawdownDiff * 100).toFixed(1)}%`,
        ],
        confidence: Math.min(0.95, 0.6 + drawdownDiff * 5),
        sourceEpisode: betterEpisode.id,
        impactDirection: 'positive',
      });
    }

    if (worseDrawdown > 0.10) { // >10% drawdown is concerning
      insights.push({
        id: `insight_risk_${++this.insightCounter}`,
        type: 'risk',
        concept: INSIGHT_TEMPLATES.risk.negative
          .replace('{drawdown}', (worseDrawdown * 100).toFixed(1)),
        evidence: [
          `Drawdown exceeded 10% threshold`,
          `Consider tighter stop-losses or position sizing`,
        ],
        confidence: 0.85,
        sourceEpisode: worseEpisode.id,
        impactDirection: 'negative',
      });
    }

    return insights;
  }

  // ============================================================================
  // ALLOCATION INSIGHT EXTRACTION
  // ============================================================================

  private extractAllocationInsights(comparison: EpisodeComparison): ConceptualInsight[] {
    const insights: ConceptualInsight[] = [];
    const { betterEpisode, worseEpisode, profitableTrades, losingTrades } = comparison;

    // Analyze concentration in profitable vs losing trades
    const profitableWeights = profitableTrades.map(t => t.weightAfter);
    const losingWeights = losingTrades.map(t => t.weightAfter);

    if (profitableWeights.length > 0) {
      const maxProfitableWeight = Math.max(...profitableWeights);
      const topProfitable = profitableTrades.find(t => t.weightAfter === maxProfitableWeight);

      if (maxProfitableWeight > 0.10 && topProfitable) {
        insights.push({
          id: `insight_allocation_${++this.insightCounter}`,
          type: 'allocation',
          concept: INSIGHT_TEMPLATES.allocation.positive
            .replace('{symbol}', topProfitable.symbol)
            .replace('{weight}', (maxProfitableWeight * 100).toFixed(1))
            .replace('{return}', 'significant'),
          evidence: [
            `${topProfitable.symbol} weight: ${(maxProfitableWeight * 100).toFixed(1)}%`,
            `Action: ${topProfitable.action}`,
            `Confidence: ${(topProfitable.confidence * 100).toFixed(0)}%`,
          ],
          confidence: topProfitable.confidence,
          sourceEpisode: betterEpisode.id,
          impactDirection: 'positive',
        });
      }
    }

    if (losingWeights.length > 0) {
      const maxLosingWeight = Math.max(...losingWeights);
      const topLosing = losingTrades.find(t => t.weightAfter === maxLosingWeight);

      if (maxLosingWeight > 0.15 && topLosing) {
        insights.push({
          id: `insight_allocation_${++this.insightCounter}`,
          type: 'allocation',
          concept: INSIGHT_TEMPLATES.allocation.negative
            .replace('{symbol}', topLosing.symbol)
            .replace('{weight}', (maxLosingWeight * 100).toFixed(1))
            .replace('{return}', 'amplified'),
          evidence: [
            `Over-concentration in ${topLosing.symbol}: ${(maxLosingWeight * 100).toFixed(1)}%`,
            `Consider position limits`,
          ],
          confidence: 0.8,
          sourceEpisode: worseEpisode.id,
          impactDirection: 'negative',
        });
      }
    }

    return insights;
  }

  // ============================================================================
  // REGIME INSIGHT EXTRACTION
  // ============================================================================

  private extractRegimeInsights(comparison: EpisodeComparison): ConceptualInsight[] {
    const insights: ConceptualInsight[] = [];
    const { betterEpisode, worseEpisode, performanceDelta } = comparison;

    // Detect regime from factor exposures
    const betterRegime = this.detectRegime(betterEpisode.factorExposures || []);
    const worseRegime = this.detectRegime(worseEpisode.factorExposures || []);

    if (betterRegime !== worseRegime) {
      insights.push({
        id: `insight_regime_${++this.insightCounter}`,
        type: 'regime',
        concept: `Regime shift from ${worseRegime} to ${betterRegime} required portfolio adaptation`,
        evidence: [
          `Better episode regime: ${betterRegime}`,
          `Worse episode regime: ${worseRegime}`,
          `Adaptation improved returns by ${(performanceDelta * 100).toFixed(1)}%`,
        ],
        confidence: 0.75,
        sourceEpisode: betterEpisode.id,
        impactDirection: performanceDelta > 0 ? 'positive' : 'negative',
      });
    }

    return insights;
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private getDominantSentimentLabel(trades: TradingDecision[]): string {
    const counts = { positive: 0, negative: 0, neutral: 0 };
    for (const t of trades) {
      if (t.sentiment?.label) {
        counts[t.sentiment.label]++;
      }
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  }

  private getAverageTimestamp(trades: TradingDecision[]): number {
    if (trades.length === 0) return 0;
    const sum = trades.reduce((s, t) => s + t.timestamp.getTime(), 0);
    return sum / trades.length;
  }

  private detectRegime(factors: FactorExposure[]): string {
    const momentum = factors.find(f => f.factor === 'momentum')?.exposure || 0;
    const volatility = factors.find(f => f.factor === 'volatility')?.exposure || 0;
    const value = factors.find(f => f.factor === 'value')?.exposure || 0;

    if (momentum > 0.5 && volatility < 0.3) return 'bull';
    if (momentum < -0.5 || volatility > 0.8) return 'bear';
    if (volatility > 0.5) return 'volatile';
    return 'sideways';
  }

  private extractKeyIndicators(insights: ConceptualInsight[]): string[] {
    const indicators: string[] = [];
    for (const insight of insights) {
      if (insight.type === 'factor') {
        const match = insight.concept.match(/Strong (\w+) exposure/);
        if (match) indicators.push(match[1]);
      }
    }
    return [...new Set(indicators)];
  }

  private composeOptimizationDirection(
    positiveInsights: ConceptualInsight[],
    negativeInsights: ConceptualInsight[],
    performanceDelta: number
  ): string {
    const parts: string[] = [];

    if (performanceDelta > 0.05) {
      parts.push(`Performance improved by ${(performanceDelta * 100).toFixed(1)}%.`);
    } else if (performanceDelta < -0.05) {
      parts.push(`Performance declined by ${(Math.abs(performanceDelta) * 100).toFixed(1)}%.`);
    }

    if (positiveInsights.length > 0) {
      parts.push(`Reinforce: ${positiveInsights.slice(0, 2).map(i => i.type).join(', ')} strategies.`);
    }

    if (negativeInsights.length > 0) {
      parts.push(`Avoid: ${negativeInsights.slice(0, 2).map(i => i.type).join(', ')} patterns.`);
    }

    return parts.join(' ');
  }

  private extractKeyLearnings(insights: ConceptualInsight[]): string[] {
    return insights
      .filter(i => i.confidence > 0.7)
      .map(i => i.concept)
      .slice(0, 5);
  }

  private calculateFactorAdjustments(
    betterFactors: FactorExposure[],
    worseFactors: FactorExposure[]
  ): Map<string, number> {
    const adjustments = new Map<string, number>();

    for (const bf of betterFactors) {
      const wf = worseFactors.find(f => f.factor === bf.factor);
      if (wf) {
        const diff = bf.exposure - wf.exposure;
        if (Math.abs(diff) > 0.1) {
          adjustments.set(bf.factor, diff);
        }
      }
    }

    return adjustments;
  }

  private generateRiskGuidance(
    comparison: EpisodeComparison,
    insights: ConceptualInsight[]
  ): string {
    const riskInsights = insights.filter(i => i.type === 'risk');
    const betterDrawdown = comparison.betterEpisode.maxDrawdown || 0;
    const worseDrawdown = comparison.worseEpisode.maxDrawdown || 0;
    const drawdownDiff = worseDrawdown - betterDrawdown;

    if (drawdownDiff > 0.05) {
      return `Tighten risk controls. Better episode limited drawdown to ${(betterDrawdown * 100).toFixed(1)}%.`;
    } else if (betterDrawdown > 0.10) {
      return `Both episodes showed elevated risk. Consider reducing overall exposure.`;
    }

    return 'Risk levels acceptable. Maintain current risk parameters.';
  }

  private generateTimingInsights(insights: ConceptualInsight[]): string {
    const timingInsights = insights.filter(i => i.type === 'timing');
    if (timingInsights.length === 0) {
      return 'No significant timing patterns detected.';
    }

    return timingInsights.map(i => i.concept).join(' ');
  }
}

export const conceptExtractor = new ConceptExtractor();
