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
      return (response as any).data;
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
          ? 'bg-green-500/10 text-green-700 border border-green-500/20'
          : 'bg-red-500/10 text-red-700 border border-red-500/20'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      <span className="capitalize">{factor.replace(/_/g, ' ')}</span>
      <span className="font-mono">
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
      <div className="bg-[var(--color-bg)] rounded-xl border border-[var(--color-border)] p-6">
        <div className="h-6 bg-[var(--color-border)] rounded w-1/3 mb-4 animate-pulse" />
        <div className="space-y-3">
          <div className="h-4 bg-[var(--color-border)] rounded w-full animate-pulse" />
          <div className="h-4 bg-[var(--color-border)] rounded w-2/3 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!metaPrompt) {
    return (
      <div className="bg-[var(--color-bg)] rounded-xl border border-[var(--color-border)] p-6">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-5 h-5 text-indigo-500" />
          <h3 className="text-lg font-semibold text-[var(--color-text)]">Meta-Prompt</h3>
        </div>
        <div className="text-center py-6 text-sm text-[var(--color-text-muted)]">
          Complete a CVRF cycle to generate your first meta-prompt
        </div>
      </div>
    );
  }

  const hasFactorAdjustments = Object.keys(metaPrompt.factorAdjustments).length > 0;

  return (
    <div className="bg-gradient-to-br from-[var(--color-bg)] to-indigo-50/30 rounded-xl border border-indigo-500/20 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-[var(--color-text)]">Meta-Prompt</h3>
            <span className="text-xs text-[var(--color-text-muted)]">
              Cycle #{metaPrompt.cycleNumber} •{' '}
              {new Date(metaPrompt.generatedAt).toLocaleDateString()}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`px-2 py-1 text-xs rounded-full ${
              metaPrompt.sourceEpisodes.delta >= 0
                ? 'bg-green-500/10 text-green-700'
                : 'bg-red-500/10 text-red-700'
            }`}
          >
            {metaPrompt.sourceEpisodes.delta >= 0 ? '+' : ''}
            {(metaPrompt.sourceEpisodes.delta * 100).toFixed(2)}% delta
          </div>
        </div>
      </div>

      {/* Optimization Direction */}
      <div className="mb-4 p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-lg">
        <div className="text-xs text-indigo-600 font-medium mb-1 flex items-center gap-1">
          <Lightbulb className="w-3.5 h-3.5" />
          Optimization Direction
        </div>
        <p className="text-sm text-[var(--color-text)] leading-relaxed">
          {metaPrompt.optimizationDirection}
        </p>
      </div>

      {/* Key Learnings */}
      {metaPrompt.keyLearnings.length > 0 && (
        <div className="mb-4">
          <div className="text-xs text-[var(--color-text-muted)] font-medium mb-2">Key Learnings</div>
          <div className="space-y-1.5">
            {metaPrompt.keyLearnings.slice(0, expanded ? undefined : 3).map((learning: string, idx: number) => (
              <div key={idx} className="flex items-start gap-2 text-sm text-[var(--color-text-secondary)]">
                <CheckCircle2 className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                <span>{learning}</span>
              </div>
            ))}
          </div>
          {metaPrompt.keyLearnings.length > 3 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="mt-2 text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
            >
              {expanded ? (
                <>
                  <ChevronUp className="w-3 h-3" /> Show less
                </>
              ) : (
                <>
                  <ChevronDown className="w-3 h-3" /> Show {metaPrompt.keyLearnings.length - 3} more
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Factor Adjustments */}
      {hasFactorAdjustments && (
        <div className="mb-4">
          <div className="text-xs text-[var(--color-text-muted)] font-medium mb-2">
            Recommended Factor Adjustments
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(metaPrompt.factorAdjustments)
              .sort(([, a], [, b]) => Math.abs(b as number) - Math.abs(a as number))
              .map(([factor, adjustment]) => (
                <FactorAdjustmentBadge key={factor} factor={factor} adjustment={adjustment as number} />
              ))}
          </div>
        </div>
      )}

      {/* Risk & Timing */}
      <div className="grid grid-cols-2 gap-3">
        {metaPrompt.riskGuidance && (
          <div className="p-3 bg-[var(--color-bg-tertiary)] rounded-lg">
            <div className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] mb-1">
              <Shield className="w-3.5 h-3.5" />
              Risk Guidance
            </div>
            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
              {metaPrompt.riskGuidance}
            </p>
          </div>
        )}
        {metaPrompt.timingInsights && (
          <div className="p-3 bg-[var(--color-bg-tertiary)] rounded-lg">
            <div className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] mb-1">
              <Clock className="w-3.5 h-3.5" />
              Timing Insights
            </div>
            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
              {metaPrompt.timingInsights}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
