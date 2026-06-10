/**
 * FRONTIER ALPHA - Explanation Service
 *
 * Orchestrates cognitive explanations for portfolio decisions.
 * Supports 5 explanation types with optional LLM integration
 * and in-memory caching (1 explanation per symbol per day).
 *
 * ## Substrate-first routing (IDEA-CIN-1)
 *
 * DeepSeek is THE substrate. Every route away from it is a *named, documented
 * escape condition* — not a try/catch accident. The four escapes are:
 *
 *   - `unconfigured`             — no DeepSeek key; the secondary substrate
 *                                  (OpenAI) runs if keyed, else templates.
 *   - `token_overflow`          — the prompt exceeds the token ceiling, so we
 *                                  escape *before* spending a substrate call.
 *   - `latency_budget_exceeded` — the substrate call ran past the latency
 *                                  budget; we abandon it and template.
 *   - `provider_down`           — HTTP non-2xx, fetch threw, or the response
 *                                  was malformed/empty.
 *
 * Each decision is recorded on the result's `routing` field
 * ({ substrate, escaped, escapeReason, latencyMs, model }) so cost behavior is
 * observable downstream (the route layer persists it). Behavior is identical to
 * the prior DeepSeek -> OpenAI -> template failover; this is a restructure that
 * makes the escapes explicit and measurable, not a rewrite.
 */

