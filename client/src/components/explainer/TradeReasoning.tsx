import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { X, Brain, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp } from 'lucide-react';
import { api, getErrorMessage } from '@/api/client';
import { Spinner } from '@/components/shared/Spinner';
import { Card } from '@/components/shared/Card';

interface TradeReasoningProps {
  symbol: string;
  isOpen: boolean;
  onClose: () => void;
}

interface FactorContribution {
  factor: string;
  conviction: number;
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  contribution: number;
}

interface TradeExplanation {
  symbol: string;
  recommendation: 'buy' | 'sell' | 'hold' | 'reduce' | 'add';
  confidence: number;
  summary: string;
  reasoning: string;
  topFactors: FactorContribution[];
  riskNotes: string[];
}

function formatFactor(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function DirectionIcon({ direction }: { direction: string }) {
  if (direction === 'bullish') return <TrendingUp className="w-3.5 h-3.5 text-[var(--color-positive)]" />;
  if (direction === 'bearish') return <TrendingDown className="w-3.5 h-3.5 text-[var(--color-negative)]" />;
  return <Minus className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />;
}

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

export function TradeReasoning({ symbol, isOpen, onClose }: TradeReasoningProps) {
  const [showAllFactors, setShowAllFactors] = useState(false);

  const { mutate: fetchExplanation, data, isPending, error } = useMutation({
    mutationFn: async (sym: string) => {
      const response = await api.get(`/explain/trade/${sym}`);
      return response.data as TradeExplanation;
    },
  });

  // Fetch when opened
  if (isOpen && !data && !isPending && !error) {
    fetchExplanation(symbol);
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
          <div className="px-6 py-5 space-y-5">
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
                  onClick={() => fetchExplanation(symbol)}
                  className="mt-3 text-sm text-[var(--color-accent)] hover:underline"
                >
                  Try again
                </button>
              </div>
            )}

            {data && (
              <>
                {/* Recommendation + Confidence */}
                <div className="flex items-center justify-between">
                  <RecommendationBadge rec={data.recommendation} />
                  <div className="text-right">
                    <p className="text-xs text-[var(--color-text-muted)]">Confidence</p>
                    <p className="text-sm font-semibold text-[var(--color-text)]">
                      {(data.confidence * 100).toFixed(0)}%
                    </p>
                  </div>
                </div>

                {/* Summary */}
                <div className="bg-[var(--color-bg-tertiary)] rounded-lg p-4">
                  <p className="text-sm text-[var(--color-text)] leading-relaxed">
                    {data.summary}
                  </p>
                </div>

                {/* Top Contributing Factors */}
                <div>
                  <h3 className="text-sm font-medium text-[var(--color-text-secondary)] mb-3">
                    Top Contributing Factors
                  </h3>
                  <div className="space-y-2">
                    {(showAllFactors ? data.topFactors : data.topFactors.slice(0, 5)).map((factor) => (
                      <div
                        key={factor.factor}
                        className="flex items-center justify-between py-2 border-b border-[var(--color-border-light)] last:border-0"
                      >
                        <div className="flex items-center gap-2">
                          <DirectionIcon direction={factor.direction} />
                          <span className="text-sm text-[var(--color-text)]">
                            {formatFactor(factor.factor)}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-[var(--color-text-muted)]">
                            {(factor.confidence * 100).toFixed(0)}% conf
                          </span>
                          <span className={`font-medium ${
                            factor.contribution > 0 ? 'text-[var(--color-positive)]' :
                            factor.contribution < 0 ? 'text-[var(--color-negative)]' :
                            'text-[var(--color-text-secondary)]'
                          }`}>
                            {factor.contribution > 0 ? '+' : ''}{(factor.contribution * 100).toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {data.topFactors.length > 5 && (
                    <button
                      onClick={() => setShowAllFactors(!showAllFactors)}
                      className="flex items-center gap-1 mt-2 text-xs text-[var(--color-accent)] hover:underline"
                    >
                      {showAllFactors ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      {showAllFactors ? 'Show less' : `Show all ${data.topFactors.length} factors`}
                    </button>
                  )}
                </div>

                {/* Full Reasoning */}
                {data.reasoning && (
                  <div>
                    <h3 className="text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                      Full Reasoning
                    </h3>
                    <p className="text-sm text-[var(--color-text-muted)] leading-relaxed whitespace-pre-line">
                      {data.reasoning}
                    </p>
                  </div>
                )}

                {/* Risk Notes */}
                {data.riskNotes.length > 0 && (
                  <div className="bg-[var(--color-warning)]/5 border border-[var(--color-warning)]/20 rounded-lg p-3">
                    <h3 className="text-xs font-medium text-[var(--color-warning)] mb-1">Risk Notes</h3>
                    <ul className="text-xs text-[var(--color-text-muted)] space-y-1">
                      {data.riskNotes.map((note, i) => (
                        <li key={i} className="flex gap-1.5">
                          <span className="text-[var(--color-warning)]">•</span>
                          {note}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

/**
 * Small "Why?" button for use in portfolio tables / position lists
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
