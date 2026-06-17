/**
 * BacktestEmptyState — the pre-run surface for the Backtest page.
 *
 * The old empty state was a single icon + line of copy: a dead end that gave
 * no sense of the payoff. This previews the actual result surfaces — the six
 * walk-forward metric tiles and the equity curve — as ghosted placeholders, so
 * a first-time user can see what a run produces before committing to one. The
 * footer points back up to the run controls.
 *
 * Pure presentational, on-brand (glass-slab, mono kicker, sovereign accent).
 * ROADMAP "Next session candidates" #3 (Backtest UI polish).
 */

import { BarChart3, TrendingUp, Activity, Target, AlertTriangle, Clock, ArrowUp } from 'lucide-react';

/** Mirrors the real result tiles in Backtest.tsx so the preview matches output. */
const PREVIEW_METRICS: { label: string; icon: typeof TrendingUp }[] = [
  { label: 'Total Return', icon: TrendingUp },
  { label: 'Annualized', icon: Activity },
  { label: 'Sharpe Ratio', icon: Target },
  { label: 'Max Drawdown', icon: AlertTriangle },
  { label: 'Alpha', icon: TrendingUp },
  { label: 'Duration', icon: Clock },
];

// A gentle upward equity-curve silhouette (viewBox 0 0 100 32), drawn as a
// path so the preview reads as "this is where your equity curve lands".
const EQUITY_SILHOUETTE = 'M0,28 L12,26 L24,27 L36,22 L48,23 L60,16 L72,18 L84,9 L100,4';

export function BacktestEmptyState() {
  return (
    <div className="glass-slab rounded-2xl p-6 sm:p-8 animate-fade-in-up" data-testid="backtest-empty">
      <header className="flex items-start gap-4">
        <div
          className="p-2.5 rounded-lg shrink-0"
          style={{ backgroundColor: 'color-mix(in srgb, var(--color-accent) 10%, transparent)' }}
        >
          <BarChart3 className="w-5 h-5" style={{ color: 'var(--color-accent)' }} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="mono text-[10px] sm:text-xs tracking-[0.3em] uppercase text-theme-muted">
            Backtest · Ready to run
          </p>
          <h3 className="text-lg font-bold text-theme mt-1">Run your first walk-forward backtest</h3>
          <p className="text-sm text-theme-secondary mt-1.5 max-w-xl leading-relaxed">
            Walk-forward backtesting validates your CVRF strategy on out-of-sample
            windows — no look-ahead bias. Here&apos;s what a run gives you back:
          </p>
        </div>
      </header>

      {/* Ghosted metric tiles — same labels as the real results row. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-6" aria-hidden="true">
        {PREVIEW_METRICS.map(({ label, icon: Icon }) => (
          <div
            key={label}
            className="rounded-xl border border-[var(--color-border-light)] bg-[var(--color-bg-tertiary)] p-3.5"
          >
            <div className="flex items-center gap-1.5 text-theme-muted">
              <Icon className="w-3.5 h-3.5" />
              <span className="text-[10px] uppercase tracking-wider truncate">{label}</span>
            </div>
            <div className="mt-2 h-5 w-12 rounded bg-[var(--color-border)] opacity-50 animate-pulse-subtle" />
          </div>
        ))}
      </div>

      {/* Ghosted equity curve. */}
      <div className="mt-4 rounded-xl border border-[var(--color-border-light)] bg-[var(--color-bg-tertiary)] p-4">
        <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted mb-2">Equity Curve</p>
        <svg
          viewBox="0 0 100 32"
          preserveAspectRatio="none"
          className="w-full h-20"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="bt-empty-stroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.5" />
              <stop offset="100%" stopColor="var(--color-positive)" stopOpacity="0.5" />
            </linearGradient>
          </defs>
          <path
            d={EQUITY_SILHOUETTE}
            fill="none"
            stroke="url(#bt-empty-stroke)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="2 2"
          />
        </svg>
      </div>

      <p className="flex items-center gap-2 mt-5 text-sm text-theme-secondary">
        <ArrowUp className="w-4 h-4 text-[var(--color-accent)] shrink-0" aria-hidden="true" />
        Set your symbols, date range, and strategy above, then{' '}
        <span className="font-semibold text-theme">Run Backtest</span>.
      </p>
    </div>
  );
}

export default BacktestEmptyState;
