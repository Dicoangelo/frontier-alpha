/**
 * CVRF Cycle History Component
 *
 * Displays history of CVRF cycles with performance deltas and insights
 */

import { History, TrendingUp, TrendingDown, Lightbulb, ArrowRight } from 'lucide-react';
import { useCVRFHistory } from '@/hooks/useCVRF';
import type { CVRFCycleResult } from '@/types/cvrf';

interface CycleCardProps {
  cycle: CVRFCycleResult;
  index: number;
}

function CycleCard({ cycle, index }: CycleCardProps) {
  const deltaColor = cycle.performanceDelta >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]';
  const DeltaIcon = cycle.performanceDelta >= 0 ? TrendingUp : TrendingDown;

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="glass-slab rounded-xl p-4 animate-enter transition-[background-color,border-color,box-shadow] duration-200 hover:bg-[var(--color-bg-tertiary)]">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-sm font-medium text-theme tabular-nums">Cycle #{index + 1}</p>
          <p className="mono text-[10px] tracking-[0.2em] uppercase text-theme-muted tabular-nums mt-0.5">
            {formatDate(cycle.timestamp)}
          </p>
        </div>
        <div className={`flex items-center gap-1 ${deltaColor}`}>
          <DeltaIcon className="w-4 h-4" aria-hidden="true" />
          <span className="font-bold text-sm tabular-nums">
            {cycle.performanceDelta >= 0 ? '+' : ''}
            {(cycle.performanceDelta * 100).toFixed(2)}%
          </span>
        </div>
      </div>

      {/* Episode Comparison */}
      <div className="flex items-center gap-2 text-xs text-theme-secondary mb-3">
        <span className="px-2 py-1 bg-[var(--color-bg)] rounded mono tabular-nums">
          {(cycle.previousEpisodeReturn * 100).toFixed(2)}%
        </span>
        <ArrowRight className="w-3 h-3" aria-hidden="true" />
        <span className="px-2 py-1 bg-[var(--color-bg)] rounded mono tabular-nums">
          {(cycle.currentEpisodeReturn * 100).toFixed(2)}%
        </span>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="p-2 bg-[var(--color-bg)] rounded">
          <p className="mono text-[10px] tracking-[0.2em] uppercase text-theme-muted">τ (Overlap)</p>
          <p className="font-bold text-theme tabular-nums">{cycle.decisionOverlap.toFixed(2)}</p>
        </div>
        <div className="p-2 bg-[var(--color-bg)] rounded">
          <p className="mono text-[10px] tracking-[0.2em] uppercase text-theme-muted">Insights</p>
          <p className="font-bold text-[var(--color-accent)] tabular-nums">{cycle.insightsCount}</p>
        </div>
        <div className="p-2 bg-[var(--color-bg)] rounded">
          <p className="mono text-[10px] tracking-[0.2em] uppercase text-theme-muted">Updates</p>
          <p className="font-bold text-[var(--color-accent)] tabular-nums">{cycle.beliefUpdatesCount}</p>
        </div>
      </div>

      {/* Regime Change */}
      {cycle.newRegime && (
        <div className="mt-3 flex items-center gap-2 text-xs">
          <span className="mono text-[10px] tracking-[0.2em] uppercase text-theme-muted">New Regime:</span>
          <span className="px-2 py-0.5 bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-[var(--color-accent)] rounded-full capitalize mono tracking-[0.1em]">
            {cycle.newRegime}
          </span>
        </div>
      )}
    </div>
  );
}

export function CVRFCycleHistory() {
  const { data: history, isLoading, isError } = useCVRFHistory();

  if (isLoading) {
    return (
      <div className="glass-slab rounded-2xl p-6 sm:p-8 animate-shimmer">
        <div className="h-6 bg-[var(--color-border)] rounded w-1/3 mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-[var(--color-bg-secondary)] rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div
        className="glass-slab-floating relative overflow-hidden rounded-2xl p-6 sm:p-8 shadow-[0_18px_60px_-20px_rgba(239,68,68,0.45)] before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-[var(--color-negative)]"
        role="alert"
      >
        <p className="mono text-[10px] sm:text-xs tracking-[0.3em] uppercase text-theme-muted mb-2">CVRF Cycles</p>
        <p className="text-[var(--color-negative)] text-sm">Failed to load cycle history</p>
      </div>
    );
  }

  const cycles = history || [];
  const totalInsights = cycles.reduce((sum, c) => sum + c.insightsCount, 0);
  const avgDelta =
    cycles.length > 0
      ? cycles.reduce((sum, c) => sum + c.performanceDelta, 0) / cycles.length
      : 0;

  return (
    <div className="glass-slab rounded-2xl p-6 sm:p-8 animate-enter">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="mono text-[10px] sm:text-xs tracking-[0.3em] uppercase text-theme-muted mb-2">
            Reinforcement Loop
          </p>
          <h3 className="text-lg font-semibold text-theme flex items-center gap-2">
            <History className="w-5 h-5 text-[var(--color-accent)]" aria-hidden="true" />
            CVRF Cycles
          </h3>
        </div>
        <span className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted tabular-nums">
          {cycles.length} cycles
        </span>
      </div>

      {/* Summary Stats */}
      {cycles.length > 0 && (
        <div className="grid grid-cols-2 gap-3 mb-4 animate-stagger">
          <div className="glass-slab-floating rounded-xl p-3 animate-enter">
            <div className="flex items-center gap-1.5 text-[var(--color-accent)] mb-1">
              <Lightbulb className="w-4 h-4" aria-hidden="true" />
              <span className="mono text-[10px] tracking-[0.3em] uppercase">Total Insights</span>
            </div>
            <p className="text-2xl font-bold text-[var(--color-accent)] tabular-nums">{totalInsights}</p>
          </div>
          <div className="glass-slab-floating rounded-xl p-3 animate-enter">
            <div className="flex items-center gap-1.5 text-[var(--color-positive)] mb-1">
              <TrendingUp className="w-4 h-4" aria-hidden="true" />
              <span className="mono text-[10px] tracking-[0.3em] uppercase">Avg Improvement</span>
            </div>
            <p className={`text-2xl font-bold tabular-nums ${avgDelta >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}>
              {avgDelta >= 0 ? '+' : ''}
              {(avgDelta * 100).toFixed(2)}%
            </p>
          </div>
        </div>
      )}

      {/* Cycle List */}
      {cycles.length === 0 ? (
        <div className="text-center py-8">
          <History className="w-12 h-12 text-theme-muted mx-auto mb-3" aria-hidden="true" />
          <p className="text-theme-muted text-sm">No CVRF cycles yet</p>
          <p className="text-theme-muted text-xs mt-1">
            Close an episode with CVRF enabled to see cycles
          </p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[500px] overflow-y-auto animate-stagger">
          {cycles.map((cycle, idx) => (
            <CycleCard key={idx} cycle={cycle} index={cycles.length - 1 - idx} />
          ))}
        </div>
      )}
    </div>
  );
}
