import { useState, useCallback } from 'react';
import {
  Sparkles,
  Brain,
  RefreshCw,
  AlertTriangle,
  TrendingUp,
  BarChart3,
  Shield,
  Layers,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { Card } from '@/components/shared/Card';
import { Button } from '@/components/shared/Button';
import { api } from '@/api/client';

// ============================================================================
// TYPES
// ============================================================================

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

interface ExplanationCardProps {
  /** The type of explanation to generate */
  type: ExplanationType;
  /** Optional stock symbol */
  symbol?: string;
  /** Optional portfolio data to include in the request */
  portfolio?: unknown;
  /** Optional context (factors, sentiment, etc.) */
  context?: Record<string, unknown>;
  /** Additional CSS class names */
  className?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

const TYPE_CONFIG: Record<ExplanationType, {
  label: string;
  icon: React.ReactNode;
  color: string;
}> = {
  portfolio_move: {
    label: 'Portfolio Move',
    icon: <TrendingUp className="w-4 h-4" />,
    color: 'text-[var(--color-positive)]',
  },
  rebalance: {
    label: 'Rebalance',
    icon: <BarChart3 className="w-4 h-4" />,
    color: 'text-[var(--color-info)]',
  },
  earnings: {
    label: 'Earnings Forecast',
    icon: <Layers className="w-4 h-4" />,
    color: 'text-[var(--color-accent)]',
  },
  risk_alert: {
    label: 'Risk Alert',
    icon: <AlertTriangle className="w-4 h-4" />,
    color: 'text-[var(--color-warning)]',
  },
  factor_shift: {
    label: 'Factor Shift',
    icon: <Shield className="w-4 h-4" />,
    color: 'text-[var(--color-info)]',
  },
};

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  ai_model: { label: 'AI Model', color: 'bg-[color-mix(in_srgb,var(--color-accent)_20%,transparent)] text-[var(--color-accent)] border-[color-mix(in_srgb,var(--color-accent)_30%,transparent)]' },
  factor_engine: { label: 'Factor Engine', color: 'bg-[color-mix(in_srgb,var(--color-info)_20%,transparent)] text-[var(--color-info)] border-[color-mix(in_srgb,var(--color-info)_30%,transparent)]' },
  market_data: { label: 'Market Data', color: 'bg-[color-mix(in_srgb,var(--color-positive)_20%,transparent)] text-[var(--color-positive)] border-[color-mix(in_srgb,var(--color-positive)_30%,transparent)]' },
  sentiment_analysis: { label: 'Sentiment', color: 'bg-[color-mix(in_srgb,var(--color-warning)_20%,transparent)] text-[var(--color-warning)] border-[color-mix(in_srgb,var(--color-warning)_30%,transparent)]' },
  earnings_calendar: { label: 'Earnings', color: 'bg-[color-mix(in_srgb,var(--color-info)_20%,transparent)] text-[var(--color-info)] border-[color-mix(in_srgb,var(--color-info)_30%,transparent)]' },
  risk_engine: { label: 'Risk Engine', color: 'bg-[color-mix(in_srgb,var(--color-negative)_20%,transparent)] text-[var(--color-negative)] border-[color-mix(in_srgb,var(--color-negative)_30%,transparent)]' },
  portfolio_optimizer: { label: 'Optimizer', color: 'bg-[color-mix(in_srgb,var(--color-accent)_20%,transparent)] text-[var(--color-accent)] border-[color-mix(in_srgb,var(--color-accent)_30%,transparent)]' },
  system: { label: 'System', color: 'bg-[color-mix(in_srgb,var(--color-text-muted)_20%,transparent)] text-[var(--color-text-muted)] border-[color-mix(in_srgb,var(--color-text-muted)_30%,transparent)]' },
};

function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.8) return 'text-[var(--color-positive)]';
  if (confidence >= 0.6) return 'text-[var(--color-warning)]';
  return 'text-[var(--color-negative)]';
}

