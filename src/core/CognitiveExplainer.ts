/**
 * FRONTIER ALPHA - Cognitive Explainer
 * 
 * THE KEY DIFFERENTIATOR: Generates human-readable explanations
 * for portfolio decisions, satisfying both user curiosity and
 * regulatory XAI requirements.
 * 
 * Example output:
 * "Reducing NVDA position from 8% to 5% because sentiment turned bearish 
 * after earnings miss. Historical data shows similar conditions led to 
 * 15% drawdowns. Momentum factor exposure decreased from +1.2 to +0.3."
 */

import type {
  CognitiveExplanation,
  FactorExposure,
  SentimentScore,
  EarningsImpactForecast,
} from '../types/index.js';

// ============================================================================
// EXPLANATION TEMPLATES
// ============================================================================

const TEMPLATES = {
  // Position changes
  increase: "Increasing {symbol} position from {oldWeight}% to {newWeight}% because {reasons}",
  decrease: "Reducing {symbol} position from {oldWeight}% to {newWeight}% because {reasons}",
  hold: "Maintaining {symbol} position at {weight}% as {reasons}",
  
  // Factor-based reasons
  factor_momentum_high: "momentum remains strong (+{value} sigma)",
  factor_momentum_low: "momentum has weakened ({value} sigma)",
  factor_value_high: "value metrics look attractive (P/E at {value}x)",
  factor_vol_high: "volatility has spiked to {value}%, suggesting caution",
  factor_vol_low: "volatility is contained at {value}%, supporting the position",
  
  // Sentiment reasons
  sentiment_bullish: "news sentiment turned bullish ({confidence}% confidence)",
  sentiment_bearish: "sentiment turned bearish across {sources} sources",
  sentiment_neutral: "sentiment remains neutral, maintaining current view",
  
  // Earnings reasons
  earnings_pre: "earnings report on {date} with expected move of ±{move}%",
  earnings_beat: "beat earnings expectations by {surprise}%",
  earnings_miss: "missed earnings by {surprise}%, triggering risk reduction",
  
  // Risk reasons
  risk_drawdown: "historical pattern shows {prob}% chance of {drawdown}% drawdown in similar conditions",
  risk_correlation: "correlation with {asset} increased to {corr}, reducing diversification benefit",
  risk_concentration: "position exceeded {limit}% concentration limit",
  
  // Rebalance reasons
  rebalance_drift: "position drifted {direction} from target weight",
  rebalance_factor: "rebalancing to maintain target {factor} exposure",
};

// ============================================================================
// COGNITIVE EXPLAINER
// ============================================================================

export class CognitiveExplainer {
  
  /**
   * Generate explanation for a portfolio allocation change
   */
  explainAllocationChange(
    symbol: string,
    oldWeight: number,
    newWeight: number,
    factors: {
      old: FactorExposure[];
      new: FactorExposure[];
    },
    sentiment?: SentimentScore,
    earnings?: EarningsImpactForecast
  ): CognitiveExplanation {
    const weightChange = newWeight - oldWeight;
    const action = this.determineAction(weightChange);
    
    // Collect reasons
    const reasons: string[] = [];
    let confidence = 0.5;
    
    // Factor-based reasons
    const factorReasons = this.analyzeFactorChanges(factors.old, factors.new);
    reasons.push(...factorReasons.reasons);
    confidence = Math.max(confidence, factorReasons.confidence);
    
    // Sentiment-based reasons
    if (sentiment) {
      const sentimentReason = this.analyzeSentiment(sentiment);
      if (sentimentReason) {
        reasons.push(sentimentReason.reason);
        confidence = Math.max(confidence, sentimentReason.confidence);
      }
    }
    
    // Earnings-based reasons
    if (earnings) {
      const earningsReason = this.analyzeEarnings(earnings);
      if (earningsReason) {
        reasons.push(earningsReason.reason);
        confidence = Math.max(confidence, earningsReason.confidence);
      }
    }
    
    // Generate narrative
    const narrative = this.composeNarrative(
      symbol, action, oldWeight, newWeight, reasons
    );
    
    return {
      action,
      symbol,
      weightChange,
      narrative,
      confidence,
      timestamp: new Date(),
    };
  }

