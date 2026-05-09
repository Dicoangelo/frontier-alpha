/**
 * Meta-Prompt Card Component
 *
 * Displays the latest CVRF meta-prompt with actionable insights.
 * Shows optimization direction, key learnings, factor adjustments,
 * and risk/timing guidance.
 */

import { useState } from 'react';
import {
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Lightbulb,
  Shield,
  Clock,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { CVRFApiResponse } from '@/types/cvrf';

interface MetaPromptData {
  optimizationDirection: string;
  keyLearnings: string[];
  factorAdjustments: Record<string, number>;
  riskGuidance: string;
  timingInsights: string;
  generatedAt: string;
  cycleNumber: number;
  sourceEpisodes: {
    previous: number;
    current: number;
    delta: number;
  };
}

function useMetaPrompt() {
  return useQuery({
    queryKey: ['cvrf', 'meta-prompt'],
    queryFn: async () => {
      const response = await api.get<CVRFApiResponse<MetaPromptData | null>>('/cvrf/meta-prompt');
      return (response as unknown as CVRFApiResponse<MetaPromptData | null>).data;
    },
    staleTime: 60 * 1000,
  });
}

interface FactorAdjustmentBadgeProps {
  factor: string;
  adjustment: number;
}

function FactorAdjustmentBadge({ factor, adjustment }: FactorAdjustmentBadgeProps) {
  const isPositive = adjustment > 0;
  const Icon = isPositive ? ArrowUpRight : ArrowDownRight;

  return (
    <div
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${
        isPositive
          ? 'bg-[color-mix(in_srgb,var(--color-positive)_10%,transparent)] text-[var(--color-positive)] border border-[color-mix(in_srgb,var(--color-positive)_20%,transparent)]'
          : 'bg-[color-mix(in_srgb,var(--color-negative)_10%,transparent)] text-[var(--color-negative)] border border-[color-mix(in_srgb,var(--color-negative)_20%,transparent)]'
      }`}
    >
      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
      <span className="capitalize">{factor.replace(/_/g, ' ')}</span>
      <span className="mono tabular-nums">
        {isPositive ? '+' : ''}
        {(adjustment * 100).toFixed(1)}%
      </span>
    </div>
  );
}

export function MetaPromptCard() {
  const { data: metaPrompt, isLoading } = useMetaPrompt();
  const [expanded, setExpanded] = useState(false);

  if (isLoading) {
    return (
      <div className="glass-slab rounded-2xl p-6 sm:p-8">
        <div className="h-6 bg-[var(--color-border)] rounded w-1/3 mb-4 animate-shimmer" />
        <div className="space-y-3">
          <div className="h-4 bg-[var(--color-border)] rounded w-full animate-shimmer" />
          <div className="h-4 bg-[var(--color-border)] rounded w-2/3 animate-shimmer" />
        </div>
      </div>
    );
  }

  if (!metaPrompt) {
    return (
      <div className="glass-slab rounded-2xl p-6 sm:p-8">
        <div className="mb-3">
          <p className="mono text-[10px] sm:text-xs tracking-[0.3em] uppercase text-theme-muted mb-2">
            Self-Update
          </p>
          <h3 className="text-lg font-semibold text-theme flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[var(--color-accent)]" aria-hidden="true" />
            Meta-Prompt
          </h3>
        </div>
        <div className="text-center py-6 text-sm text-theme-muted">
          Complete a CVRF cycle to generate your first meta-prompt
        </div>
      </div>
    );
  }

  // Defend against partial server payloads: every collection we read below
  // may be missing on the first cycle's meta-prompt.
  const factorAdjustments = metaPrompt.factorAdjustments ?? {};
  const keyLearnings = metaPrompt.keyLearnings ?? [];
  const sourceEpisodes = metaPrompt.sourceEpisodes ?? { previous: 0, current: 0, delta: 0 };
  const hasFactorAdjustments = Object.keys(factorAdjustments).length > 0;

  return (
    <div className="glass-slab rounded-2xl p-6 sm:p-8 animate-enter relative overflow-hidden">
      {/* Subtle sovereign gradient wash */}
      <div className="absolute inset-0 gradient-brand-subtle pointer-events-none" aria-hidden="true" />

      {/* Header */}
      <div className="relative flex items-start justify-between mb-4 gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[image:var(--gradient-sovereign)] rounded-xl flex items-center justify-center shrink-0 shadow-[0_10px_30px_-12px_rgba(123,44,255,0.6)]">
            <Sparkles className="w-5 h-5 text-white" aria-hidden="true" />
          </div>
          <div>
            <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted mb-1">
              Self-Update · Cycle #{metaPrompt.cycleNumber}
            </p>
            <h3 className="text-lg font-semibold text-theme">Meta-Prompt</h3>
            <p className="mono text-[10px] tracking-[0.2em] uppercase text-theme-muted tabular-nums mt-0.5">
              {new Date(metaPrompt.generatedAt).toLocaleDateString()}
            </p>
          </div>
        </div>
        <div
          className={`px-2 py-1 mono text-[10px] tracking-[0.2em] uppercase tabular-nums rounded-full ${
            sourceEpisodes.delta >= 0
              ? 'bg-[color-mix(in_srgb,var(--color-positive)_10%,transparent)] text-[var(--color-positive)]'
              : 'bg-[color-mix(in_srgb,var(--color-negative)_10%,transparent)] text-[var(--color-negative)]'
          }`}
        >
          {sourceEpisodes.delta >= 0 ? '+' : ''}
          {(sourceEpisodes.delta * 100).toFixed(2)}% Δ
        </div>
      </div>

      {/* Optimization Direction */}
      <div className="relative mb-4 glass-slab-floating rounded-xl p-4">
        <div className="mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-accent)] font-medium mb-2 flex items-center gap-1">
          <Lightbulb className="w-3.5 h-3.5" aria-hidden="true" />
          Optimization Direction
        </div>
        <p className="text-sm text-theme leading-relaxed">
          {metaPrompt.optimizationDirection}
        </p>
      </div>

      {/* Key Learnings */}
      {keyLearnings.length > 0 && (
        <div className="relative mb-4">
          <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted mb-2">Key Learnings</p>
          <div className="space-y-1.5">
            {keyLearnings.slice(0, expanded ? undefined : 3).map((learning: string, idx: number) => (
              <div key={idx} className="flex items-start gap-2 text-sm text-theme-secondary">
                <CheckCircle2 className="w-4 h-4 text-[var(--color-accent)] mt-0.5 shrink-0" aria-hidden="true" />
                <span>{learning}</span>
              </div>
            ))}
          </div>
          {keyLearnings.length > 3 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="mt-2 mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-accent)] flex items-center gap-1 animate-press transition-[opacity] duration-150 hover:opacity-80"
              aria-expanded={expanded}
            >
              {expanded ? (
                <>
                  <ChevronUp className="w-3 h-3" aria-hidden="true" /> Show less
                </>
              ) : (
                <>
                  <ChevronDown className="w-3 h-3" aria-hidden="true" /> Show {keyLearnings.length - 3} more
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Factor Adjustments */}
      {hasFactorAdjustments && (
        <div className="relative mb-4">
          <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted mb-2">
            Recommended Factor Adjustments
          </p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(factorAdjustments)
              .sort(([, a], [, b]) => Math.abs(b as number) - Math.abs(a as number))
              .map(([factor, adjustment]) => (
                <FactorAdjustmentBadge key={factor} factor={factor} adjustment={adjustment as number} />
              ))}
          </div>
        </div>
      )}

      {/* Risk & Timing */}
      <div className="relative grid grid-cols-1 sm:grid-cols-2 gap-3">
        {metaPrompt.riskGuidance && (
          <div className="glass-slab-floating rounded-xl p-3">
            <div className="flex items-center gap-1 mono text-[10px] tracking-[0.3em] uppercase text-theme-muted mb-1">
              <Shield className="w-3.5 h-3.5" aria-hidden="true" />
              Risk Guidance
            </div>
            <p className="text-xs text-theme-secondary leading-relaxed">
              {metaPrompt.riskGuidance}
            </p>
          </div>
        )}
        {metaPrompt.timingInsights && (
          <div className="glass-slab-floating rounded-xl p-3">
            <div className="flex items-center gap-1 mono text-[10px] tracking-[0.3em] uppercase text-theme-muted mb-1">
              <Clock className="w-3.5 h-3.5" aria-hidden="true" />
              Timing Insights
            </div>
            <p className="text-xs text-theme-secondary leading-relaxed">
              {metaPrompt.timingInsights}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
