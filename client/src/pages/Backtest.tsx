/**
 * Backtest Page
 *
 * Walk-forward backtesting interface with equity curve visualization,
 * episode performance breakdown, and factor attribution.
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
  BarChart3,
  TrendingUp,
  Clock,
  Settings2,
  Activity,
  Target,
  AlertTriangle,
} from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/api/client';
import { toast } from '@/components/shared/Toast';

interface BacktestRunConfig {
  symbols: string[];
  startDate: string;
  endDate: string;
  initialCapital: number;
  episodeLengthDays: number;
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

function useRunBacktest() {
  return useMutation({
    mutationFn: async (config: BacktestRunConfig) => {
      const response = await api.post('/backtest/run', config);
      return (response as { data: BacktestResult }).data;
    },
    onSuccess: (data) => {
      const returnPct = (data.walkForward.totalReturn * 100).toFixed(1);
      toast.success('Backtest complete', `${returnPct}% total return across ${data.walkForward.windows} windows`);
    },
    onError: (error) => {
      toast.error('Backtest failed', (error as Error).message);
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
    <div className="p-4 bg-[var(--color-bg)] rounded-xl border border-[var(--color-border)]">
      <div className="flex items-center gap-2 text-[var(--color-text-muted)] mb-2">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      {subtitle && <div className="text-xs text-[var(--color-text-muted)] mt-1">{subtitle}</div>}
    </div>
  );
}

export function Backtest() {
  const [config, setConfig] = useState<BacktestRunConfig>({
    symbols: DEFAULT_SYMBOLS,
    startDate: '2023-01-01',
    endDate: '2026-01-01',
    initialCapital: 100000,
    episodeLengthDays: 21,
    strategy: 'max_sharpe',
    useCVRF: true,
    rebalanceFrequency: 'monthly',
  });
  const [symbolInput, setSymbolInput] = useState(DEFAULT_SYMBOLS.join(', '));
  const [showConfig, setShowConfig] = useState(true);

  const { mutate: runBacktest, data: result, isPending, error } = useRunBacktest();

  const handleRun = () => {
    const symbols = symbolInput
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    const finalConfig = { ...config, symbols };
    setConfig(finalConfig);
    setShowConfig(false);
    runBacktest(finalConfig);
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg-tertiary)]">
      {/* Header */}
      <div className="bg-[var(--color-bg)] border-b border-[var(--color-border)] px-4 sm:px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center shrink-0">
              <BarChart3 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-[var(--color-text)]">Walk-Forward Backtest</h1>
              <p className="text-sm text-[var(--color-text-muted)]">
                CVRF-integrated historical validation
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="px-4 py-2 min-h-[44px] text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-secondary)] rounded-lg flex items-center gap-2 transition-colors"
          >
            <Settings2 className="w-4 h-4" />
            {showConfig ? 'Hide Config' : 'Show Config'}
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Configuration Panel */}
        {showConfig && (
          <div className="bg-[var(--color-bg)] rounded-xl border border-[var(--color-border)] p-6">
            <h3 className="text-lg font-semibold text-[var(--color-text)] mb-4">
              Backtest Configuration
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Symbols */}
              <div className="lg:col-span-3">
                <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
                  Symbols (comma-separated)
                </label>
                <input
                  type="text"
                  value={symbolInput}
                  onChange={(e) => setSymbolInput(e.target.value)}
                  className="w-full p-2 min-h-[44px] bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text)]"
                  placeholder="AAPL, MSFT, NVDA..."
                />
              </div>

              {/* Start Date */}
              <div>
                <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={config.startDate}
                  onChange={(e) => setConfig({ ...config, startDate: e.target.value })}
                  className="w-full p-2 min-h-[44px] bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text)]"
                />
              </div>

              {/* End Date */}
              <div>
                <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={config.endDate}
                  onChange={(e) => setConfig({ ...config, endDate: e.target.value })}
                  className="w-full p-2 min-h-[44px] bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text)]"
                />
              </div>

              {/* Initial Capital */}
              <div>
                <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
                  Initial Capital ($)
                </label>
                <input
                  type="number"
                  value={config.initialCapital}
                  onChange={(e) => setConfig({ ...config, initialCapital: Number(e.target.value) })}
                  className="w-full p-2 min-h-[44px] bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text)]"
                />
              </div>

              {/* Strategy */}
              <div>
                <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
                  Strategy
                </label>
                <select
                  value={config.strategy}
                  onChange={(e) =>
                    setConfig({ ...config, strategy: e.target.value as BacktestRunConfig['strategy'] })
                  }
                  className="w-full p-2 min-h-[44px] bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text)]"
                >
                  <option value="max_sharpe">Max Sharpe</option>
                  <option value="min_volatility">Min Volatility</option>
                  <option value="risk_parity">Risk Parity</option>
                </select>
              </div>

              {/* Rebalance Frequency */}
              <div>
                <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
                  Rebalance
                </label>
                <select
                  value={config.rebalanceFrequency}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      rebalanceFrequency: e.target.value as BacktestRunConfig['rebalanceFrequency'],
                    })
                  }
                  className="w-full p-2 min-h-[44px] bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text)]"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>

              {/* Episode Length */}
              <div>
                <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
                  Episode Length (days)
                </label>
                <input
                  type="number"
                  value={config.episodeLengthDays}
                  onChange={(e) => setConfig({ ...config, episodeLengthDays: Number(e.target.value) })}
                  className="w-full p-2 min-h-[44px] bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text)]"
                />
              </div>
            </div>

            {/* Run Button */}
            <div className="mt-6 flex items-center gap-4">
              <button
                onClick={handleRun}
                disabled={isPending}
                className="px-6 py-2.5 min-h-[44px] bg-purple-600 hover:bg-purple-700 text-white rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                {isPending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Run Backtest
                  </>
                )}
              </button>
              {isPending && (
                <span className="text-sm text-[var(--color-text-muted)]">
                  This may take a few minutes...
                </span>
              )}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center gap-2 text-red-700">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span className="text-sm">
              Backtest failed: {(error as Error).message}
            </span>
          </div>
        )}

        {/* Results */}
        {result && (
          <>
            {/* Metrics Row */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              <MetricCard
                label="Total Return"
                value={`${(result.walkForward.totalReturn * 100).toFixed(2)}%`}
                icon={<TrendingUp className="w-4 h-4" />}
                color={result.walkForward.totalReturn >= 0 ? 'text-green-600' : 'text-red-600'}
              />
              <MetricCard
                label="Annualized"
                value={`${(result.walkForward.annualizedReturn * 100).toFixed(2)}%`}
                icon={<Activity className="w-4 h-4" />}
                color={result.walkForward.annualizedReturn >= 0 ? 'text-green-600' : 'text-red-600'}
              />
              <MetricCard
                label="Sharpe Ratio"
                value={result.walkForward.sharpe.toFixed(2)}
                icon={<Target className="w-4 h-4" />}
                color="text-indigo-600"
              />
              <MetricCard
                label="Max Drawdown"
                value={`${(result.walkForward.maxDrawdown * 100).toFixed(2)}%`}
                icon={<AlertTriangle className="w-4 h-4" />}
                color="text-red-600"
              />
              <MetricCard
                label="Alpha"
                value={`${(result.alpha * 100).toFixed(2)}%`}
                subtitle="vs benchmark"
                icon={<TrendingUp className="w-4 h-4" />}
                color={result.alpha >= 0 ? 'text-green-600' : 'text-red-600'}
              />
              <MetricCard
                label="Duration"
                value={`${(result.duration / 1000).toFixed(1)}s`}
                subtitle={`${result.walkForward.windows} windows`}
                icon={<Clock className="w-4 h-4" />}
              />
            </div>

            {/* Equity Curve */}
            {result.equityCurve.length > 0 && (
              <div className="bg-[var(--color-bg)] rounded-xl border border-[var(--color-border)] p-6">
                <h3 className="text-lg font-semibold text-[var(--color-text)] mb-4 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-purple-500" />
                  Equity Curve
                </h3>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={result.equityCurve} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light, #e5e7eb)" />
                      <XAxis
                        dataKey="date"
                        tick={{ fill: 'var(--color-text-muted, #9ca3af)', fontSize: 11 }}
                        tickFormatter={(d) => new Date(d).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
                      />
                      <YAxis
                        tick={{ fill: 'var(--color-text-muted, #9ca3af)', fontSize: 11 }}
                        tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'var(--color-bg, #fff)',
                          border: '1px solid var(--color-border, #e5e7eb)',
                          borderRadius: '8px',
                        }}
                        formatter={(value: number | undefined) => [`$${(value ?? 0).toLocaleString()}`, 'Portfolio Value']}
                        labelFormatter={(label) => new Date(label).toLocaleDateString()}
                      />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="#7c3aed"
                        fill="#7c3aed"
                        fillOpacity={0.1}
                        strokeWidth={2}
                      />
                      <ReferenceLine
                        y={config.initialCapital}
                        stroke="#9ca3af"
                        strokeDasharray="3 3"
                        label={{ value: 'Initial', position: 'left', fill: '#9ca3af', fontSize: 11 }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Episode Returns + Factor Attribution */}
            <div className="grid grid-cols-12 gap-6">
              {/* Episode Returns */}
              <div className="col-span-12 lg:col-span-7">
                <div className="bg-[var(--color-bg)] rounded-xl border border-[var(--color-border)] p-6">
                  <h3 className="text-lg font-semibold text-[var(--color-text)] mb-4">
                    Episode Returns
                  </h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={result.episodeReturns} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light, #e5e7eb)" />
                        <XAxis
                          dataKey="episode"
                          tick={{ fill: 'var(--color-text-muted, #9ca3af)', fontSize: 11 }}
                          label={{ value: 'Episode', position: 'bottom', offset: -5 }}
                        />
                        <YAxis
                          tick={{ fill: 'var(--color-text-muted, #9ca3af)', fontSize: 11 }}
                          tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                        />
                        <Tooltip
                          formatter={(value: number | undefined, name?: string) => [
                            name === 'return' ? `${((value ?? 0) * 100).toFixed(2)}%` : (value ?? 0).toFixed(2),
                            name === 'return' ? 'OOS Return' : 'Sharpe',
                          ]}
                        />
                        <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="2 2" />
                        <Bar dataKey="return" fill="#818cf8" opacity={0.6} radius={[4, 4, 0, 0]} />
                        <Line type="monotone" dataKey="sharpe" stroke="#f59e0b" strokeWidth={2} dot={false} yAxisId="right" />
                        <YAxis yAxisId="right" orientation="right" tick={{ fill: '#f59e0b', fontSize: 11 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Factor Attribution */}
              <div className="col-span-12 lg:col-span-5">
                <div className="bg-[var(--color-bg)] rounded-xl border border-[var(--color-border)] p-6">
                  <h3 className="text-lg font-semibold text-[var(--color-text)] mb-4">
                    Factor Attribution
                  </h3>
                  <div className="space-y-3">
                    {result.factorExposures.map((factor) => (
                      <div key={factor.factor} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-2 h-8 rounded-full ${
                              factor.contribution >= 0 ? 'bg-green-500' : 'bg-red-500'
                            }`}
                          />
                          <div>
                            <div className="text-sm font-medium text-[var(--color-text)] capitalize">
                              {factor.factor.replace(/_/g, ' ')}
                            </div>
                            <div className="text-xs text-[var(--color-text-muted)]">
                              Avg exposure: {(factor.avgExposure * 100).toFixed(1)}%
                            </div>
                          </div>
                        </div>
                        <div
                          className={`font-mono text-sm font-bold ${
                            factor.contribution >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}
                        >
                          {factor.contribution >= 0 ? '+' : ''}
                          {(factor.contribution * 100).toFixed(2)}%
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Overfit Analysis */}
            <div className="bg-[var(--color-bg)] rounded-xl border border-[var(--color-border)] p-6">
              <h3 className="text-lg font-semibold text-[var(--color-text)] mb-3">Overfit Analysis</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-3 bg-[var(--color-bg-tertiary)] rounded-lg text-center">
                  <div className="text-xs text-[var(--color-text-muted)]">Overfit Ratio</div>
                  <div
                    className={`text-xl font-bold ${
                      result.walkForward.overfitRatio < 1.5 ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {result.walkForward.overfitRatio.toFixed(2)}x
                  </div>
                  <div className="text-xs text-[var(--color-text-muted)]">
                    {result.walkForward.overfitRatio < 1.5 ? 'Healthy' : 'High overfit risk'}
                  </div>
                </div>
                <div className="p-3 bg-[var(--color-bg-tertiary)] rounded-lg text-center">
                  <div className="text-xs text-[var(--color-text-muted)]">Benchmark Return</div>
                  <div className="text-xl font-bold text-[var(--color-text)]">
                    {(result.benchmark.totalReturn * 100).toFixed(2)}%
                  </div>
                </div>
                <div className="p-3 bg-[var(--color-bg-tertiary)] rounded-lg text-center">
                  <div className="text-xs text-[var(--color-text-muted)]">Strategy Alpha</div>
                  <div
                    className={`text-xl font-bold ${result.alpha >= 0 ? 'text-green-600' : 'text-red-600'}`}
                  >
                    {result.alpha >= 0 ? '+' : ''}
                    {(result.alpha * 100).toFixed(2)}%
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Empty State */}
        {!result && !isPending && !error && (
          <div className="text-center py-16">
            <BarChart3 className="w-16 h-16 text-[var(--color-text-muted)] mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-[var(--color-text)] mb-2">
              Configure and run a backtest
            </h3>
            <p className="text-sm text-[var(--color-text-muted)] max-w-md mx-auto">
              Walk-forward backtesting validates your CVRF strategy against historical data.
              Select symbols, date range, and strategy to get started.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default Backtest;