  /**
   * Generate portfolio-level rebalancing explanation
   */
  explainRebalance(
    changes: Array<{
      symbol: string;
      oldWeight: number;
      newWeight: number;
      reason: string;
    }>,
    portfolioMetrics: {
      oldSharpe: number;
      newSharpe: number;
      oldVol: number;
      newVol: number;
    }
  ): string {
    const increases = changes.filter(c => c.newWeight > c.oldWeight);
    const decreases = changes.filter(c => c.newWeight < c.oldWeight);
    
    const parts: string[] = [
      `📊 **Portfolio Rebalance Summary**`,
      ``,
      `Sharpe Ratio: ${portfolioMetrics.oldSharpe.toFixed(2)} → ${portfolioMetrics.newSharpe.toFixed(2)}`,
      `Volatility: ${(portfolioMetrics.oldVol * 100).toFixed(1)}% → ${(portfolioMetrics.newVol * 100).toFixed(1)}%`,
      ``,
    ];
    
    if (increases.length > 0) {
      parts.push(`**Increases:**`);
      for (const c of increases.slice(0, 5)) {
        parts.push(`  • ${c.symbol}: ${(c.oldWeight * 100).toFixed(1)}% → ${(c.newWeight * 100).toFixed(1)}% (${c.reason})`);
      }
      parts.push(``);
    }
    
    if (decreases.length > 0) {
      parts.push(`**Decreases:**`);
      for (const c of decreases.slice(0, 5)) {
        parts.push(`  • ${c.symbol}: ${(c.oldWeight * 100).toFixed(1)}% → ${(c.newWeight * 100).toFixed(1)}% (${c.reason})`);
      }
    }
    
    return parts.join('\n');
  }

  /**
   * Generate earnings preview explanation
   */
  explainEarningsPreview(
    forecasts: EarningsImpactForecast[]
  ): string {
    const parts: string[] = [
      `📈 **Upcoming Earnings Impact Preview**`,
      ``,
    ];
    
    for (const f of forecasts) {
      const direction = f.expectedDirection === 'up' ? '📈' : f.expectedDirection === 'down' ? '📉' : '➡️';
      const conf = (f.confidence * 100).toFixed(0);
      
      parts.push(`**${f.symbol}** - ${f.reportDate.toLocaleDateString()}`);
      parts.push(`  ${direction} Expected move: ±${(f.expectedMove * 100).toFixed(1)}%`);
      parts.push(`  Historical avg: ±${(f.historicalAvgMove * 100).toFixed(1)}%`);
      parts.push(`  Recommendation: ${f.recommendation.toUpperCase()} (${conf}% confidence)`);
      parts.push(`  ${f.explanation}`);
      parts.push(``);
    }
    
    return parts.join('\n');
  }

