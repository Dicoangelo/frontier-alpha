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
      <div className="glass-slab rounded-2xl p-6 sm:p-8 animate-shimmer">
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
      <div
        className="glass-slab-floating relative overflow-hidden rounded-2xl p-6 sm:p-8 shadow-[0_18px_60px_-20px_rgba(239,68,68,0.45)] before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-[var(--color-negative)]"
        role="alert"
      >
        <p className="mono text-[10px] sm:text-xs tracking-[0.3em] uppercase text-theme-muted mb-2">CVRF Intelligence</p>
        <p className="text-[var(--color-negative)] text-sm">Failed to load CVRF stats</p>
      </div>
    );
  }

  return (
    <div className="glass-slab rounded-2xl p-6 sm:p-8 animate-enter">
      {/* Kicker + version */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="mono text-[10px] sm:text-xs tracking-[0.3em] uppercase text-theme-muted mb-2">
            CVRF Intelligence
          </p>
          <h3 className="text-lg font-semibold text-theme flex items-center gap-2">
            <Brain className="w-5 h-5 text-[var(--color-accent)]" aria-hidden="true" />
            Belief Snapshot
          </h3>
        </div>
        <span className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted tabular-nums">
          v{stats.beliefs.version}
        </span>
      </div>

      {/* Regime Badge */}
      <div className="mb-4 glass-slab-floating rounded-xl p-3">
        <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted mb-2">Current Regime</p>
        <div className="flex items-center gap-2">
          <span className="text-lg" aria-hidden="true">{regime.icon}</span>
          <span className={`font-semibold ${regime.color}`}>{regime.label}</span>
          <span className="mono text-[10px] tracking-[0.2em] uppercase text-theme-muted tabular-nums">
            ({regime.confidence})
          </span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4 animate-stagger">
        {/* Episodes */}
        <div className="space-y-1 animate-enter">
          <div className="flex items-center gap-1.5 text-theme-muted">
            <Activity className="w-4 h-4" aria-hidden="true" />
            <span className="mono text-[10px] tracking-[0.3em] uppercase">Episodes</span>
          </div>
          <p className="text-2xl font-bold text-theme tabular-nums">{stats.episodes.total}</p>
          <p className="text-xs text-theme-muted tabular-nums">{stats.episodes.totalDecisions} decisions</p>
        </div>

        {/* CVRF Cycles */}
        <div className="space-y-1 animate-enter">
          <div className="flex items-center gap-1.5 text-theme-muted">
            <Brain className="w-4 h-4" aria-hidden="true" />
            <span className="mono text-[10px] tracking-[0.3em] uppercase">CVRF Cycles</span>
          </div>
          <p className="text-2xl font-bold text-theme tabular-nums">{stats.cvrf.totalCycles}</p>
          <p className="text-xs text-theme-muted tabular-nums">{stats.cvrf.totalInsights} insights</p>
        </div>

        {/* Avg Return */}
        <div className="space-y-1 animate-enter">
          <div className="flex items-center gap-1.5 text-theme-muted">
            <TrendingUp className="w-4 h-4" aria-hidden="true" />
            <span className="mono text-[10px] tracking-[0.3em] uppercase">Avg Return</span>
          </div>
          <p className="text-2xl font-bold text-[var(--color-positive)] tabular-nums">{stats.episodes.avgReturn}</p>
          <p className="text-xs text-theme-muted tabular-nums">Sharpe: {stats.episodes.avgSharpe}</p>
        </div>

        {/* Learning Rate */}
        <div className="space-y-1 animate-enter">
          <div className="flex items-center gap-1.5 text-theme-muted">
            <Target className="w-4 h-4" aria-hidden="true" />
            <span className="mono text-[10px] tracking-[0.3em] uppercase">Learning Rate</span>
          </div>
          <p className="text-2xl font-bold text-[var(--color-accent)] tabular-nums">{stats.cvrf.avgLearningRate}</p>
          <p className="text-xs text-theme-muted tabular-nums">τ: {stats.cvrf.avgDecisionOverlap}</p>
        </div>
      </div>

      {/* Factor Weights — guard against partial server payloads where
          `stats.factors.weights` may be undefined for fresh accounts. */}
      <div className="mt-4 pt-4 border-t border-[var(--color-border-light)]">
        <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted mb-2">Factor Weights</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(stats.factors?.weights ?? {}).length === 0 ? (
            <span className="text-xs text-theme-muted">
              No factor weights yet — complete a CVRF cycle to populate.
            </span>
          ) : (
            Object.entries(stats.factors?.weights ?? {}).map(([factor, weight]) => (
              <span
                key={factor}
                className="px-2 py-1 bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)] text-[var(--color-accent)] text-xs rounded-full mono tracking-[0.05em] tabular-nums"
              >
                {factor}: {weight}
              </span>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
