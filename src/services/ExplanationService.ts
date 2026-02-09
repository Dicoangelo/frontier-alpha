/**
 * FRONTIER ALPHA - Explanation Service
 *
 * Orchestrates cognitive explanations for portfolio decisions.
 * Supports 5 explanation types with optional LLM integration
 * and in-memory caching (1 explanation per symbol per day).
 *
 * - If OPENAI_API_KEY is set, uses OpenAI for richer narratives
 * - Otherwise, falls back to enhanced template-based generation
 *   via the existing CognitiveExplainer
 */

import { CognitiveExplainer, cognitiveExplainer } from '../core/CognitiveExplainer.js';
import type {
  FactorExposure,
  SentimentScore,
  EarningsImpactForecast,
  Portfolio,
  Position,
} from '../types/index.js';

// ============================================================================
// TYPES
// ============================================================================

export type ExplanationType =
  | 'portfolio_move'
  | 'rebalance'
  | 'earnings'
  | 'risk_alert'
  | 'factor_shift';

export interface ExplanationResult {
  id: string;
  type: ExplanationType;
  symbol?: string;
  text: string;
  confidence: number;
  sources: string[];
  generatedAt: string;
  cached: boolean;
}

export interface ExplanationRequest {
  type: ExplanationType;
  symbol?: string;
  portfolio?: Portfolio;
  context?: ExplanationContext;
}

export interface ExplanationContext {
  factors?: FactorExposure[];
  sentiment?: SentimentScore;
  earnings?: EarningsImpactForecast;
  marketReturn?: number;
  portfolioReturn?: number;
  riskType?: 'drawdown' | 'volatility' | 'correlation' | 'concentration';
  riskValue?: number;
  riskThreshold?: number;
  rebalanceChanges?: Array<{
    symbol: string;
    oldWeight: number;
    newWeight: number;
    reason: string;
  }>;
  portfolioMetrics?: {
    oldSharpe: number;
    newSharpe: number;
    oldVol: number;
    newVol: number;
  };
}

// ============================================================================
// CACHE
// ============================================================================

interface CacheEntry {
  result: ExplanationResult;
  dateKey: string;
}

/**
 * Simple in-memory cache. Keyed by `${type}:${symbol || '_portfolio'}`.
 * Each entry is valid for the calendar day it was created.
 */
const cache = new Map<string, CacheEntry>();

function makeCacheKey(type: ExplanationType, symbol?: string): string {
  return `${type}:${symbol?.toUpperCase() || '_portfolio'}`;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function getCached(type: ExplanationType, symbol?: string): ExplanationResult | null {
  const key = makeCacheKey(type, symbol);
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.dateKey !== todayKey()) {
    cache.delete(key);
    return null;
  }
  return { ...entry.result, cached: true };
}

function setCache(result: ExplanationResult): void {
  const key = makeCacheKey(result.type, result.symbol);
  cache.set(key, { result, dateKey: todayKey() });
}

// ============================================================================
// LLM INTEGRATION (OPTIONAL)
// ============================================================================

/**
 * Check if an LLM API key is available for enhanced generation.
 */
function hasLLMKey(): boolean {
  return !!(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);
}

/**
 * Generate an explanation via OpenAI (if key present).
 * Returns null if unavailable or on error, allowing fallback.
 */
async function generateWithLLM(
  type: ExplanationType,
  prompt: string,
): Promise<{ text: string; confidence: number } | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are a senior portfolio analyst at Frontier Alpha, an AI-powered cognitive factor intelligence platform. ' +
              'Generate concise, actionable explanations for portfolio decisions. ' +
              'Use precise financial language. Keep responses under 200 words. ' +
              'Reference specific factors, metrics, and data points when available.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.4,
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      console.warn(`OpenAI API returned ${response.status}, falling back to templates`);
      return null;
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) return null;

    return { text, confidence: 0.85 };
  } catch (error) {
    console.warn('LLM generation failed, falling back to templates:', error);
    return null;
  }
}