  /**
   * Generate risk alert explanation
   */
  explainRiskAlert(
    symbol: string,
    riskType: 'drawdown' | 'volatility' | 'correlation' | 'concentration',
    currentValue: number,
    threshold: number,
    historicalContext?: string
  ): string {
    const alerts: Record<string, string> = {
      drawdown: `⚠️ **Drawdown Alert: ${symbol}**
        Current drawdown: ${(currentValue * 100).toFixed(1)}%
        Threshold: ${(threshold * 100).toFixed(1)}%
        ${historicalContext || 'Consider reducing position or implementing stop-loss.'}`,
      
      volatility: `⚠️ **Volatility Alert: ${symbol}**
        Current 21-day vol: ${(currentValue * 100).toFixed(1)}% annualized
        Your tolerance: ${(threshold * 100).toFixed(1)}%
        ${historicalContext || 'Elevated volatility may impact portfolio stability.'}`,
      
      correlation: `⚠️ **Correlation Alert: ${symbol}**
        Correlation with portfolio: ${currentValue.toFixed(2)}
        Diversification threshold: ${threshold.toFixed(2)}
        ${historicalContext || 'High correlation reduces diversification benefit.'}`,
      
      concentration: `⚠️ **Concentration Alert: ${symbol}**
        Current weight: ${(currentValue * 100).toFixed(1)}%
        Maximum allowed: ${(threshold * 100).toFixed(1)}%
        ${historicalContext || 'Consider trimming to maintain diversification.'}`,
    };
    
    return alerts[riskType] || `⚠️ Risk alert for ${symbol}`;
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  private determineAction(weightChange: number): 'buy' | 'sell' | 'hold' | 'rebalance' {
    if (weightChange > 0.02) return 'buy';
    if (weightChange < -0.02) return 'sell';
    if (Math.abs(weightChange) > 0.005) return 'rebalance';
    return 'hold';
  }

  private analyzeFactorChanges(
    oldFactors: FactorExposure[],
    newFactors: FactorExposure[]
  ): { reasons: string[]; confidence: number } {
    const reasons: string[] = [];
    let maxConfidence = 0;
    
    // Find significant factor changes
    for (const newF of newFactors) {
      const oldF = oldFactors.find(f => f.factor === newF.factor);
      if (!oldF) continue;
      
      const change = newF.exposure - oldF.exposure;
      if (Math.abs(change) < 0.3) continue;  // Significance threshold
      
      const direction = change > 0 ? 'increased' : 'decreased';
      const absChange = Math.abs(change).toFixed(2);
      
      reasons.push(`${newF.factor} factor ${direction} by ${absChange}`);
      maxConfidence = Math.max(maxConfidence, newF.confidence);
    }
    
    return { reasons, confidence: maxConfidence };
  }

  private analyzeSentiment(
    sentiment: SentimentScore
  ): { reason: string; confidence: number } | null {
    if (sentiment.confidence < 0.6) return null;  // Low confidence
    
    if (sentiment.label === 'positive' && sentiment.scores.positive > 0.7) {
      return {
        reason: `sentiment turned bullish (${(sentiment.confidence * 100).toFixed(0)}% confidence)`,
        confidence: sentiment.confidence,
      };
    }
    
    if (sentiment.label === 'negative' && sentiment.scores.negative > 0.7) {
      return {
        reason: `sentiment turned bearish (${(sentiment.confidence * 100).toFixed(0)}% confidence)`,
        confidence: sentiment.confidence,
      };
    }
    
    return null;
  }

  private analyzeEarnings(
    earnings: EarningsImpactForecast
  ): { reason: string; confidence: number } | null {
    if (earnings.confidence < 0.5) return null;
    
    const daysTilReport = Math.ceil(
      (earnings.reportDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    
    if (daysTilReport <= 7 && daysTilReport > 0) {
      return {
        reason: `earnings in ${daysTilReport} days, expected ±${(earnings.expectedMove * 100).toFixed(1)}% move`,
        confidence: earnings.confidence,
      };
    }
    
    return null;
  }

  private composeNarrative(
    symbol: string,
    action: 'buy' | 'sell' | 'hold' | 'rebalance',
    oldWeight: number,
    newWeight: number,
    reasons: string[]
  ): string {
    const oldPct = (oldWeight * 100).toFixed(1);
    const newPct = (newWeight * 100).toFixed(1);
    const reasonsStr = reasons.length > 0 ? reasons.join('; ') : 'maintaining current allocation strategy';
    
    switch (action) {
      case 'buy':
        return `Increasing ${symbol} from ${oldPct}% to ${newPct}% because ${reasonsStr}.`;
      case 'sell':
        return `Reducing ${symbol} from ${oldPct}% to ${newPct}% because ${reasonsStr}.`;
      case 'hold':
        return `Maintaining ${symbol} at ${newPct}% as ${reasonsStr}.`;
      case 'rebalance':
        return `Rebalancing ${symbol} from ${oldPct}% to ${newPct}% to maintain target allocation. ${reasonsStr}.`;
    }
  }

  /**
   * Generate daily portfolio commentary
   */
  generateDailyCommentary(
    portfolioReturn: number,
    marketReturn: number,
    topContributors: Array<{ symbol: string; contribution: number }>,
    factorPerformance: Array<{ factor: string; return: number }>
  ): string {
    const outperformance = portfolioReturn - marketReturn;
    const performanceWord = outperformance > 0 ? 'outperformed' : 'underperformed';
    
    const topStock = topContributors[0];
    const topFactor = factorPerformance.sort((a, b) => Math.abs(b.return) - Math.abs(a.return))[0];
    
    return `📊 **Daily Portfolio Update**

Your portfolio ${performanceWord} the market by ${(Math.abs(outperformance) * 100).toFixed(2)}%.

**Top Contributor:** ${topStock?.symbol || 'N/A'} added ${((topStock?.contribution || 0) * 100).toFixed(2)}% to returns.

**Key Factor:** ${topFactor?.factor || 'N/A'} factor ${topFactor && topFactor.return > 0 ? 'contributed positively' : 'detracted'} (${((topFactor?.return || 0) * 100).toFixed(2)}%).

_Frontier Alpha uses 80+ factors and real-time sentiment to optimize your portfolio._`;
  }
}

export const cognitiveExplainer = new CognitiveExplainer();
