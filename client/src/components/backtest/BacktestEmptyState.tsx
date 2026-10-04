import { BarChart3, ArrowUp } from 'lucide-react';

const PREVIEW_METRICS = ['Total Return', 'Annualized', 'Sharpe Ratio', 'Max Drawdown', 'Alpha', 'Duration'];

export function BacktestEmptyState({ onConfigure }: { onConfigure?: () => void }) {
  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 sm:p-5" data-testid="backtest-empty">
      <div className="flex items-start gap-3">
        <BarChart3 size={20} className="mt-0.5 shrink-0 text-[var(--color-accent-text)]" aria-hidden="true" />
        <div>
          <h3 className="text-sm font-semibold text-theme">Run your first walk-forward backtest</h3>
          <p className="mt-1 text-sm text-theme-secondary">Choose a universe, period, and strategy to review historical results across out-of-sample windows.</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-y border-[var(--color-border-light)] py-3 text-xs text-theme-muted" aria-label="Available result metrics">
        {PREVIEW_METRICS.map(label => <span key={label}>{label}</span>)}
        <span>Equity Curve</span>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-theme-secondary">Set your inputs, then select <span className="font-medium text-theme">Run Backtest</span>.</p>
        {onConfigure && <button type="button" onClick={onConfigure} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-[var(--color-accent-text)] hover:bg-[var(--color-bg-tertiary)]"><ArrowUp size={14} aria-hidden="true" /> Configure backtest</button>}
      </div>
    </section>
  );
}

export default BacktestEmptyState;
