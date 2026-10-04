import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { X, Brain, ChevronDown, ChevronUp, Zap, Activity, GitBranch, Target } from 'lucide-react';
import { api, getErrorMessage } from '@/api/client';
import { Spinner } from '@/components/shared/Spinner';
import { DialogSurface } from '@/components/shared/DialogSurface';
import { Button } from '@/components/shared/Button';

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
  'text-[var(--color-accent-text)] bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)]',
  'text-[var(--color-warning)] bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)]',
  'text-[var(--color-positive)] bg-[color-mix(in_srgb,var(--color-positive)_10%,transparent)]',
];

/**
 * Individual step card — collapsed by default, expand to see full detail
 */
function ChainStep({ step, index }: { step: TradeReasoningStep; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = STEP_ICONS[index] ?? Activity;
  const colorClass = STEP_COLORS[index] ?? STEP_COLORS[0];
  const detailId = useId();

  return (
    <div
      className={`glass-slab-floating rounded-xl overflow-hidden transition-[box-shadow] duration-200 ${expanded ? 'shadow-md' : ''}`}
      data-testid={`chain-step-${step.step}`}
    >
      <button
        className="w-full flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 text-left hover:bg-[var(--color-bg-tertiary)] animate-press transition-[background-color] duration-150"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-controls={detailId}
        type="button"
      >
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${colorClass}`}>
          <Icon className="w-4 h-4" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
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
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-theme-muted" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-4 h-4 text-theme-muted" aria-hidden="true" />
          )}
        </div>
      </button>

      {expanded && (
        <div id={detailId} className="px-4 pb-4 space-y-3 border-t border-theme-light">
          <p className="text-xs font-medium text-theme-secondary pt-3">Illustrative example — fixed text and figures</p>
          <p className="text-sm leading-relaxed text-theme">
            {step.explanation}
          </p>
          {step.dataPoints.length > 0 && (
            <div className="glass-slab-floating rounded-lg p-3 space-y-1">
              {step.dataPoints.map((point, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs leading-relaxed text-theme-muted">
                  <span className="text-[var(--color-accent-text)] mt-0.5" aria-hidden="true">•</span>
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
  const titleId = useId();
  const { data: chain, isPending, error, refetch } = useQuery({
    queryKey: ['trade-reasoning', symbol],
    queryFn: async () => {
      const response = await api.get(`/explain/trade/${encodeURIComponent(symbol)}`);
      return response.data as TradeReasoningChain;
    },
    enabled: isOpen && !!symbol,
    retry: false,
    staleTime: 60_000,
  });

  if (!isOpen) return null;
  const researchHref = `/research?${new URLSearchParams({
    symbols: symbol,
    question: `Review ${symbol} using available market evidence. Cite the sources and explain any missing or stale data.`,
  })}`;

  return (
    <DialogSurface labelledBy={titleId} onClose={onClose} fullViewport className="trade-reasoning-dialog">
      <header className="trade-reasoning-header">
        <div className="min-w-0">
          <p className="reasoning-kicker">Illustrative strategy walkthrough</p>
          <h2 id={titleId}>Why {symbol}?</h2>
          <p>This reference uses fixed examples, not current analysis of {symbol} or your portfolio.</p>
        </div>
        <button type="button" onClick={onClose} className="trade-reasoning-close" aria-label="Close trade reasoning">
          <X className="w-5 h-5" aria-hidden="true" />
        </button>
      </header>

      <div className="trade-reasoning-body" data-testid="trade-reasoning-scroll-region">
        {isPending && <div role="status" className="flex flex-col items-center justify-center min-h-48 gap-3">
          <Spinner className="w-8 h-8" /><p className="text-sm text-theme-secondary">Loading illustrative reference…</p>
        </div>}
        {error && <div role="alert" className="text-center py-8">
          <p className="text-sm text-[var(--color-negative)] leading-relaxed">{getErrorMessage(error)}</p>
          <Button variant="outline" onClick={() => void refetch()} className="mx-auto mt-4">Try again</Button>
        </div>}
        {chain && <div className="trade-reasoning-layout">
          <aside className="trade-reasoning-summary" aria-label="Reference information">
            <h3 className="text-base font-semibold text-theme mb-3">Illustrative reference</h3>
            <p className="text-sm leading-relaxed text-theme-secondary">These fixed examples explain how a strategy review could be structured. The figures and trade actions are examples, not measurements or recommendations for {symbol}.</p>
            <p className="mt-4 text-sm leading-relaxed text-theme-secondary">No current market evidence or saved holdings were used to create this walkthrough. Use Agent research for a separate brief with inspectable sources.</p>
          </aside>
          <section className="trade-reasoning-steps" aria-label="Example strategy steps">
            <h3>Example strategy steps</h3>
            <p>Expand a step to view its sample explanation and illustrative figures.</p>
            <div className="space-y-3">{chain.steps.map((step, index) => <ChainStep key={`${symbol}-${step.step}`} step={step} index={index} />)}</div>
          </section>
        </div>}
      </div>
      <footer className="trade-reasoning-footer">
        <p>{chain ? `${chain.steps.length} example steps · ${symbol}` : `Illustrative reference · ${symbol}`}</p>
        <div className="trade-reasoning-actions">
          <Link to={researchHref} onClick={onClose} className="trade-reasoning-research-link">Research with current evidence</Link>
          <Button variant="outline" onClick={onClose}>Done</Button>
        </div>
      </footer>
    </DialogSurface>
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
      className="p-1.5 min-w-[44px] min-h-[44px] text-[var(--color-accent-text)] hover:bg-[var(--color-accent)]/10 rounded-lg flex items-center justify-center gap-1 mono text-[10px] tracking-[0.2em] uppercase font-medium animate-press transition-[background-color] duration-200"
      title={`Why ${symbol}?`}
      aria-label={`Explain ${symbol} reasoning`}
    >
      <Brain className="w-4 h-4" aria-hidden="true" />
      Why?
    </button>
  );
}