// ============================================================================
// TEMPLATE-BASED GENERATION (FALLBACK)
// ============================================================================

function generatePortfolioMoveTemplate(
  symbol: string,
  context: ExplanationContext,
): { text: string; confidence: number; sources: string[] } {
  const factors = context.factors || [];
  const sentiment = context.sentiment;

  // Build factor summary
  const significantFactors = factors
    .filter(f => Math.abs(f.exposure) > 0.3)
    .sort((a, b) => Math.abs(b.exposure) - Math.abs(a.exposure))
    .slice(0, 3);

  const parts: string[] = [];
  let confidence = 0.6;
  const sources: string[] = ['factor_engine'];

  if (significantFactors.length > 0) {
    const factorDescriptions = significantFactors.map(f => {
      const direction = f.exposure > 0 ? 'positive' : 'negative';
      return `${f.factor} (${direction}, ${f.exposure.toFixed(2)} exposure)`;
    });
    parts.push(
      `${symbol} is currently driven by ${factorDescriptions.join(', ')}.`,
    );
    confidence = Math.max(
      confidence,
      ...significantFactors.map(f => f.confidence),
    );
  }

  if (sentiment) {
    sources.push('sentiment_analysis');
    if (sentiment.label === 'positive' && sentiment.scores.positive > 0.6) {
      parts.push(
        `Market sentiment is bullish (${(sentiment.confidence * 100).toFixed(0)}% confidence).`,
      );
    } else if (sentiment.label === 'negative' && sentiment.scores.negative > 0.6) {
      parts.push(
        `Market sentiment has turned bearish (${(sentiment.confidence * 100).toFixed(0)}% confidence), suggesting caution.`,
      );
    } else {
      parts.push('Sentiment remains neutral across monitored sources.');
    }
    confidence = Math.max(confidence, sentiment.confidence);
  }

  if (context.portfolioReturn !== undefined && context.marketReturn !== undefined) {
    sources.push('market_data');
    const alpha = context.portfolioReturn - context.marketReturn;
    const alphaWord = alpha >= 0 ? 'outperforming' : 'underperforming';
    parts.push(
      `Portfolio is ${alphaWord} the market by ${(Math.abs(alpha) * 100).toFixed(2)}%.`,
    );
  }

  if (parts.length === 0) {
    parts.push(
      `${symbol} position is being monitored. No significant factor changes detected at this time.`,
    );
  }

  return {
    text: parts.join(' '),
    confidence: Math.min(confidence, 0.95),
    sources,
  };
}

function generateRebalanceTemplate(
  context: ExplanationContext,
): { text: string; confidence: number; sources: string[] } {
  const changes = context.rebalanceChanges || [];
  const metrics = context.portfolioMetrics;
  const sources: string[] = ['factor_engine', 'portfolio_optimizer'];

  if (changes.length === 0 && !metrics) {
    return {
      text: 'No rebalancing changes are currently recommended. Portfolio weights are within target ranges.',
      confidence: 0.7,
      sources,
    };
  }

  const parts: string[] = [];

  if (metrics) {
    const sharpeDelta = metrics.newSharpe - metrics.oldSharpe;
    const volDelta = metrics.newVol - metrics.oldVol;
    parts.push(
      `Rebalancing targets a Sharpe ratio improvement from ${metrics.oldSharpe.toFixed(2)} to ${metrics.newSharpe.toFixed(2)} ` +
      `(${sharpeDelta > 0 ? '+' : ''}${sharpeDelta.toFixed(2)}).`,
    );
    parts.push(
      `Portfolio volatility ${volDelta > 0 ? 'increases' : 'decreases'} from ` +
      `${(metrics.oldVol * 100).toFixed(1)}% to ${(metrics.newVol * 100).toFixed(1)}%.`,
    );
  }

  const increases = changes.filter(c => c.newWeight > c.oldWeight);
  const decreases = changes.filter(c => c.newWeight < c.oldWeight);

  if (increases.length > 0) {
    const topIncrease = increases.sort((a, b) =>
      (b.newWeight - b.oldWeight) - (a.newWeight - a.oldWeight)
    )[0];
    parts.push(
      `Largest increase: ${topIncrease.symbol} from ${(topIncrease.oldWeight * 100).toFixed(1)}% ` +
      `to ${(topIncrease.newWeight * 100).toFixed(1)}% (${topIncrease.reason}).`,
    );
  }

  if (decreases.length > 0) {
    const topDecrease = decreases.sort((a, b) =>
      (a.newWeight - a.oldWeight) - (b.newWeight - b.oldWeight)
    )[0];
    parts.push(
      `Largest reduction: ${topDecrease.symbol} from ${(topDecrease.oldWeight * 100).toFixed(1)}% ` +
      `to ${(topDecrease.newWeight * 100).toFixed(1)}% (${topDecrease.reason}).`,
    );
  }

  parts.push(`${changes.length} position${changes.length !== 1 ? 's' : ''} adjusted total.`);

  return {
    text: parts.join(' '),
    confidence: 0.8,
    sources,
  };
}