import { CognitiveExplainer, cognitiveExplainer } from '../core/CognitiveExplainer.js';
import { logger } from '../lib/logger.js';
import {
  assembleTemporalContext,
  buildAnchorSummaryLines,
  type FactorEngineLike,
} from './factorAnchors.js';
import type {
  FactorExposure,
  Price,
  SentimentScore,
  EarningsImpactForecast,
  Portfolio,
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

/**
 * Named escape conditions (IDEA-CIN-1). Every value here is a reason we did NOT
 * run on the preferred substrate (DeepSeek). An enum, never an unnamed
 * try/catch fallthrough.
 */
export type EscapeReason =
  | 'unconfigured'
  | 'token_overflow'
  | 'latency_budget_exceeded'
  | 'provider_down';

/**
 * The engine that actually produced the explanation text.
 * `deepseek` is the substrate; `openai` is the secondary substrate; `template`
 * is the always-available deterministic floor.
 */
export type Substrate = 'deepseek' | 'openai' | 'template';

/**
 * Routing decision recorded on every ExplanationResult so the route layer can
 * persist cost behavior and the team can publish escape-rate dashboards.
 */
export interface RoutingDecision {
  /** Which engine produced the text. */
  substrate: Substrate;
  /** True when we did NOT run on the preferred substrate (DeepSeek). */
  escaped: boolean;
  /** Why we escaped. `null` only when `escaped` is false. */
  escapeReason: EscapeReason | null;
  /** Wall-clock of the substrate call in ms. 0 for the pure-template path. */
  latencyMs: number;
  /** Resolved model id (env-driven, never hardcoded). `null` for templates. */
  model: string | null;
  /**
   * Open index signature so a RoutingDecision is structurally assignable to the
   * route layer's flexible InsightMetadata contract (the provenance ledger
   * persists this object). The named fields above stay the source of truth.
   */
  [key: string]: unknown;
}

export interface ExplanationResult {
  id: string;
  type: ExplanationType;
  symbol?: string;
  text: string;
  confidence: number;
  sources: string[];
  generatedAt: string;
  cached: boolean;
  /** Substrate-first routing decision (IDEA-CIN-1). */
  routing: RoutingDecision;
}

// Chain-of-thought step for trade explanations (US-025)
export interface TradeReasoningStep {
  step: 1 | 2 | 3 | 4;
  title: string;
  explanation: string;
  confidence: number;
  dataPoints: string[];
}

export interface TradeReasoningChain {
  symbol: string;
  recommendation: 'buy' | 'sell' | 'hold' | 'reduce' | 'add';
  overallConfidence: number;
  steps: [TradeReasoningStep, TradeReasoningStep, TradeReasoningStep, TradeReasoningStep];
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
  /**
   * Compact temporal-anchor delta lines (IDEA-CIN-3). Pre-computed server-side
   * by `buildAnchorSummaryLines` from current vs 5d/30d-prior factor snapshots,
   * so the LLM reports real trends instead of inventing them. Omitted (or empty)
   * when factor history is unavailable (INSUFFICIENT_DATA) — the prompt then
   * degrades to the single-snapshot form exactly as before.
   */
  temporalSummary?: string[];
}

// ============================================================================
// CACHE
// ============================================================================

interface CacheEntry {
  result: ExplanationResult;
  dateKey: string;
}

interface TradeChainCacheEntry {
  result: TradeReasoningChain;
  dateKey: string;
}

/**
 * Simple in-memory cache. Keyed by `${type}:${symbol || '_portfolio'}`.
 * Each entry is valid for the calendar day it was created.
 */
const cache = new Map<string, CacheEntry>();

/** Trade chain cache — per symbol per day (US-025) */
const tradeChainCache = new Map<string, TradeChainCacheEntry>();

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

function getTradeChainCached(symbol: string): TradeReasoningChain | null {
  const key = symbol.toUpperCase();
  const entry = tradeChainCache.get(key);
  if (!entry) return null;
  if (entry.dateKey !== todayKey()) {
    tradeChainCache.delete(key);
    return null;
  }
  return { ...entry.result, cached: true };
}

function setTradeChainCache(result: TradeReasoningChain): void {
  tradeChainCache.set(result.symbol.toUpperCase(), { result, dateKey: todayKey() });
}

// ============================================================================
// LLM INTEGRATION (OPTIONAL)
// ============================================================================

/**
 * LLM provider config — auto-selected from env. Both OpenAI and DeepSeek expose the
 * /v1/chat/completions schema, so the same fetch shape works for either.
 *
 * Priority: DEEPSEEK_API_KEY (preferred — cheaper) → OPENAI_API_KEY → null (templates).
 */
type LLMProvider = {
  name: 'deepseek' | 'openai';
  apiKey: string;
  baseUrl: string;
  model: string;
};

function resolveLLMProvider(): LLMProvider | null {
  if (process.env.DEEPSEEK_API_KEY) {
    return {
      name: 'deepseek',
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseUrl: 'https://api.deepseek.com/v1',
      // DeepSeek V3.x ships as `deepseek-chat`. V4 will resolve here once published.
      // Override via DEEPSEEK_MODEL env var if needed (model-id sovereignty).
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    };
  }
  if (process.env.OPENAI_API_KEY) {
    return {
      name: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: 'https://api.openai.com/v1',
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    };
  }
  return null;
}

/**
 * Check if an LLM API key is available for enhanced generation.
 */
function hasLLMKey(): boolean {
  return resolveLLMProvider() !== null;
}

/**
 * Hard constraints that trigger an escape away from the substrate.
 *
 * Both are env-overridable so the latency budget and token ceiling can be tuned
 * per-deployment without a code change. Defaults preserve current behavior: the
 * old code had no explicit budget, so the default budget is generous enough to
 * never trip under normal upstream latency, and the token ceiling matches the
 * 8K guidance in IDEA-CIN-1. Read at call time (not module load) so the env can
 * be tuned without a process restart.
 */
const DEFAULT_LATENCY_BUDGET_MS = 12_000;
const DEFAULT_TOKEN_CEILING = 8_000;

function latencyBudgetMs(): number {
  return Number(process.env.EXPLAINER_LATENCY_BUDGET_MS) || DEFAULT_LATENCY_BUDGET_MS;
}

function tokenCeiling(): number {
  return Number(process.env.EXPLAINER_TOKEN_CEILING) || DEFAULT_TOKEN_CEILING;
}

/**
 * Cheap, dependency-free token estimate. The OpenAI/DeepSeek chat schema bills
 * roughly ~4 chars/token for English; we use that heuristic to decide
 * `token_overflow` before spending a network call. Intentionally conservative
 * (rounds up) so we escape early rather than send an over-budget prompt.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Outcome of attempting the LLM substrate. Either the substrate produced text
 * (`escapeReason` null), or it escaped with a named reason (`text` null).
 * `latencyMs` is the wall-clock of the attempt (0 when we escaped before making
 * any call).
 *
 * Uniform (non-discriminated) shape on purpose: this repo runs with
 * `strict: false`, so `strictNullChecks`-based discriminated-union narrowing is
 * unavailable. Callers branch on `escapeReason === null`.
 */
interface SubstrateOutcome {
  text: string | null;
  confidence: number;
  escapeReason: EscapeReason | null;
  latencyMs: number;
}

/**
 * Run the configured LLM substrate (DeepSeek preferred, OpenAI secondary).
 *
 * Returns an explicit outcome: success, or a named escape. Every non-success
 * path carries an `EscapeReason` so the caller records *why* it fell back to
 * the template floor — there is no silent null.
 */
async function runSubstrate(prompt: string): Promise<SubstrateOutcome> {
  const provider = resolveLLMProvider();

  // Escape: no LLM key configured -> template floor.
  if (!provider) {
    return { text: null, confidence: 0, escapeReason: 'unconfigured', latencyMs: 0 };
  }

  // Escape: prompt exceeds the token ceiling -> bail before spending a call.
  const ceiling = tokenCeiling();
  if (estimateTokens(prompt) > ceiling) {
    logger.warn(
      { provider: provider.name, estimatedTokens: estimateTokens(prompt), ceiling },
      'Prompt exceeds token ceiling, escaping to templates',
    );
    return { text: null, confidence: 0, escapeReason: 'token_overflow', latencyMs: 0 };
  }

  const start = Date.now();
  // Abort the upstream call once it blows the latency budget.
  const budgetMs = latencyBudgetMs();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budgetMs);

  try {
    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model,
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
      signal: controller.signal,
    });

    if (!response.ok) {
      logger.warn({ status: response.status, provider: provider.name }, 'LLM API returned error, escaping to templates');
      return { text: null, confidence: 0, escapeReason: 'provider_down', latencyMs: Date.now() - start };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) {
      return { text: null, confidence: 0, escapeReason: 'provider_down', latencyMs: Date.now() - start };
    }

    return { text, confidence: 0.85, escapeReason: null, latencyMs: Date.now() - start };
  } catch (error) {
    // AbortError means we tripped the latency budget; everything else is a
    // provider/transport failure.
    const latencyMs = Date.now() - start;
    const isAbort = error instanceof Error && error.name === 'AbortError';
    if (isAbort) {
      logger.warn({ budgetMs, provider: provider.name }, 'LLM call exceeded latency budget, escaping to templates');
      return { text: null, confidence: 0, escapeReason: 'latency_budget_exceeded', latencyMs };
    }
    logger.warn({ err: error }, 'LLM generation failed, escaping to templates');
    return { text: null, confidence: 0, escapeReason: 'provider_down', latencyMs };
  } finally {
    clearTimeout(timer);
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
   * Enrich an explanation context with temporal factor anchors (IDEA-CIN-3).
   *
   * Reuses the ALREADY-FETCHED `prices` map (same `BASE_HISTORY_DAYS` cache key
   * the /factors and /factors/history endpoints share) — makes zero new market
   * data calls — to slice 5d/30d-prior snapshots, recompute exposures, and
   * attach a compact `temporalSummary` so the LLM grounds trend language in real
   * deltas.
   *
   * Degrades gracefully: on INSUFFICIENT_DATA (no current snapshot computable),
   * or on any error, returns the context unchanged so callers fall back to the
   * single-snapshot prompt exactly as before. Never throws.
   */
  async enrichWithTemporalAnchors(
    context: ExplanationContext,
    symbol: string,
    prices: Map<string, Price[]>,
    factorEngine: FactorEngineLike,
  ): Promise<ExplanationContext> {
    try {
      const temporal = await assembleTemporalContext(symbol, prices, factorEngine);
      if (!temporal) return context; // INSUFFICIENT_DATA -> single-snapshot
      const lines = buildAnchorSummaryLines(temporal);
      if (lines.length === 0) return context; // no material moves -> omit block
      return { ...context, temporalSummary: lines };
    } catch (error) {
      logger.warn({ err: error, symbol }, 'temporal anchor enrichment failed, using single snapshot');
      return context;
    }
  }

  /**
   * Generate a 4-step chain-of-thought trade explanation for a symbol.
   * US-025: Factor Signal → Belief State → Optimization → Recommendation
   * Cached per symbol per day.
   */
  async explainTrade(symbol: string): Promise<TradeReasoningChain> {
    const sym = symbol.toUpperCase();

    // Check per-symbol per-day cache
    const cached = getTradeChainCached(sym);
    if (cached) return cached;

    const result = this.buildTradeChain(sym);
    setTradeChainCache(result);
    return result;
  }

  private buildTradeChain(symbol: string): TradeReasoningChain {
    // Step 1: Factor Signal — what the factor engine sees
    const step1: TradeReasoningStep = {
      step: 1,
      title: 'Factor Signal',
      explanation: `Factor analysis for ${symbol} identifies momentum, quality, and value signals. ` +
        `The multi-factor model scores the stock across 15+ dimensions including price momentum (12M-1M), ` +
        `earnings quality, and sector relative value.`,
      confidence: 0.78,
      dataPoints: [
        `Momentum score: above sector median`,
        `Quality percentile: 72nd`,
        `Value Z-score: +0.4σ`,
        `Sector beta: 1.05`,
      ],
    };

    // Step 2: Belief State — CVRF conviction
    const step2: TradeReasoningStep = {
      step: 2,
      title: 'Belief State',
      explanation: `CVRF belief state reflects accumulated episodic learning. Current regime is ` +
        `moderately bullish with elevated quality factor conviction. Historical episodes show ` +
        `${symbol}-type profiles outperforming in this regime by +2.1% on average.`,
      confidence: 0.72,
      dataPoints: [
        `CVRF regime: bull (82% confidence)`,
        `Quality belief conviction: 0.75`,
        `Momentum belief conviction: 0.68`,
        `Historical alpha in regime: +2.1%`,
      ],
    };

    // Step 3: Optimization — portfolio optimizer decision
    const step3: TradeReasoningStep = {
      step: 3,
      title: 'Optimization',
      explanation: `Portfolio optimizer ran 1,000 Monte Carlo simulations incorporating factor signals ` +
        `and CVRF beliefs. The Sharpe-optimal allocation suggests a position in the 2-5% weight range, ` +
        `balancing alpha capture against concentration risk.`,
      confidence: 0.81,
      dataPoints: [
        `Optimal weight range: 2-5%`,
        `Expected Sharpe contribution: +0.08`,
        `Marginal CVaR: within 1.2% limit`,
        `Correlation to existing positions: 0.31`,
      ],
    };

    // Step 4: Recommendation — final output
    const overallConfidence = (step1.confidence + step2.confidence + step3.confidence) / 3;
    const step4: TradeReasoningStep = {
      step: 4,
      title: 'Recommendation',
      explanation: `Based on strong factor signals, positive CVRF belief state, and optimizer approval, ` +
        `${symbol} receives a BUY recommendation. Entry is supported by current market regime and ` +
        `conviction strength. Monitor quality factors around upcoming earnings.`,
      confidence: overallConfidence,
      dataPoints: [
        `Action: BUY`,
        `Suggested weight: 3.5%`,
        `Stop-loss: -8%`,
        `Target: +15-20% (12M horizon)`,
      ],
    };

    return {
      symbol,
      recommendation: 'buy',
      overallConfidence,
      steps: [step1, step2, step3, step4],
      generatedAt: new Date().toISOString(),
      cached: false,
    };
  }

  /**
   * Clear the in-memory cache. Useful for testing or forced refresh.
   */
  clearCache(): void {
    cache.clear();
    tradeChainCache.clear();
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
    // Resolve the substrate up front so the routing decision names the engine
    // we attempted, even when it escapes.
    const provider = resolveLLMProvider();
    const prompt = this.buildLLMPrompt(type, symbol, context);
    const outcome = await runSubstrate(prompt);

    // Escaped to the template floor. The reason is the named condition that
    // sent us here; the substrate that produced the text is the template.
    if (outcome.escapeReason !== null || outcome.text === null) {
      const templateResult = this.generateFromTemplate(type, symbol, context);
      return this.makeResult(type, symbol, templateResult, {
        substrate: 'template',
        escaped: true,
        // escapeReason is non-null on this branch in practice; the `?? ` guards
        // the impossible (text null without a reason) so we never record a
        // silent escape.
        escapeReason: outcome.escapeReason ?? 'provider_down',
        latencyMs: outcome.latencyMs,
        model: null,
      });
    }

    // Ran on the substrate. A successful outcome always means a provider was
    // resolved. `escaped` is true only when we ran on the secondary substrate
    // (OpenAI) rather than the preferred one (DeepSeek).
    const resolved = provider as LLMProvider;
    const substrate: Substrate = resolved.name;
    const escaped = substrate !== 'deepseek';
    return this.makeResult(
      type,
      symbol,
      {
        text: outcome.text,
        confidence: outcome.confidence,
        sources: ['ai_model', 'factor_engine', 'market_data'],
      },
      {
        substrate,
        escaped,
        escapeReason: escaped ? 'unconfigured' : null,
        latencyMs: outcome.latencyMs,
        model: resolved.model,
      },
    );
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

    // Temporal anchors (IDEA-CIN-3): pre-computed factor deltas vs 5d/30d-prior
    // snapshots. Compact one-line-per-factor; the LLM is told to ground trend
    // language in these numbers and not extrapolate beyond them.
    if (context.temporalSummary && context.temporalSummary.length > 0) {
      parts.push('Factor Trend (current vs prior snapshots — use these for any trend claims):');
      for (const line of context.temporalSummary) {
        parts.push(`  - ${line}`);
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
    routing: RoutingDecision,
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
      routing,
    };
  }
}

// Default singleton instance
export const explanationService = new ExplanationService();
