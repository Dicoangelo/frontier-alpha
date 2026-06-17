/**
 * BacktestRunningSkeleton — the in-flight surface while a walk-forward run
 * folds its windows.
 *
 * Before this, the page body went blank during `isPending` (only the Run
 * button spinner moved). This mirrors the result layout — six metric tiles +
 * the equity-curve panel — as active shimmer placeholders so the run feels
 * like it's producing the very surfaces about to appear, not hanging.
 *
 * Pairs with BacktestEmptyState; ROADMAP "Next session candidates" #3.
 */

import { TrendingUp, Activity, Target, AlertTriangle, Clock } from 'lucide-react';

const METRIC_LABELS: { label: string; icon: typeof TrendingUp }[] = [
  { label: 'Total Return', icon: TrendingUp },
  { label: 'Annualized', icon: Activity },
  { label: 'Sharpe Ratio', icon: Target },
  { label: 'Max Drawdown', icon: AlertTriangle },
  { label: 'Alpha', icon: TrendingUp },
  { label: 'Duration', icon: Clock },
];

export function BacktestRunningSkeleton() {
  return (
    <div
      className="space-y-4"
      data-testid="backtest-running"
      role="status"
      aria-live="polite"
      aria-label="Running backtest"
    >
      <p className="mono text-[10px] sm:text-xs tracking-[0.3em] uppercase text-theme-muted animate-pulse-subtle">
        Results · folding walk-forward windows…
      </p>

      {/* Metric tile skeletons — same grid + labels as the real results row. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4" aria-hidden="true">
        {METRIC_LABELS.map(({ label, icon: Icon }) => (
          <div
            key={label}
            className="rounded-xl border border-[var(--color-border-light)] bg-[var(--color-bg-tertiary)] p-3.5"
          >
            <div className="flex items-center gap-1.5 text-theme-muted">
              <Icon className="w-3.5 h-3.5" />
              <span className="text-[10px] uppercase tracking-wider truncate">{label}</span>
            </div>
            <div className="mt-2 h-5 w-14 rounded bg-[var(--color-border)] animate-pulse-subtle" />
          </div>
        ))}
      </div>

      {/* Equity-curve panel skeleton. */}
      <div className="glass-slab rounded-2xl p-6 sm:p-8" aria-hidden="true">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-[var(--color-bg-tertiary)] animate-pulse-subtle" />
          <div className="space-y-2">
            <div className="h-2.5 w-20 rounded bg-[var(--color-border)] animate-pulse-subtle" />
            <div className="h-4 w-32 rounded bg-[var(--color-bg-tertiary)] animate-pulse-subtle" />
          </div>
        </div>
        <div className="h-80 min-h-[320px] rounded-xl bg-[var(--color-bg-tertiary)] animate-pulse-subtle" />
      </div>
    </div>
  );
}

export default BacktestRunningSkeleton;
