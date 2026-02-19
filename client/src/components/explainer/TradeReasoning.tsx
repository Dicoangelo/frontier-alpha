import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { X, Brain, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, Zap, Activity, GitBranch, Target } from 'lucide-react';
import { api, getErrorMessage } from '@/api/client';
import { Spinner } from '@/components/shared/Spinner';
import { Card } from '@/components/shared/Card';

interface TradeReasoningProps {
  symbol: string;
  isOpen: boolean;
  onClose: () => void;
}

// 4-step chain-of-thought types (US-025)
interface TradeReasoningStep {
  step: 1 | 2 | 3 | 4;
  title: string;
  explanation: string;
  confidence: number;
  dataPoints: string[];
}

interface TradeReasoningChain {
  symbol: string;
  recommendation: 'buy' | 'sell' | 'hold' | 'reduce' | 'add';
  overallConfidence: number;
  steps: TradeReasoningStep[];
  generatedAt: string;
  cached: boolean;
}

const STEP_ICONS = [Zap, Activity, GitBranch, Target];
const STEP_COLORS = [
  'text-blue-500 bg-blue-500/10',
  'text-purple-500 bg-purple-500/10',
  'text-amber-500 bg-amber-500/10',
  'text-green-500 bg-green-500/10',
];

// Kept to suppress unused import warnings from linter
const _icons = { TrendingUp, TrendingDown, Minus };
void _icons;

function RecommendationBadge({ rec }: { rec: string }) {
  const styles: Record<string, string> = {
    buy: 'bg-[var(--color-positive)]/10 text-[var(--color-positive)]',
    add: 'bg-[var(--color-positive)]/10 text-[var(--color-positive)]',
    hold: 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]',
    sell: 'bg-[var(--color-negative)]/10 text-[var(--color-negative)]',
    reduce: 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]',
  };

  return (
    <span className={`px-2 py-0.5 rounded text-xs font-semibold uppercase ${styles[rec] || styles.hold}`}>
      {rec}
    </span>
  );
}

/**
 * Individual step card — collapsed by default, expand to see full detail
 */
function ChainStep({ step, index }: { step: TradeReasoningStep; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = STEP_ICONS[index];
  const colorClass = STEP_COLORS[index];

  return (
    <div
      className={`border border-[var(--color-border)] rounded-lg overflow-hidden transition-all ${expanded ? 'shadow-sm' : ''}`}
      data-testid={`chain-step-${step.step}`}
    >
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--color-bg-tertiary)] transition-colors"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${colorClass}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[var(--color-text-muted)] font-medium">
              STEP {step.step}
            </span>
            <span className="text-sm font-medium text-[var(--color-text)]">{step.title}</span>
          </div>
          {!expanded && (
            <p className="text-xs text-[var(--color-text-muted)] truncate mt-0.5">
              {step.explanation.slice(0, 80)}...
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs font-mono text-[var(--color-text-muted)]">
            {(step.confidence * 100).toFixed(0)}%
          </span>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-[var(--color-text-muted)]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[var(--color-text-muted)]" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-[var(--color-border)]">
          <p className="text-sm text-[var(--color-text)] leading-relaxed pt-3">
            {step.explanation}
          </p>
          <div className="flex justify-between items-center">
            <span className="text-xs text-[var(--color-text-muted)]">Step confidence</span>
            <div className="flex items-center gap-2">
              <div className="w-24 h-1.5 bg-[var(--color-bg-secondary)] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--color-accent)]"
                  style={{ width: `${step.confidence * 100}%` }}
                />
              </div>
              <span className="text-xs font-mono text-[var(--color-text-muted)]">
                {(step.confidence * 100).toFixed(0)}%
              </span>
            </div>
          </div>
          {step.dataPoints.length > 0 && (
            <div className="bg-[var(--color-bg-tertiary)] rounded-lg p-3 space-y-1">
              {step.dataPoints.map((point, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs text-[var(--color-text-muted)]">
                  <span className="text-[var(--color-accent)] mt-0.5">•</span>
                  {point}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TradeReasoning({ symbol, isOpen, onClose }: TradeReasoningProps) {
  const { mutate: fetchChain, data: chain, isPending, error, reset } = useMutation({
    mutationFn: async (sym: string) => {
      const response = await api.get(`/explain/trade/${sym}`);
      return response.data as TradeReasoningChain;
    },
  });

  // Fetch when opened
  if (isOpen && !chain && !isPending && !error) {
    fetchChain(symbol);
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative min-h-full flex items-center justify-center p-4">
        <Card className="relative w-full max-w-lg shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[var(--color-accent)]/10 rounded-lg">
                <Brain className="w-5 h-5 text-[var(--color-accent)]" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-[var(--color-text)]">Why {symbol}?</h2>
                <p className="text-xs text-[var(--color-text-muted)]">CVRF chain-of-thought reasoning</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-[var(--color-bg-tertiary)] rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-[var(--color-text-muted)]" />
            </button>
          </div>

          {/* Content */}
          <div className="px-6 py-5 space-y-4">
            {isPending && (
              <div className="flex flex-col items-center justify-center h-48 gap-3">
                <Spinner className="w-8 h-8" />
                <p className="text-sm text-[var(--color-text-muted)]">Analyzing CVRF reasoning...</p>
              </div>
            )}

            {error && (
              <div className="text-center py-8">
                <p className="text-sm text-[var(--color-danger)]">
                  {getErrorMessage(error)}
                </p>
                <button
                  onClick={() => { reset(); fetchChain(symbol); }}
                  className="mt-3 text-sm text-[var(--color-accent)] hover:underline"
                >
                  Try again
                </button>
              </div>
            )}

            {chain && (
              <>
                {/* Recommendation + Overall Confidence */}
                <div className="flex items-center justify-between p-3 bg-[var(--color-bg-tertiary)] rounded-lg">
                  <div className="flex items-center gap-2">
                    <RecommendationBadge rec={chain.recommendation} />
                    {chain.cached && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)] rounded">
                        cached
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide">
                      Overall confidence
                    </p>
                    <p className="text-base font-semibold text-[var(--color-text)]">
                      {(chain.overallConfidence * 100).toFixed(0)}%
                    </p>
                  </div>
                </div>

                {/* 4-Step Chain of Thought (collapsed by default) */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
                    Chain of Thought — expand each step
                  </p>
                  {chain.steps.map((step, i) => (
                    <ChainStep key={step.step} step={step} index={i} />
                  ))}
                </div>
              </>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

/**
 * Small inline "Why this trade?" button — collapsed by default per US-025
 */
export function WhyButton({ symbol, onClick }: { symbol: string; onClick: (symbol: string) => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick(symbol);
      }}
      className="p-1.5 min-w-[44px] min-h-[44px] text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 rounded-lg flex items-center justify-center gap-1 text-xs font-medium transition-colors"
      title={`Why ${symbol}?`}
      aria-label={`Explain ${symbol} reasoning`}
    >
      <Brain className="w-4 h-4" />
      Why?
    </button>
  );
}
