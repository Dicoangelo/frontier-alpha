import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * FRONTIER ALPHA - Explain API Endpoint
 *
 * POST /api/v1/explain
 * Generates cognitive explanations for portfolio decisions.
 *
 * Request body:
 *   { type, symbol?, portfolio?, context? }
 *
 * Response:
 *   { success, data: ExplanationResult, meta }
 */

// ---------------------------------------------------------------------------
// Inline types (avoid cross-project imports for serverless deployment)
// ---------------------------------------------------------------------------

type ExplanationType =
  | 'portfolio_move'
  | 'rebalance'
  | 'earnings'
  | 'risk_alert'
  | 'factor_shift';

interface ExplanationResult {
  id: string;
  type: ExplanationType;
  symbol?: string;
  text: string;
  confidence: number;
  sources: string[];
  generatedAt: string;
  cached: boolean;
}

interface FactorExposure {
  factor: string;
  exposure: number;
  tStat: number;
  confidence: number;
  contribution: number;
}

interface SentimentScore {
  label: 'positive' | 'neutral' | 'negative';
  confidence: number;
  scores: { positive: number; neutral: number; negative: number };
}

interface ExplanationContext {
  factors?: FactorExposure[];
  sentiment?: SentimentScore;
  earnings?: {
    symbol: string;
    reportDate: string;
    expectedMove: number;
    historicalAvgMove: number;
    recommendation: 'hold' | 'reduce' | 'hedge';
    explanation: string;
    confidence: number;
  };
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

interface RequestBody {
  type: ExplanationType;
  symbol?: string;
  portfolio?: unknown;
  context?: ExplanationContext;
}

// ---------------------------------------------------------------------------
// In-memory cache (per serverless instance)
// ---------------------------------------------------------------------------

const cache = new Map<string, { result: ExplanationResult; dateKey: string }>();

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function getCached(type: ExplanationType, symbol?: string): ExplanationResult | null {
  const key = `${type}:${symbol?.toUpperCase() || '_portfolio'}`;
  const entry = cache.get(key);
  if (!entry || entry.dateKey !== todayKey()) {
    if (entry) cache.delete(key);
    return null;
  }
  return { ...entry.result, cached: true };
}

function setCache(result: ExplanationResult): void {
  const key = `${result.type}:${result.symbol?.toUpperCase() || '_portfolio'}`;
  cache.set(key, { result, dateKey: todayKey() });
}

// ---------------------------------------------------------------------------
// Template-based explanation generators
// ---------------------------------------------------------------------------

const VALID_TYPES: ExplanationType[] = [
  'portfolio_move',
  'rebalance',
  'earnings',
  'risk_alert',
  'factor_shift',
];

function generatePortfolioMove(
  symbol: string,
  ctx: ExplanationContext,
): { text: string; confidence: number; sources: string[] } {
  const factors = ctx.factors || [];
  const parts: string[] = [];
  let confidence = 0.6;
  const sources: string[] = ['factor_engine'];

  const significant = factors
    .filter(f => Math.abs(f.exposure) > 0.3)
    .sort((a, b) => Math.abs(b.exposure) - Math.abs(a.exposure))
    .slice(0, 3);

  if (significant.length > 0) {
    const descriptions = significant.map(f => {
      const dir = f.exposure > 0 ? 'positive' : 'negative';
      return `${f.factor} (${dir}, ${f.exposure.toFixed(2)})`;
    });
    parts.push(`${symbol} is driven by ${descriptions.join(', ')}.`);
    confidence = Math.max(confidence, ...significant.map(f => f.confidence));
  }

  if (ctx.sentiment) {
    sources.push('sentiment_analysis');
    if (ctx.sentiment.label === 'positive' && ctx.sentiment.scores.positive > 0.6) {
      parts.push(`Sentiment is bullish (${(ctx.sentiment.confidence * 100).toFixed(0)}% confidence).`);
    } else if (ctx.sentiment.label === 'negative' && ctx.sentiment.scores.negative > 0.6) {
      parts.push(`Sentiment turned bearish (${(ctx.sentiment.confidence * 100).toFixed(0)}% confidence).`);
    } else {
      parts.push('Sentiment remains neutral.');
    }
    confidence = Math.max(confidence, ctx.sentiment.confidence);
  }

  if (ctx.portfolioReturn !== undefined && ctx.marketReturn !== undefined) {
    sources.push('market_data');
    const alpha = ctx.portfolioReturn - ctx.marketReturn;
    parts.push(
      `Portfolio is ${alpha >= 0 ? 'outperforming' : 'underperforming'} the market by ${(Math.abs(alpha) * 100).toFixed(2)}%.`,
    );
  }

  if (parts.length === 0) {
    parts.push(`${symbol} position is being monitored. No significant factor changes detected.`);
  }

  return { text: parts.join(' '), confidence: Math.min(confidence, 0.95), sources };
}

function generateRebalance(
  ctx: ExplanationContext,
): { text: string; confidence: number; sources: string[] } {
  const changes = ctx.rebalanceChanges || [];
  const metrics = ctx.portfolioMetrics;
  const sources: string[] = ['factor_engine', 'portfolio_optimizer'];
  const parts: string[] = [];

  if (changes.length === 0 && !metrics) {
    return {
      text: 'No rebalancing changes currently recommended. Portfolio weights are within target ranges.',
      confidence: 0.7,
      sources,
    };
  }

  if (metrics) {
    const sharpeDelta = metrics.newSharpe - metrics.oldSharpe;
    parts.push(
      `Rebalancing targets Sharpe improvement from ${metrics.oldSharpe.toFixed(2)} to ${metrics.newSharpe.toFixed(2)} (${sharpeDelta > 0 ? '+' : ''}${sharpeDelta.toFixed(2)}).`,
    );
    parts.push(
      `Volatility moves from ${(metrics.oldVol * 100).toFixed(1)}% to ${(metrics.newVol * 100).toFixed(1)}%.`,
    );
  }

  if (changes.length > 0) {
    const increases = changes.filter(c => c.newWeight > c.oldWeight);
    const decreases = changes.filter(c => c.newWeight < c.oldWeight);
    if (increases.length > 0) {
      const top = increases.sort((a, b) => (b.newWeight - b.oldWeight) - (a.newWeight - a.oldWeight))[0];
      parts.push(`Largest increase: ${top.symbol} (${(top.oldWeight * 100).toFixed(1)}% to ${(top.newWeight * 100).toFixed(1)}%).`);
    }
    if (decreases.length > 0) {
      const top = decreases.sort((a, b) => (a.newWeight - a.oldWeight) - (b.newWeight - b.oldWeight))[0];
      parts.push(`Largest reduction: ${top.symbol} (${(top.oldWeight * 100).toFixed(1)}% to ${(top.newWeight * 100).toFixed(1)}%).`);
    }
    parts.push(`${changes.length} position${changes.length !== 1 ? 's' : ''} adjusted.`);
  }

  return { text: parts.join(' '), confidence: 0.8, sources };
}

function generateEarnings(
  symbol: string,
  ctx: ExplanationContext,
): { text: string; confidence: number; sources: string[] } {
  const earnings = ctx.earnings;
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
  const reportDate = new Date(earnings.reportDate);
  const daysTilReport = Math.ceil((reportDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const parts: string[] = [];

  if (daysTilReport > 0) {
    parts.push(`${earnings.symbol} reports earnings in ${daysTilReport} day${daysTilReport !== 1 ? 's' : ''}.`);
    parts.push(`Expected move: +/-${(earnings.expectedMove * 100).toFixed(1)}% (historical avg: +/-${(earnings.historicalAvgMove * 100).toFixed(1)}%).`);
    parts.push(`Recommendation: ${earnings.recommendation.toUpperCase()} (${(earnings.confidence * 100).toFixed(0)}% confidence).`);
  } else {
    parts.push(`${earnings.symbol} has recently reported earnings. ${earnings.explanation}`);
  }

  return { text: parts.join(' '), confidence: earnings.confidence, sources };
}

function generateRiskAlert(
  symbol: string,
  ctx: ExplanationContext,
): { text: string; confidence: number; sources: string[] } {
  const riskType = ctx.riskType || 'volatility';
  const value = ctx.riskValue ?? 0;
  const threshold = ctx.riskThreshold ?? 0;
  const sources: string[] = ['risk_engine', 'market_data'];
  const target = symbol || 'Portfolio';

  const messages: Record<string, string> = {
    drawdown: `${target} drawdown at ${(value * 100).toFixed(1)}%, exceeding ${(threshold * 100).toFixed(1)}% threshold. Consider reducing exposure or implementing stop-loss.`,
    volatility: `${target} 21-day volatility at ${(value * 100).toFixed(1)}% annualized, above ${(threshold * 100).toFixed(1)}% tolerance. Elevated vol may impact risk-adjusted returns.`,
    correlation: `${target} correlation with portfolio at ${value.toFixed(2)}, above ${threshold.toFixed(2)} threshold. Diversification benefit reduced.`,
    concentration: `${target} weight at ${(value * 100).toFixed(1)}%, exceeding ${(threshold * 100).toFixed(1)}% limit. Consider trimming for diversification.`,
  };

  return {
    text: messages[riskType] || `Risk alert for ${target}: value ${value} exceeds threshold ${threshold}.`,
    confidence: 0.9,
    sources,
  };
}

function generateFactorShift(
  symbol: string,
  ctx: ExplanationContext,
): { text: string; confidence: number; sources: string[] } {
  const factors = ctx.factors || [];
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

  const ranked = [...factors]
    .sort((a, b) => Math.abs(b.exposure) * b.confidence - Math.abs(a.exposure) * a.confidence)
    .slice(0, 4);

  const parts: string[] = [symbol ? `Factor analysis for ${symbol}:` : 'Portfolio factor regime update:'];
  let maxConf = 0.6;

  for (const f of ranked) {
    const strength = Math.abs(f.exposure) > 0.8 ? 'strong' : Math.abs(f.exposure) > 0.4 ? 'moderate' : 'mild';
    const dir = f.exposure > 0 ? 'positive' : 'negative';
    parts.push(`${f.factor}: ${strength} ${dir} (${f.exposure.toFixed(2)}, t=${f.tStat.toFixed(2)}).`);
    maxConf = Math.max(maxConf, f.confidence);
  }

  return { text: parts.join(' '), confidence: Math.min(maxConf, 0.95), sources };
}

// ---------------------------------------------------------------------------
// Optional LLM enhancement
// ---------------------------------------------------------------------------

async function tryLLM(
  type: ExplanationType,
  symbol: string | undefined,
  ctx: ExplanationContext,
): Promise<{ text: string; confidence: number; sources: string[] } | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const prompt = [
      `Generate a concise ${type.replace(/_/g, ' ')} explanation${symbol ? ` for ${symbol}` : ''}.`,
      ctx.factors?.length ? `Factors: ${ctx.factors.slice(0, 5).map(f => `${f.factor}=${f.exposure.toFixed(2)}`).join(', ')}` : '',
      ctx.sentiment ? `Sentiment: ${ctx.sentiment.label} (${(ctx.sentiment.confidence * 100).toFixed(0)}%)` : '',
      ctx.riskType ? `Risk: ${ctx.riskType}, value=${ctx.riskValue}, threshold=${ctx.riskThreshold}` : '',
    ].filter(Boolean).join('\n');

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
            content: 'You are a portfolio analyst at Frontier Alpha. Generate concise, actionable explanations. Under 200 words. Reference specific metrics.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.4,
        max_tokens: 300,
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) return null;

    return { text, confidence: 0.85, sources: ['ai_model', 'factor_engine', 'market_data'] };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Generate explanation (LLM -> template fallback)
// ---------------------------------------------------------------------------

async function generateExplanation(
  type: ExplanationType,
  symbol: string | undefined,
  ctx: ExplanationContext,
): Promise<ExplanationResult> {
  // Try LLM first
  const llmResult = await tryLLM(type, symbol, ctx);
  if (llmResult) {
    return makeResult(type, symbol, llmResult);
  }

  // Template fallback
  let templateResult: { text: string; confidence: number; sources: string[] };

  switch (type) {
    case 'portfolio_move':
      templateResult = generatePortfolioMove(symbol || 'Portfolio', ctx);
      break;
    case 'rebalance':
      templateResult = generateRebalance(ctx);
      break;
    case 'earnings':
      templateResult = generateEarnings(symbol || 'Portfolio', ctx);
      break;
    case 'risk_alert':
      templateResult = generateRiskAlert(symbol || 'Portfolio', ctx);
      break;
    case 'factor_shift':
      templateResult = generateFactorShift(symbol || '', ctx);
      break;
    default:
      templateResult = { text: 'Explanation type not recognized.', confidence: 0.3, sources: ['system'] };
  }

  return makeResult(type, symbol, templateResult);
}

function makeResult(
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

// ---------------------------------------------------------------------------
// HANDLER
// ---------------------------------------------------------------------------

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const start = Date.now();

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Only POST requests are accepted.' },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: `req-${Math.random().toString(36).slice(2, 8)}`,
        latencyMs: Date.now() - start,
      },
    });
  }

  try {
    const body = req.body as RequestBody;

    // Validate type
    if (!body.type || !VALID_TYPES.includes(body.type)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_TYPE',
          message: `Invalid explanation type. Must be one of: ${VALID_TYPES.join(', ')}`,
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: `req-${Math.random().toString(36).slice(2, 8)}`,
          latencyMs: Date.now() - start,
        },
      });
    }

    const { type, symbol, context = {} } = body;

    // Check cache
    const cached = getCached(type, symbol);
    if (cached) {
      return res.status(200).json({
        success: true,
        data: cached,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: `req-${Math.random().toString(36).slice(2, 8)}`,
          latencyMs: Date.now() - start,
          source: 'cache',
        },
      });
    }

    // Generate
    const result = await generateExplanation(type, symbol, context);

    // Cache
    setCache(result);

    return res.status(200).json({
      success: true,
      data: result,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: `req-${Math.random().toString(36).slice(2, 8)}`,
        latencyMs: Date.now() - start,
        source: result.sources.includes('ai_model') ? 'llm' : 'template',
      },
    });
  } catch (error) {
    console.error('Explain endpoint error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to generate explanation. Please try again.',
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: `req-${Math.random().toString(36).slice(2, 8)}`,
        latencyMs: Date.now() - start,
      },
    });
  }
}
