/**
 * CVRF Stats Card Component
 *
 * Displays CVRF system statistics in a compact card format
 */

import { Activity, Brain, TrendingUp, Target } from 'lucide-react';
import { useCVRFStats, useRegimeDisplay } from '@/hooks/useCVRF';

export function CVRFStatsCard() {
  const { data: stats, isLoading, isError } = useCVRFStats();
  const regime = useRegimeDisplay(stats?.beliefs.regime, parseFloat(stats?.beliefs.regimeConfidence || '0') / 100);

  if (isLoading) {
    return (
      <div className="bg-[var(--color-bg)] rounded-xl border border-[var(--color-border)] p-6 animate-pulse">
        <div className="h-6 bg-[var(--color-border)] rounded w-1/3 mb-4" />
        <div className="space-y-3">
          <div className="h-4 bg-[var(--color-border)] rounded w-full" />
          <div className="h-4 bg-[var(--color-border)] rounded w-2/3" />
          <div className="h-4 bg-[var(--color-border)] rounded w-3/4" />
        </div>
      </div>
    );
  }

  if (isError || !stats) {
    return (
      <div className="bg-[var(--color-bg)] rounded-xl border border-[rgba(239, 68, 68,0.2)] p-6">
        <div className="text-[var(--color-negative)] text-sm">Failed to load CVRF stats</div>
      </div>
    );
  }

  return (
    <div className="bg-[var(--color-bg)] rounded-xl border border-[var(--color-border)] p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-[var(--color-text)] flex items-center gap-2">
          <Brain className="w-5 h-5 text-[var(--color-accent)]" />
          CVRF Intelligence
        </h3>
        <span className="text-xs text-[var(--color-text-muted)]">v{stats.beliefs.version}</span>
      </div>

      {/* Regime Badge */}
      <div className="mb-4 p-3 bg-[var(--color-bg-tertiary)] rounded-lg">
        <div className="flex items-center justify-between">
          <span className="text-sm text-[var(--color-text-secondary)]">Current Regime</span>
          <div className="flex items-center gap-2">
            <span className="text-lg">{regime.icon}</span>
            <span className={`font-semibold ${regime.color}`}>{regime.label}</span>
            <span className="text-xs text-[var(--color-text-muted)]">({regime.confidence})</span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4">
        {/* Episodes */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-[var(--color-text-muted)]">
            <Activity className="w-4 h-4" />
            <span className="text-xs">Episodes</span>
          </div>
          <div className="text-2xl font-bold text-[var(--color-text)]">{stats.episodes.total}</div>
          <div className="text-xs text-[var(--color-text-muted)]">{stats.episodes.totalDecisions} decisions</div>
        </div>

        {/* CVRF Cycles */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-[var(--color-text-muted)]">
            <Brain className="w-4 h-4" />
            <span className="text-xs">CVRF Cycles</span>
          </div>
          <div className="text-2xl font-bold text-[var(--color-text)]">{stats.cvrf.totalCycles}</div>
          <div className="text-xs text-[var(--color-text-muted)]">{stats.cvrf.totalInsights} insights</div>
        </div>

        {/* Avg Return */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-[var(--color-text-muted)]">
            <TrendingUp className="w-4 h-4" />
            <span className="text-xs">Avg Return</span>
          </div>
          <div className="text-2xl font-bold text-[var(--color-positive)]">{stats.episodes.avgReturn}</div>
          <div className="text-xs text-[var(--color-text-muted)]">Sharpe: {stats.episodes.avgSharpe}</div>
        </div>

        {/* Learning Rate */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-[var(--color-text-muted)]">
            <Target className="w-4 h-4" />
            <span className="text-xs">Learning Rate</span>
          </div>
          <div className="text-2xl font-bold text-[var(--color-accent)]">{stats.cvrf.avgLearningRate}</div>
          <div className="text-xs text-[var(--color-text-muted)]">τ: {stats.cvrf.avgDecisionOverlap}</div>
        </div>
      </div>

      {/* Factor Weights */}
      <div className="mt-4 pt-4 border-t border-[var(--color-border-light)]">
        <div className="text-xs text-[var(--color-text-muted)] mb-2">Factor Weights</div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(stats.factors.weights).map(([factor, weight]) => (
            <span
              key={factor}
              className="px-2 py-1 bg-[rgba(99, 102, 241,0.1)] text-[var(--color-accent)] text-xs rounded-full"
            >
              {factor}: {weight}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
