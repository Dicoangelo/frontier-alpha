/**
 * Backtest Page
 *
 * Walk-forward backtesting interface with equity curve visualization,
 * episode performance breakdown, and factor attribution.
 *
 * Layout-wrapped (see App.tsx) — page chrome
 * is provided by the parent Layout. This page contributes the section
 * shell, hero, run controls, and result surfaces.
 */

import { useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Area,
  ReferenceLine,
} from 'recharts';
import {
  Play,
  TrendingUp,
  Clock,
  Settings2,
  Activity,
  Target,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { api, getErrorMessage } from '@/api/client';
import { Button } from '@/components/shared/Button';
import { useToast } from '@/hooks/useToast';
import { rechartsTooltipStyle } from '@/lib/theme';
import { BacktestEmptyState } from '@/components/backtest/BacktestEmptyState';
import { BacktestRunningSkeleton } from '@/components/backtest/BacktestRunningSkeleton';
import { SectionErrorBoundary } from '@/components/shared/ErrorBoundary';

// Backtest API contract — page-local because no second consumer in the
// client today. Promote to client/src/types/index.ts when a second page
// (e.g., a saved-backtest list) needs the same shape. If the server-side
// contract changes, update this AND src/routes/backtest.ts in lockstep.
interface BacktestRunConfig {
  symbols: string[];
  startDate: string;
  endDate: string;
  initialCapital: number;
  episodeLengthDays: number;
  // Backend (src/routes/backtest.ts + BacktestRunner) accepts only these
  // three. Optimize supports a fourth ('target_volatility') because its
  // walk-forward engine doesn't yet implement the constraint. Keep these
  // in lockstep with src/routes/backtest.ts.
  strategy: 'max_sharpe' | 'min_volatility' | 'risk_parity';
  useCVRF: boolean;
  rebalanceFrequency: 'daily' | 'weekly' | 'monthly';
}

interface BacktestResult {
  id: string;
  config: BacktestRunConfig;
  walkForward: {
    windows: number;
    totalReturn: number;
    annualizedReturn: number;
    sharpe: number;
    maxDrawdown: number;
    overfitRatio: number;
  };
  equityCurve: Array<{ date: string; value: number }>;
  episodeReturns: Array<{ episode: number; return: number; sharpe: number }>;
  factorExposures: Array<{ factor: string; avgExposure: number; contribution: number }>;
  benchmark: {
    totalReturn: number;
    sharpe: number;
    maxDrawdown: number;
  };
  alpha: number;
  duration: number;
  completedAt: string;
}

const DEFAULT_SYMBOLS = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'JPM'];

const DEFAULT_CONFIG: BacktestRunConfig = {
  symbols: DEFAULT_SYMBOLS,
  startDate: '2023-01-01',
  endDate: '2026-01-01',
  initialCapital: 100000,
  episodeLengthDays: 21,
  strategy: 'max_sharpe',
  useCVRF: true,
  rebalanceFrequency: 'monthly',
};
const inputClass = 'block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2.5 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30';
const labelClass = 'mb-1.5 block text-xs font-medium text-theme-secondary';
const kickerClass = 'mb-1 text-xs font-medium text-theme-muted';

function useRunBacktest() {
  const { toastSuccess, toastError } = useToast();
  return useMutation({
    mutationFn: async (config: BacktestRunConfig) => {
      const response = await api.post('/backtest/run', config);
      return (response as { data: BacktestResult }).data;
    },
    onSuccess: (data) => {
      const returnPct = (data.walkForward.totalReturn * 100).toFixed(1);
      toastSuccess('Backtest complete', { message: `${returnPct}% total return across ${data.walkForward.windows} windows` });
    },
    onError: (error) => {
      toastError('Backtest failed', { message: getErrorMessage(error) });
    },
  });
}

interface MetricCardProps {
  label: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  color?: string;
}

