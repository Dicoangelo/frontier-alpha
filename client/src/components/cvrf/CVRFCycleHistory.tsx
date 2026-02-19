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
    <div className="p-4 bg-[var(--color-bg-tertiary)] rounded-lg hover:bg-[var(--color-bg-secondary)] transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-sm font-medium text-[var(--color-text)]">Cycle #{index + 1}</div>
          <div className="text-xs text-[var(--color-text-muted)]">{formatDate(cycle.timestamp)}</div>
        </div>
        <div className={`flex items-center gap-1 ${deltaColor}`}>
          <DeltaIcon className="w-4 h-4" />
          <span className="font-bold text-sm">
            {cycle.performanceDelta >= 0 ? '+' : ''}
            {(cycle.performanceDelta * 100).toFixed(2)}%
          </span>
        </div>
      </div>

      {/* Episode Comparison */}
      <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)] mb-3">
        <span className="px-2 py-1 bg-[var(--color-bg)] rounded">
          {(cycle.previousEpisodeReturn * 100).toFixed(2)}%
        </span>
        <ArrowRight className="w-3 h-3" />
        <span className="px-2 py-1 bg-[var(--color-bg)] rounded">
          {(cycle.currentEpisodeReturn * 100).toFixed(2)}%
        </span>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="p-2 bg-[var(--color-bg)] rounded">
          <div className="text-xs text-[var(--color-text-muted)]">τ (Overlap)</div>
          <div className="font-bold text-[var(--color-text)]">{cycle.decisionOverlap.toFixed(2)}</div>
        </div>
        <div className="p-2 bg-[var(--color-bg)] rounded">
          <div className="text-xs text-[var(--color-text-muted)]">Insights</div>
          <div className="font-bold text-[var(--color-accent)]">{cycle.insightsCount}</div>
        </div>
        <div className="p-2 bg-[var(--color-bg)] rounded">
          <div className="text-xs text-[var(--color-text-muted)]">Updates</div>
          <div className="font-bold text-[var(--color-accent)]">{cycle.beliefUpdatesCount}</div>
        </div>
      </div>

      {/* Regime Change */}
      {cycle.newRegime && (
        <div className="mt-3 flex items-center gap-2 text-xs">
          <span className="text-[var(--color-text-muted)]">New Regime:</span>
          <span className="px-2 py-0.5 bg-[var(--color-accent)] text-[var(--color-accent)] rounded-full capitalize">
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
      <div className="bg-[var(--color-bg)] rounded-xl border border-[var(--color-border)] p-6 animate-pulse">
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
      <div className="bg-[var(--color-bg)] rounded-xl border border-[rgba(239, 68, 68,0.2)] p-6">
        <div className="text-[var(--color-negative)] text-sm">Failed to load cycle history</div>
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
    <div className="bg-[var(--color-bg)] rounded-xl border border-[var(--color-border)] p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-[var(--color-text)] flex items-center gap-2">
          <History className="w-5 h-5 text-[var(--color-accent)]" />
          CVRF Cycles
        </h3>
        <span className="text-xs text-[var(--color-text-muted)]">{cycles.length} cycles</span>
      </div>

      {/* Summary Stats */}
      {cycles.length > 0 && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="p-3 rounded-lg" style={{ background: 'linear-gradient(to right, rgba(123, 44, 255, 0.08), rgba(123, 44, 255, 0.04))' }}>
            <div className="flex items-center gap-1.5 text-[var(--color-accent)] mb-1">
              <Lightbulb className="w-4 h-4" />
              <span className="text-xs">Total Insights</span>
            </div>
            <div className="text-2xl font-bold text-[var(--color-accent)]">{totalInsights}</div>
          </div>
          <div className="p-3 rounded-lg" style={{ background: 'linear-gradient(to right, rgba(16, 185, 129, 0.08), rgba(16, 185, 129, 0.04))' }}>
            <div className="flex items-center gap-1.5 text-[var(--color-positive)] mb-1">
              <TrendingUp className="w-4 h-4" />
              <span className="text-xs">Avg Improvement</span>
            </div>
            <div className={`text-2xl font-bold ${avgDelta >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}>
              {avgDelta >= 0 ? '+' : ''}
              {(avgDelta * 100).toFixed(2)}%
            </div>
          </div>
        </div>
      )}

      {/* Cycle List */}
      {cycles.length === 0 ? (
        <div className="text-center py-8">
          <History className="w-12 h-12 text-[var(--color-text-muted)] mx-auto mb-3" />
          <div className="text-[var(--color-text-muted)] text-sm">No CVRF cycles yet</div>
          <div className="text-[var(--color-text-muted)] text-xs mt-1">
            Close an episode with CVRF enabled to see cycles
          </div>
        </div>
      ) : (
        <div className="space-y-3 max-h-[500px] overflow-y-auto">
          {cycles.map((cycle, idx) => (
            <CycleCard key={idx} cycle={cycle} index={cycles.length - 1 - idx} />
          ))}
        </div>
      )}
    </div>
  );
}