function generateEarningsTemplate(
  symbol: string,
  context: ExplanationContext,
): { text: string; confidence: number; sources: string[] } {
  const earnings = context.earnings;
  const sources: string[] = ['earnings_calendar'];

  if (!earnings) {
    return {
      text: symbol
        ? `No upcoming earnings data available for ${symbol}.`
        : 'No upcoming earnings events detected for portfolio positions.',
      confidence: 0.5,
      sources,
    };
  }

  sources.push('factor_engine');
  const daysTilReport = Math.ceil(
    (earnings.reportDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );

  const parts: string[] = [];

  if (daysTilReport > 0) {
    parts.push(
      `${earnings.symbol} reports earnings in ${daysTilReport} day${daysTilReport !== 1 ? 's' : ''}.`,
    );
    parts.push(
      `Expected move: +/-${(earnings.expectedMove * 100).toFixed(1)}% ` +
      `(historical average: +/-${(earnings.historicalAvgMove * 100).toFixed(1)}%).`,
    );
    parts.push(
      `Recommendation: ${earnings.recommendation.toUpperCase()} position ` +
      `(${(earnings.confidence * 100).toFixed(0)}% confidence).`,
    );
  } else {
    parts.push(`${earnings.symbol} has recently reported earnings.`);
    parts.push(earnings.explanation);
  }

  return {
    text: parts.join(' '),
    confidence: earnings.confidence,
    sources,
  };
}

function generateRiskAlertTemplate(
  symbol: string,
  context: ExplanationContext,
): { text: string; confidence: number; sources: string[] } {
  const riskType = context.riskType || 'volatility';
  const value = context.riskValue ?? 0;
  const threshold = context.riskThreshold ?? 0;
  const sources: string[] = ['risk_engine', 'market_data'];

  const riskMessages: Record<string, string> = {
    drawdown:
      `${symbol || 'Portfolio'} drawdown has reached ${(value * 100).toFixed(1)}%, ` +
      `exceeding the ${(threshold * 100).toFixed(1)}% threshold. ` +
      `Consider reducing position size or implementing stop-loss protection.`,
    volatility:
      `${symbol || 'Portfolio'} 21-day annualized volatility is at ${(value * 100).toFixed(1)}%, ` +
      `above the ${(threshold * 100).toFixed(1)}% tolerance. ` +
      `Elevated volatility may impact portfolio stability and risk-adjusted returns.`,
    correlation:
      `${symbol || 'Position'} correlation with the portfolio has risen to ${value.toFixed(2)}, ` +
      `above the ${threshold.toFixed(2)} diversification threshold. ` +
      `High correlation reduces the diversification benefit of this holding.`,
    concentration:
      `${symbol || 'Position'} weight has grown to ${(value * 100).toFixed(1)}%, ` +
      `exceeding the ${(threshold * 100).toFixed(1)}% maximum. ` +
      `Consider trimming to maintain portfolio diversification.`,
  };

  return {
    text: riskMessages[riskType] || `Risk alert for ${symbol || 'portfolio'}: value ${value} exceeds threshold ${threshold}.`,
    confidence: 0.9,
    sources,
  };
}

function generateFactorShiftTemplate(
  symbol: string,
  context: ExplanationContext,
): { text: string; confidence: number; sources: string[] } {
  const factors = context.factors || [];
  const sources: string[] = ['factor_engine'];

  if (factors.length === 0) {
    return {
      text: symbol
        ? `No significant factor shifts detected for ${symbol}.`
        : 'No significant factor regime changes detected across the portfolio.',
      confidence: 0.5,
      sources,
    };
  }

  // Find the most significant factor shifts (high absolute exposure + high confidence)
  const ranked = [...factors]
    .sort((a, b) => Math.abs(b.exposure) * b.confidence - Math.abs(a.exposure) * a.confidence)
    .slice(0, 4);

  const parts: string[] = [];
  let maxConfidence = 0.6;

  if (symbol) {
    parts.push(`Factor analysis for ${symbol}:`);
  } else {
    parts.push('Portfolio factor regime update:');
  }

  for (const f of ranked) {
    const strength =
      Math.abs(f.exposure) > 0.8 ? 'strong' :
      Math.abs(f.exposure) > 0.4 ? 'moderate' : 'mild';
    const direction = f.exposure > 0 ? 'positive' : 'negative';
    parts.push(
      `${f.factor} shows ${strength} ${direction} exposure (${f.exposure.toFixed(2)}, ` +
      `t-stat: ${f.tStat.toFixed(2)}).`,
    );
    maxConfidence = Math.max(maxConfidence, f.confidence);
  }

  return {
    text: parts.join(' '),
    confidence: Math.min(maxConfidence, 0.95),
    sources,
  };
}

// ============================================================================
// EXPLANATION SERVICE
// ============================================================================

export class ExplanationService {
  private explainer: CognitiveExplainer;

  constructor(explainer?: CognitiveExplainer) {
    this.explainer = explainer || cognitiveExplainer;
  }

  /**
   * Generate an explanation for the given request.
   * Checks cache first, then tries LLM, then falls back to templates.
   */
  async generate(request: ExplanationRequest): Promise<ExplanationResult> {
    const { type, symbol, context = {} } = request;

    // Check cache
    const cached = getCached(type, symbol);
    if (cached) return cached;

    // Generate explanation
    const result = await this.generateExplanation(type, symbol, context);

    // Cache the result
    setCache(result);

    return result;
  }

  /**
   * Clear the in-memory cache. Useful for testing or forced refresh.
   */
  clearCache(): void {
    cache.clear();
  }

  /**
   * Check if the service has LLM capabilities.
   */
  get isLLMEnabled(): boolean {
    return hasLLMKey();
  }

  // --------------------------------------------------------------------------
  // PRIVATE
  // --------------------------------------------------------------------------

  private async generateExplanation(
    type: ExplanationType,
    symbol: string | undefined,
    context: ExplanationContext,
  ): Promise<ExplanationResult> {
    // Try LLM first if available
    if (hasLLMKey()) {
      const prompt = this.buildLLMPrompt(type, symbol, context);
      const llmResult = await generateWithLLM(type, prompt);

      if (llmResult) {
        return this.makeResult(type, symbol, {
          text: llmResult.text,
          confidence: llmResult.confidence,
          sources: ['ai_model', 'factor_engine', 'market_data'],
        });
      }
    }

    // Fall back to template-based generation
    const templateResult = this.generateFromTemplate(type, symbol, context);

    return this.makeResult(type, symbol, templateResult);
  }

  private generateFromTemplate(
    type: ExplanationType,
    symbol: string | undefined,
    context: ExplanationContext,
  ): { text: string; confidence: number; sources: string[] } {
    switch (type) {
      case 'portfolio_move':
        return generatePortfolioMoveTemplate(symbol || 'Portfolio', context);
      case 'rebalance':
        return generateRebalanceTemplate(context);
      case 'earnings':
        return generateEarningsTemplate(symbol || 'Portfolio', context);
      case 'risk_alert':
        return generateRiskAlertTemplate(symbol || 'Portfolio', context);
      case 'factor_shift':
        return generateFactorShiftTemplate(symbol || '', context);
      default:
        return {
          text: 'Explanation type not recognized.',
          confidence: 0.3,
          sources: ['system'],
        };
    }
  }

  private buildLLMPrompt(
    type: ExplanationType,
    symbol: string | undefined,
    context: ExplanationContext,
  ): string {
    const parts: string[] = [];

    parts.push(`Generate a ${type.replace('_', ' ')} explanation`);
    if (symbol) parts.push(`for ${symbol}`);
    parts.push('based on the following data:\n');

    if (context.factors && context.factors.length > 0) {
      parts.push('Factor Exposures:');
      for (const f of context.factors.slice(0, 8)) {
        parts.push(`  - ${f.factor}: exposure=${f.exposure.toFixed(3)}, t-stat=${f.tStat.toFixed(2)}, confidence=${(f.confidence * 100).toFixed(0)}%`);
      }
      parts.push('');
    }

    if (context.sentiment) {
      parts.push(`Sentiment: ${context.sentiment.label} (${(context.sentiment.confidence * 100).toFixed(0)}% confidence)`);
      parts.push(`  Positive: ${(context.sentiment.scores.positive * 100).toFixed(0)}%, Neutral: ${(context.sentiment.scores.neutral * 100).toFixed(0)}%, Negative: ${(context.sentiment.scores.negative * 100).toFixed(0)}%`);
      parts.push('');
    }

    if (context.earnings) {
      parts.push(`Earnings: ${context.earnings.symbol} reporting on ${context.earnings.reportDate.toISOString().slice(0, 10)}`);
      parts.push(`  Expected move: +/-${(context.earnings.expectedMove * 100).toFixed(1)}%`);
      parts.push(`  Historical avg move: +/-${(context.earnings.historicalAvgMove * 100).toFixed(1)}%`);
      parts.push(`  Recommendation: ${context.earnings.recommendation}`);
      parts.push('');
    }

    if (context.portfolioReturn !== undefined) {
      parts.push(`Portfolio return: ${(context.portfolioReturn * 100).toFixed(2)}%`);
    }
    if (context.marketReturn !== undefined) {
      parts.push(`Market return: ${(context.marketReturn * 100).toFixed(2)}%`);
    }

    if (context.rebalanceChanges && context.rebalanceChanges.length > 0) {
      parts.push('\nRebalance Changes:');
      for (const c of context.rebalanceChanges.slice(0, 10)) {
        parts.push(`  - ${c.symbol}: ${(c.oldWeight * 100).toFixed(1)}% -> ${(c.newWeight * 100).toFixed(1)}% (${c.reason})`);
      }
    }

    if (context.portfolioMetrics) {
      const m = context.portfolioMetrics;
      parts.push(`\nPortfolio Metrics:`);
      parts.push(`  Sharpe: ${m.oldSharpe.toFixed(2)} -> ${m.newSharpe.toFixed(2)}`);
      parts.push(`  Volatility: ${(m.oldVol * 100).toFixed(1)}% -> ${(m.newVol * 100).toFixed(1)}%`);
    }

    if (context.riskType) {
      parts.push(`\nRisk Type: ${context.riskType}`);
      if (context.riskValue !== undefined) parts.push(`  Current Value: ${context.riskValue}`);
      if (context.riskThreshold !== undefined) parts.push(`  Threshold: ${context.riskThreshold}`);
    }

    return parts.join('\n');
  }

  private makeResult(
    type: ExplanationType,
    symbol: string | undefined,
    data: { text: string; confidence: number; sources: string[] },
  ): ExplanationResult {
    return {
      id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      symbol: symbol?.toUpperCase(),
      text: data.text,
      confidence: data.confidence,
      sources: data.sources,
      generatedAt: new Date().toISOString(),
      cached: false,
    };
  }
}

// Default singleton instance
export const explanationService = new ExplanationService();
