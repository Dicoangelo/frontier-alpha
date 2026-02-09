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
    color: 'text-green-500',
  },
  rebalance: {
    label: 'Rebalance',
    icon: <BarChart3 className="w-4 h-4" />,
    color: 'text-blue-500',
  },
  earnings: {
    label: 'Earnings Forecast',
    icon: <Layers className="w-4 h-4" />,
    color: 'text-purple-500',
  },
  risk_alert: {
    label: 'Risk Alert',
    icon: <AlertTriangle className="w-4 h-4" />,
    color: 'text-amber-500',
  },
  factor_shift: {
    label: 'Factor Shift',
    icon: <Shield className="w-4 h-4" />,
    color: 'text-cyan-500',
  },
};

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  ai_model: { label: 'AI Model', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  factor_engine: { label: 'Factor Engine', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  market_data: { label: 'Market Data', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  sentiment_analysis: { label: 'Sentiment', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  earnings_calendar: { label: 'Earnings', color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' },
  risk_engine: { label: 'Risk Engine', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  portfolio_optimizer: { label: 'Optimizer', color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' },
  system: { label: 'System', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
};

function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.8) return 'text-green-500';
  if (confidence >= 0.6) return 'text-amber-500';
  return 'text-red-500';
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
    <div className="space-y-3 animate-pulse">
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
      const data = (response as any)?.data ?? response;

      if (data && typeof data === 'object' && 'text' in data) {
        setResult(data as ExplanationResult);
      } else if (data && typeof data === 'object' && 'success' in data && data.data) {
        setResult(data.data as ExplanationResult);
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
        <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-red-400">{error}</p>
            <button
              onClick={fetchExplanation}
              className="text-xs text-red-400 underline hover:text-red-300 mt-1"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {/* State: Empty (no result yet) */}
      {!isLoading && !error && !result && (
        <div className="text-center py-6">
          <div className={`inline-flex items-center justify-center w-12 h-12 rounded-full bg-theme-tertiary mb-3 ${config.color}`}>
            {config.icon}
          </div>
          <p className="text-sm text-[var(--color-text-muted)]">
            Click &quot;Generate&quot; to get an AI-powered {config.label.toLowerCase()} explanation
            {symbol ? ` for ${symbol}` : ''}.
          </p>
        </div>
      )}

      {/* State: Result */}
      {!isLoading && !error && result && (
        <div className="space-y-4">
          {/* Type badge + AI/Template badge */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${config.color}`}>
              {config.icon}
              {config.label}
            </span>

            {symbol && (
              <span className="text-xs font-mono font-bold text-[var(--color-text)]">
                {result.symbol}
              </span>
            )}

            {isAIPowered ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-400 border border-purple-500/30">
                <Sparkles className="w-3 h-3" />
                AI-powered
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30">
                <Brain className="w-3 h-3" />
                Template-based
              </span>
            )}

            {result.cached && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-500/20 text-gray-400 border border-gray-500/30">
                <CheckCircle2 className="w-3 h-3" />
                Cached
              </span>
            )}
          </div>

          {/* Explanation text */}
          <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
            {result.text}
          </p>

          {/* Confidence indicator */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--color-text-muted)]">Confidence</span>
            <div className="flex-1 h-1.5 rounded-full bg-theme-tertiary overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  result.confidence >= 0.8
                    ? 'bg-green-500'
                    : result.confidence >= 0.6
                    ? 'bg-amber-500'
                    : 'bg-red-500'
                }`}
                style={{ width: getConfidenceBarWidth(result.confidence) }}
              />
            </div>
            <span className={`text-xs font-medium ${getConfidenceColor(result.confidence)}`}>
              {(result.confidence * 100).toFixed(0)}%
            </span>
          </div>

          {/* Source badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-[var(--color-text-muted)]">Sources:</span>
            {result.sources.map((source) => {
              const sourceMeta = SOURCE_LABELS[source] || {
                label: source.replace(/_/g, ' '),
                color: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
              };
              return (
                <span
                  key={source}
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${sourceMeta.color}`}
                >
                  {sourceMeta.label}
                </span>
              );
            })}
          </div>

          {/* Timestamp */}
          <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
            <Clock className="w-3 h-3" />
            Generated at {formatTimestamp(result.generatedAt)}
          </div>
        </div>
      )}
    </Card>
  );
}
