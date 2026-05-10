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
  'text-[var(--color-info)] bg-[color-mix(in_srgb,var(--color-info)_10%,transparent)]',
  'text-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)]',
  'text-[var(--color-warning)] bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)]',
  'text-[var(--color-positive)] bg-[color-mix(in_srgb,var(--color-positive)_10%,transparent)]',
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
    <span className={`px-2.5 py-0.5 rounded-full mono text-[10px] tracking-[0.3em] uppercase font-semibold ${styles[rec] || styles.hold}`}>
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
      className={`glass-slab-floating rounded-xl overflow-hidden transition-[box-shadow] duration-200 ${expanded ? 'shadow-md' : ''}`}
      data-testid={`chain-step-${step.step}`}
    >
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--color-bg-tertiary)] animate-press transition-[background-color] duration-150"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${colorClass}`}>
          <Icon className="w-4 h-4" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted font-medium">
              Step {step.step}
            </span>
            <span className="text-sm font-medium text-theme">{step.title}</span>
          </div>
          {!expanded && (
            <p className="text-xs leading-relaxed text-theme-muted truncate mt-0.5">
              {step.explanation.slice(0, 80)}...
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="mono text-xs tabular-nums text-theme-muted">
            {(step.confidence * 100).toFixed(0)}%
          </span>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-theme-muted" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-4 h-4 text-theme-muted" aria-hidden="true" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-theme-light">
          <p className="text-sm leading-relaxed text-theme pt-3">
            {step.explanation}
          </p>
          <div className="flex justify-between items-center">
            <span className="mono text-[10px] tracking-[0.2em] uppercase text-theme-muted">Step confidence</span>
            <div className="flex items-center gap-2">
              <div className="w-24 h-1.5 bg-[var(--color-bg-secondary)] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-500 ease-out"
                  style={{ width: `${step.confidence * 100}%` }}
                />
              </div>
              <span className="mono text-xs tabular-nums text-theme-muted">
                {(step.confidence * 100).toFixed(0)}%
              </span>
            </div>
          </div>
          {step.dataPoints.length > 0 && (
            <div className="glass-slab-floating rounded-lg p-3 space-y-1">
              {step.dataPoints.map((point, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs leading-relaxed text-theme-muted">
                  <span className="text-[var(--color-accent)] mt-0.5" aria-hidden="true">•</span>
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
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative min-h-full flex items-start sm:items-center justify-center p-4 sm:p-6 lg:p-8">
        <Card className="relative w-full max-w-2xl lg:max-w-3xl max-h-[90vh] overflow-y-auto shadow-xl">
          <div className="sovereign-bar absolute left-0 right-0 top-0" aria-hidden="true" />
          {/* Header */}
          <div className="flex items-center justify-between border-b border-theme-light pb-4 mb-4 -mx-6 px-6 -mt-6 pt-7">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[var(--color-accent)]/10 rounded-lg">
                <Brain className="w-5 h-5 text-[var(--color-accent)]" aria-hidden="true" />
              </div>
              <div>
                <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">
                  Trade Reasoning
                </p>
                <h2 className="mt-0.5 text-lg font-semibold text-theme">Why {symbol}?</h2>
                <p className="text-xs text-theme-muted">CVRF chain-of-thought reasoning</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 min-h-[40px] min-w-[40px] hover:bg-[var(--color-bg-tertiary)] rounded-lg animate-press transition-[background-color] duration-200"
              aria-label="Close trade reasoning"
            >
              <X className="w-5 h-5 text-theme-muted" aria-hidden="true" />
            </button>
          </div>

          {/* Content */}
          <div className="space-y-4">
            {isPending && (
              <div className="flex flex-col items-center justify-center h-48 gap-3">
                <Spinner className="w-8 h-8" />
                <p className="mono text-[11px] tracking-[0.2em] uppercase text-theme-muted">Analyzing CVRF reasoning...</p>
              </div>
            )}

            {error && (
              <div className="text-center py-8">
                <p className="text-sm text-[var(--color-danger)] leading-relaxed">
                  {getErrorMessage(error)}
                </p>
                <button
                  onClick={() => { reset(); fetchChain(symbol); }}
                  className="mt-3 text-sm text-[var(--color-accent)] hover:underline animate-press transition-[opacity] duration-200"
                >
                  Try again
                </button>
              </div>
            )}

            {chain && (
              <>
                {/* Recommendation + Overall Confidence */}
                <div className="flex items-center justify-between glass-slab-floating rounded-xl p-3">
                  <div className="flex items-center gap-2">
                    <RecommendationBadge rec={chain.recommendation} />
                    {chain.cached && (
                      <span className="mono text-[10px] tracking-[0.2em] uppercase px-2 py-0.5 glass-slab-floating text-theme-muted rounded-full">
                        cached
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">
                      Overall confidence
                    </p>
                    <p className="mt-0.5 mono text-base font-semibold tabular-nums text-theme">
                      {(chain.overallConfidence * 100).toFixed(0)}%
                    </p>
                  </div>
                </div>

                {/* 4-Step Chain of Thought (collapsed by default) */}
                <div className="space-y-2">
                  <p className="mono text-[10px] tracking-[0.3em] uppercase font-medium text-theme-muted">
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
      className="p-1.5 min-w-[44px] min-h-[44px] text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 rounded-lg flex items-center justify-center gap-1 mono text-[10px] tracking-[0.2em] uppercase font-medium animate-press transition-[background-color] duration-200"
      title={`Why ${symbol}?`}
      aria-label={`Explain ${symbol} reasoning`}
    >
      <Brain className="w-4 h-4" aria-hidden="true" />
      Why?
    </button>
  );
}