function MetricCard({ label, value, subtitle, icon, color = 'text-[var(--color-text)]' }: MetricCardProps) {
  return (
    <div className="border border-[var(--color-border)] bg-[var(--color-bg-secondary)] rounded-xl p-4 flex items-center gap-3">
      <div
        className="p-2.5 rounded-lg flex-shrink-0"
        style={{ backgroundColor: 'color-mix(in srgb, var(--color-accent) 8%, transparent)' }}
      >
        <span className="text-[var(--color-accent-text)]">{icon}</span>
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-theme-muted">{label}</p>
        <p className={`text-xl font-bold mt-0.5 tabular-nums ${color}`}>{value}</p>
        {subtitle && <p className="text-xs text-theme-muted mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

export function Backtest() {
  const [config, setConfig] = useState<BacktestRunConfig>(DEFAULT_CONFIG);
  const [symbolInput, setSymbolInput] = useState(DEFAULT_SYMBOLS.join(', '));
  const [showConfig, setShowConfig] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);
  const { mutate: runBacktest, data: result, isPending, error, reset } = useRunBacktest();
  const handleReset = () => {
    setConfig(DEFAULT_CONFIG);
    setSymbolInput(DEFAULT_SYMBOLS.join(', '));
    setValidationError(null);
    setShowConfig(true);
    reset();
  };
  const handleRun = () => {
    const symbols = [...new Set(symbolInput.split(/[,\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean))];
    if (symbols.length === 0) { setValidationError('Enter at least one ticker symbol.'); return; }
    if (symbols.some(symbol => !/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol))) { setValidationError('Enter valid ticker symbols separated by commas or spaces.'); return; }
    const start = Date.parse(config.startDate);
    const end = Date.parse(config.endDate);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) { setValidationError('Choose an end date after the start date.'); return; }
    if (!Number.isFinite(config.initialCapital) || config.initialCapital <= 0) { setValidationError('Initial capital must be greater than zero.'); return; }
    if (!Number.isInteger(config.episodeLengthDays) || config.episodeLengthDays < 1) { setValidationError('Episode length must be a positive whole number of days.'); return; }
    const finalConfig = { ...config, symbols };
    setValidationError(null);
    setConfig(finalConfig);
    setShowConfig(false);
    runBacktest(finalConfig, { onError: () => setShowConfig(true) });
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div
        className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4"
        style={{ animationDelay: '0ms', animationFillMode: 'both' }}
      >
        <div>
          <p className={kickerClass}>Research / Historical analysis</p>
          <h1 className="text-2xl font-semibold tracking-tight text-theme">Strategy backtest</h1>
          <p className="mt-1 text-sm text-theme-secondary">Review walk-forward returns, risk, and factor attribution over a historical period.</p>
        </div>

        <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={isPending} onClick={handleReset} leftIcon={<RotateCcw size={15} />}>Reset inputs</Button>
        <button
          onClick={() => setShowConfig(!showConfig)}
          aria-expanded={showConfig}
          aria-controls="backtest-settings"
          aria-label={showConfig ? 'Hide configuration panel' : 'Show configuration panel'}
          className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-theme-secondary hover:text-theme text-xs font-medium transition-colors duration-200"
        >
          <Settings2 className="w-4 h-4" aria-hidden="true" />
          {showConfig ? 'Hide settings' : 'Edit settings'}
        </button>
        </div>
      </div>

      {/* ── Configuration Panel ─────────────────────────────────────────── */}
      {showConfig && (
        <section
          id="backtest-settings"
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 sm:p-5"
        >
          <header className="flex items-start gap-4 mb-4">
            <div
              className="p-2.5 rounded-lg shrink-0"
              style={{ backgroundColor: 'color-mix(in srgb, var(--color-accent) 10%, transparent)' }}
            >
              <Settings2 className="w-5 h-5" style={{ color: 'var(--color-accent)' }} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className={kickerClass}>Inputs</p>
              <h2 className="text-lg font-bold text-theme mt-1">Backtest settings</h2>
              <p className="text-sm text-theme-secondary mt-1">
                Historical price data · Execution assumptions: 5 bps commission, 2 bps slippage
              </p>
            </div>
          </header>

          <fieldset disabled={isPending} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Symbols */}
            <div className="lg:col-span-3">
              <label htmlFor="bt-symbols" className={labelClass}>
                Symbols (comma-separated)
              </label>
              <input
                id="bt-symbols"
                type="text"
                value={symbolInput}
                onChange={(e) => setSymbolInput(e.target.value)}
                className={inputClass}
                placeholder="AAPL, MSFT, NVDA..."
              />
            </div>

            {/* Start Date */}
            <div>
              <label htmlFor="bt-start" className={labelClass}>
                Start Date
              </label>
              <input
                id="bt-start"
                type="date"
                value={config.startDate}
                onChange={(e) => setConfig({ ...config, startDate: e.target.value })}
                className={inputClass}
              />
            </div>

            {/* End Date */}
            <div>
              <label htmlFor="bt-end" className={labelClass}>
                End Date
              </label>
              <input
                id="bt-end"
                type="date"
                value={config.endDate}
                onChange={(e) => setConfig({ ...config, endDate: e.target.value })}
                className={inputClass}
              />
            </div>

            {/* Initial Capital */}
            <div>
              <label htmlFor="bt-capital" className={labelClass}>
                Initial Capital ($)
              </label>
              <input
                id="bt-capital"
                type="number"
                min="1"
                value={config.initialCapital}
                onChange={(e) => setConfig({ ...config, initialCapital: Number(e.target.value) })}
                className={`${inputClass} tabular-nums`}
              />
            </div>

            {/* Strategy */}
            <div>
              <label htmlFor="bt-strategy" className={labelClass}>
                Strategy
              </label>
              <select
                id="bt-strategy"
                value={config.strategy}
                onChange={(e) =>
                  setConfig({ ...config, strategy: e.target.value as BacktestRunConfig['strategy'] })
                }
                className={inputClass}
              >
                <option value="max_sharpe">Max Sharpe</option>
                <option value="min_volatility">Min Volatility</option>
                <option value="risk_parity">Risk Parity</option>
              </select>
            </div>

            {/* Rebalance Frequency */}
            <div>
              <label htmlFor="bt-rebalance" className={labelClass}>
                Rebalance
              </label>
              <select
                id="bt-rebalance"
                value={config.rebalanceFrequency}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    rebalanceFrequency: e.target.value as BacktestRunConfig['rebalanceFrequency'],
                  })
                }
                className={inputClass}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>

            {/* Episode Length */}
            <div>
              <label htmlFor="bt-episode" className={labelClass}>
                Episode Length (days)
              </label>
              <input
                id="bt-episode"
                type="number"
                min="1"
                step="1"
                value={config.episodeLengthDays}
                onChange={(e) => setConfig({ ...config, episodeLengthDays: Number(e.target.value) })}
                className={`${inputClass} tabular-nums`}
              />
            </div>
          </fieldset>

          {validationError && <p role="alert" className="mt-4 text-sm text-[var(--color-negative)]">{validationError}</p>}

          {/* Run Button */}
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-4">
            <button
              onClick={handleRun}
              disabled={isPending}
              aria-label="Run backtest"
              type="button"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 min-h-[44px] rounded-md bg-[var(--color-accent)] text-white text-sm font-medium  hover:brightness-110 disabled:opacity-50 transition-[filter,box-shadow] duration-200"
            >
              {isPending ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />
                  Running…
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" aria-hidden="true" />
                  Run Backtest
                </>
              )}
            </button>
            {isPending && (
              <span className="text-xs font-medium text-theme-muted">
                Calculating walk-forward windows…
              </span>
            )}
          </div>
        </section>
      )}

      {/* ── Error Banner ────────────────────────────────────────────────── */}
      {error && (
        <div
          className="border border-[var(--color-border)] bg-[var(--color-bg-secondary)] relative overflow-hidden rounded-xl pl-5 pr-4 py-4 before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-[var(--color-negative)] "
          role="alert"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-[var(--color-negative)]" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-theme">Backtest failed</p>
              <p className="text-sm mt-1 text-theme-secondary leading-relaxed">{getErrorMessage(error)}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Results ─────────────────────────────────────────────────────── */}
      {/* Wrapped in SectionErrorBoundary so a bad data shape in the
          equity/episode charts or factor attribution can't white-screen
          the page — the run controls above stay usable. Mirrors the
          Optimize page pattern from v1.3.9. */}
      {result && (
        <SectionErrorBoundary sectionName="Backtest Results">
          {/* Metrics Row */}
          <section
            className=""
            style={{ animationDelay: '100ms', animationFillMode: 'both' }}
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className={kickerClass}>Historical results · Walk-forward</p><p className="text-xs text-theme-muted">{result.config.startDate} – {result.config.endDate} · {result.config.symbols.join(', ')}</p></div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              <MetricCard
                label="Total Return"
                value={`${(result.walkForward.totalReturn * 100).toFixed(2)}%`}
                icon={<TrendingUp className="w-4 h-4" />}
                color={result.walkForward.totalReturn >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}
              />
              <MetricCard
                label="Annualized"
                value={`${(result.walkForward.annualizedReturn * 100).toFixed(2)}%`}
                icon={<Activity className="w-4 h-4" />}
                color={result.walkForward.annualizedReturn >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}
              />
              <MetricCard
                label="Sharpe Ratio"
                value={result.walkForward.sharpe.toFixed(2)}
                icon={<Target className="w-4 h-4" />}
                color="text-[var(--color-accent-text)]"
              />
              <MetricCard
                label="Max Drawdown"
                value={`${(result.walkForward.maxDrawdown * 100).toFixed(2)}%`}
                icon={<AlertTriangle className="w-4 h-4" />}
                color="text-[var(--color-negative)]"
              />
              <MetricCard
                label="Alpha"
                value={`${(result.alpha * 100).toFixed(2)}%`}
                subtitle="vs estimated benchmark"
                icon={<TrendingUp className="w-4 h-4" />}
                color={result.alpha >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}
              />
              <MetricCard
                label="Duration"
                value={`${(result.duration / 1000).toFixed(1)}s`}
                subtitle={`${result.walkForward.windows} windows`}
                icon={<Clock className="w-4 h-4" />}
              />
            </div>
          </section>

          {/* Equity Curve */}
          {result.equityCurve.length > 0 && (
            <section
              className="border border-[var(--color-border)] bg-[var(--color-bg-secondary)] rounded-lg p-4 sm:p-5"
              style={{ animationDelay: '150ms', animationFillMode: 'both' }}
            >
              <header className="flex items-start gap-4 mb-4">
                <div
                  className="p-2.5 rounded-lg shrink-0"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--color-accent) 10%, transparent)' }}
                >
                  <TrendingUp className="w-5 h-5" style={{ color: 'var(--color-accent)' }} aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className={kickerClass}>Time Series</p>
                  <h3 className="text-lg font-bold text-theme mt-1">Equity Curve</h3>
                </div>
              </header>
              <div className="h-80 min-h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={result.equityCurve} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light, var(--color-border))" />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: 'var(--color-text-muted, var(--color-text-muted))', fontSize: 12 }}
                      tickFormatter={(d) => new Date(d).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
                    />
                    <YAxis
                      tick={{ fill: 'var(--color-text-muted, var(--color-text-muted))', fontSize: 12 }}
                      tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      contentStyle={rechartsTooltipStyle}
                      formatter={(value: number | undefined) => [`$${(value ?? 0).toLocaleString()}`, 'Portfolio Value']}
                      labelFormatter={(label) => new Date(label).toLocaleDateString()}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="var(--color-accent)"
                      fill="var(--color-accent)"
                      fillOpacity={0.1}
                      strokeWidth={2}
                    />
                    <ReferenceLine
                      y={result.config.initialCapital}
                      stroke="var(--color-text-muted)"
                      strokeDasharray="3 3"
                      label={{
                        value: `Initial $${(result.config.initialCapital / 1000).toFixed(0)}k`,
                        // 'left' put the label exactly on top of the Y-axis tick
                        // (which formats the same value as `$100k`), making them
                        // collide. 'insideTopRight' parks the label inside the
                        // plot area, well away from any axis tick.
                        position: 'insideTopRight',
                        fill: 'var(--color-text-muted)',
                        fontSize: 12,
                      }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}

          {/* Episode Returns + Factor Attribution */}
          <div
            className="grid grid-cols-12 gap-4"
            style={{ animationDelay: '200ms', animationFillMode: 'both' }}
          >
            {/* Episode Returns */}
            <section className="col-span-12 lg:col-span-7 border border-[var(--color-border)] bg-[var(--color-bg-secondary)] rounded-lg p-4 sm:p-5">
              <header className="mb-5">
                <p className={kickerClass}>Out-Of-Sample</p>
                <h3 className="text-lg font-bold text-theme">Episode Returns</h3>
              </header>
              <div className="h-64 min-h-[256px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={result.episodeReturns} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light, var(--color-border))" />
                    <XAxis
                      dataKey="episode"
                      tick={{ fill: 'var(--color-text-muted, var(--color-text-muted))', fontSize: 12 }}
                      label={{ value: 'Episode', position: 'bottom', offset: -5 }}
                    />
                    <YAxis
                      tick={{ fill: 'var(--color-text-muted, var(--color-text-muted))', fontSize: 12 }}
                      tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                    />
                    <Tooltip
                      formatter={(value: number | undefined, name?: string) => [
                        name === 'return' ? `${((value ?? 0) * 100).toFixed(2)}%` : (value ?? 0).toFixed(2),
                        name === 'return' ? 'OOS Return' : 'Sharpe',
                      ]}
                    />
                    <ReferenceLine y={0} stroke="var(--color-text-muted)" strokeDasharray="2 2" />
                    <Bar dataKey="return" fill="var(--color-accent)" opacity={0.6} radius={[4, 4, 0, 0]} />
                    <Line type="monotone" dataKey="sharpe" stroke="var(--color-warning)" strokeWidth={2} dot={false} yAxisId="right" />
                    <YAxis yAxisId="right" orientation="right" tick={{ fill: 'var(--color-warning)', fontSize: 12 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* Factor Attribution */}
            <section className="col-span-12 lg:col-span-5 border border-[var(--color-border)] bg-[var(--color-bg-secondary)] rounded-lg p-4 sm:p-5">
              <header className="mb-5">
                <p className={kickerClass}>Decomposition</p>
                <h3 className="text-lg font-bold text-theme">Factor Attribution</h3>
              </header>
              <div className="space-y-3">
                {result.factorExposures.map((factor) => (
                  <div
                    key={factor.factor}
                    className="flex items-center justify-between hover:bg-theme-secondary rounded-lg px-2 -mx-2 transition-colors duration-150"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2 h-8 rounded-full"
                        style={{
                          backgroundColor: factor.contribution >= 0
                            ? 'var(--color-positive)'
                            : 'var(--color-negative)',
                        }}
                        aria-hidden="true"
                      />
                      <div>
                        <div className="text-sm font-medium text-theme capitalize">
                          {factor.factor.replace(/_/g, ' ')}
                        </div>
                        <div className="text-xs text-theme-muted tabular-nums">
                          Avg exposure: {(factor.avgExposure * 100).toFixed(1)}%
                        </div>
                      </div>
                    </div>
                    <div
                      className={`mono text-sm font-bold tabular-nums ${
                        factor.contribution >= 0
                          ? 'text-[var(--color-positive)]'
                          : 'text-[var(--color-negative)]'
                      }`}
                    >
                      {factor.contribution >= 0 ? '+' : ''}
                      {(factor.contribution * 100).toFixed(2)}%
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Overfit Analysis */}
          <section
            className="border border-[var(--color-border)] bg-[var(--color-bg-secondary)] rounded-lg p-4 sm:p-5"
            style={{ animationDelay: '250ms', animationFillMode: 'both' }}
          >
            <header className="mb-5">
              <p className={kickerClass}>Robustness</p>
              <h3 className="text-lg font-bold text-theme">Overfit analysis</h3><p className="mt-1 text-xs text-theme-muted">The benchmark is an approximation returned by the backtest engine, not a tracked index.</p>
            </header>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-theme-tertiary border border-theme-light text-center">
                <div className="text-xs font-medium text-theme-muted">Overfit Ratio</div>
                <div
                  className={`text-2xl font-bold tabular-nums mt-1 ${
                    result.walkForward.overfitRatio < 1.5
                      ? 'text-[var(--color-positive)]'
                      : 'text-[var(--color-negative)]'
                  }`}
                >
                  {result.walkForward.overfitRatio.toFixed(2)}x
                </div>
                <div className="text-xs text-theme-muted mt-1">
                  {result.walkForward.overfitRatio < 1.5 ? 'Healthy' : 'High overfit risk'}
                </div>
              </div>
              <div className="p-4 rounded-lg bg-theme-tertiary border border-theme-light text-center">
                <div className="text-xs font-medium text-theme-muted">Estimated benchmark return</div>
                <div className="text-2xl font-bold text-theme tabular-nums mt-1">
                  {(result.benchmark.totalReturn * 100).toFixed(2)}%
                </div>
              </div>
              <div className="p-4 rounded-lg bg-theme-tertiary border border-theme-light text-center">
                <div className="text-xs font-medium text-theme-muted">Alpha vs estimated benchmark</div>
                <div
                  className={`text-2xl font-bold tabular-nums mt-1 ${
                    result.alpha >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'
                  }`}
                >
                  {result.alpha >= 0 ? '+' : ''}
                  {(result.alpha * 100).toFixed(2)}%
                </div>
              </div>
            </div>
          </section>
        </SectionErrorBoundary>
      )}

      {/* ── Running Skeleton ────────────────────────────────────────────── */}
      {isPending && <BacktestRunningSkeleton />}

      {/* ── Empty State ─────────────────────────────────────────────────── */}
      {!result && !isPending && !error && <BacktestEmptyState onConfigure={() => setShowConfig(true)} />}
    </div>
  );
}

export default Backtest;