function getConfidenceBarWidth(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ============================================================================
// LOADING SKELETON
// ============================================================================

function LoadingSkeleton() {
  return (
    <div className="space-y-3 animate-shimmer">
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded bg-theme-tertiary" />
        <div className="h-4 w-32 rounded bg-theme-tertiary" />
      </div>
      <div className="space-y-2">
        <div className="h-3 w-full rounded bg-theme-tertiary" />
        <div className="h-3 w-5/6 rounded bg-theme-tertiary" />
        <div className="h-3 w-4/6 rounded bg-theme-tertiary" />
      </div>
      <div className="flex gap-2 mt-3">
        <div className="h-5 w-20 rounded-full bg-theme-tertiary" />
        <div className="h-5 w-16 rounded-full bg-theme-tertiary" />
      </div>
    </div>
  );
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ExplanationCard({
  type,
  symbol,
  portfolio,
  context,
  className = '',
}: ExplanationCardProps) {
  const [result, setResult] = useState<ExplanationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const config = TYPE_CONFIG[type];

  const fetchExplanation = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await api.post('/explain', {
        type,
        symbol,
        portfolio,
        context,
      });

      // api client interceptor unwraps response.data
      const data = (response as unknown as Record<string, unknown>)?.data ?? response;

      if (data && typeof data === 'object' && 'text' in data) {
        setResult(data as ExplanationResult);
      } else if (data && typeof data === 'object' && 'success' in data && (data as Record<string, unknown>).data) {
        setResult((data as Record<string, unknown>).data as ExplanationResult);
      } else {
        setError('Unexpected response format.');
      }
    } catch (err) {
      console.error('Failed to fetch explanation:', err);
      setError('Unable to generate explanation. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [type, symbol, portfolio, context]);

  const isAIPowered = result?.sources.includes('ai_model');

  return (
    <Card
      title={config.label}
      className={className}
      action={
        <Button
          onClick={fetchExplanation}
          isLoading={isLoading}
          size="sm"
          variant="secondary"
          aria-label={`Refresh ${config.label} explanation`}
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          {result ? 'Refresh' : 'Generate'}
        </Button>
      }
    >
      {/* State: Loading */}
      {isLoading && <LoadingSkeleton />}

      {/* State: Error */}
      {!isLoading && error && (
        <div
          className="glass-slab-floating relative overflow-hidden flex items-start gap-3 p-3 pl-5 rounded-xl before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px]"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--color-negative) 8%, transparent)',
          }}
        >
          <span aria-hidden="true" className="absolute left-0 top-0 bottom-0 w-[3px] bg-[var(--color-negative)]" />
          <AlertTriangle className="w-5 h-5 text-[var(--color-negative)] flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="text-sm leading-relaxed text-[var(--color-negative)]">{error}</p>
            <button
              onClick={fetchExplanation}
              className="text-xs text-[var(--color-negative)] underline hover:opacity-80 mt-1 animate-press transition-opacity duration-200"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {/* State: Empty (no result yet) */}
      {!isLoading && !error && !result && (
        <div className="text-center py-6">
          <div className={`inline-flex items-center justify-center w-12 h-12 rounded-full glass-slab-floating mb-3 ${config.color}`}>
            {config.icon}
          </div>
          <p className="text-sm leading-relaxed text-theme-muted">
            Click &quot;Generate&quot; to get an AI-powered {config.label.toLowerCase()} explanation
            {symbol ? ` for ${symbol}` : ''}.
          </p>
        </div>
      )}

      {/* State: Result */}
      {!isLoading && !error && result && (() => {
        const confidenceRail =
          result.confidence >= 0.8 ? 'var(--color-positive)' :
          result.confidence >= 0.6 ? 'var(--color-warning)' :
          'var(--color-negative)';
        return (
          <div
            className="glass-slab-floating relative overflow-hidden rounded-xl p-4 space-y-4"
          >
            {/* Sovereign top bar */}
            <div className="sovereign-bar absolute left-0 right-0 top-0" aria-hidden="true" />
            {/* Type badge + AI/Template badge */}
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <span className={`inline-flex items-center gap-1.5 mono text-[10px] tracking-[0.3em] uppercase font-medium ${config.color}`}>
                {config.icon}
                {config.label}
              </span>

              {symbol && (
                <span className="mono text-xs font-bold tabular-nums text-theme">
                  {result.symbol}
                </span>
              )}

              {isAIPowered ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full mono text-[10px] tracking-[0.2em] uppercase font-medium bg-[color-mix(in_srgb,var(--color-accent)_15%,transparent)] text-[var(--color-accent)] border border-[color-mix(in_srgb,var(--color-accent)_25%,transparent)]">
                  <Sparkles className="w-3 h-3" aria-hidden="true" />
                  AI-powered
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full mono text-[10px] tracking-[0.2em] uppercase font-medium bg-[color-mix(in_srgb,var(--color-info)_15%,transparent)] text-[var(--color-info)] border border-[color-mix(in_srgb,var(--color-info)_25%,transparent)]">
                  <Brain className="w-3 h-3" aria-hidden="true" />
                  Template-based
                </span>
              )}

              {result.cached && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full mono text-[10px] tracking-[0.2em] uppercase font-medium glass-slab-floating text-theme-muted">
                  <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                  Cached
                </span>
              )}
            </div>

            {/* Explanation text */}
            <p className="text-sm leading-relaxed text-theme-secondary">
              {result.text}
            </p>

            {/* Confidence pill — type-rail pattern */}
            <div className="flex items-center gap-3">
              <span className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Confidence</span>
              <div className="flex-1 h-1.5 rounded-full bg-theme-tertiary overflow-hidden">
                <div
                  className="h-full rounded-full transition-[width] duration-500 ease-out"
                  style={{
                    width: getConfidenceBarWidth(result.confidence),
                    backgroundColor: confidenceRail,
                  }}
                />
              </div>
              <span
                className="glass-slab-floating relative inline-flex items-center pl-3 pr-2.5 py-0.5 rounded-full mono text-[10px] tabular-nums font-medium overflow-hidden before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px]"
                style={{
                  backgroundColor: `color-mix(in srgb, ${confidenceRail} 8%, transparent)`,
                  color: confidenceRail,
                }}
              >
                <span aria-hidden="true" className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ backgroundColor: confidenceRail }} />
                <span className={`text-xs font-medium ${getConfidenceColor(result.confidence)}`}>
                  {(result.confidence * 100).toFixed(0)}%
                </span>
              </span>
            </div>

            {/* Source badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Sources</span>
              {result.sources.map((source) => {
                const sourceMeta = SOURCE_LABELS[source] || {
                  label: source.replace(/_/g, ' '),
                  color: 'bg-[color-mix(in_srgb,var(--color-text-muted)_15%,transparent)] text-[var(--color-text-muted)] border-[color-mix(in_srgb,var(--color-text-muted)_25%,transparent)]',
                };
                return (
                  <span
                    key={source}
                    className={`inline-flex items-center px-2 py-0.5 rounded-full mono text-[10px] tracking-[0.2em] uppercase border ${sourceMeta.color}`}
                  >
                    {sourceMeta.label}
                  </span>
                );
              })}
            </div>

            {/* Timestamp */}
            <div className="flex items-center gap-1.5 mono text-[10px] tracking-[0.2em] uppercase text-theme-muted">
              <Clock className="w-3 h-3" aria-hidden="true" />
              Generated at {formatTimestamp(result.generatedAt)}
            </div>
          </div>
        );
      })()}
    </Card>
  );
}
