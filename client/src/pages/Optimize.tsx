/**
 * Portfolio Optimization Page
 *
 * Multi-objective Monte Carlo optimization with cognitive insights.
 * Layout-wrapped (see App.tsx) — page chrome is provided by parent Layout.
 * This page contributes the section shell, hero, controls, and result surfaces.
 */

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Sparkles, TrendingUp, Shield, Target, Info } from 'lucide-react';
import { api, getErrorMessage } from '@/api/client';
import { useToast } from '@/hooks/useToast';
import { Spinner } from '@/components/shared/Spinner';
import { MonteCarloChart } from '@/components/charts/MonteCarloChart';

type OptimizationObjective = 'max_sharpe' | 'min_volatility' | 'risk_parity' | 'target_volatility';

interface OptimizationConfig {
  objective: OptimizationObjective;
  constraints?: {
    minWeight?: number;
    maxWeight?: number;
    targetVolatility?: number;
  };
}

interface MonteCarloResult {
  medianReturn: number;
  var95: number;
  cvar95: number;
  probPositive: number;
  confidenceInterval: {
    p5: number;
    p25: number;
    p50: number;
    p75: number;
    p95: number;
  };
  simulations?: number[];
}

interface OptimizationResult {
  weights: Record<string, number>;
  expectedReturn: number;
  expectedVolatility: number;
  sharpeRatio: number;
  factorExposures: Array<{
    factor: string;
    exposure: number;
    contribution: number;
  }>;
  monteCarlo?: MonteCarloResult;
}

// Canonical input class — matches Settings/Backtest/LoginForm pattern.
const inputClass =
  'block w-full px-4 py-3 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)] transition-[border-color,box-shadow] duration-200 mono text-sm';

const labelClass =
  'block mono text-[10px] sm:text-xs tracking-[0.3em] uppercase text-theme-muted mb-2';

const kickerClass =
  'mono text-[10px] sm:text-xs tracking-[0.3em] uppercase text-theme-muted mb-2';

const objectives: { value: OptimizationObjective; label: string; description: string; icon: typeof TrendingUp }[] = [
  { value: 'max_sharpe', label: 'Maximum Sharpe', description: 'Maximize risk-adjusted returns', icon: TrendingUp },
  { value: 'min_volatility', label: 'Minimum Volatility', description: 'Minimize portfolio risk', icon: Shield },
  { value: 'risk_parity', label: 'Risk Parity', description: 'Equal risk contribution', icon: Target },
  { value: 'target_volatility', label: 'Target Volatility', description: 'Hit a specific volatility level', icon: Info },
];

export function Optimize() {
  const [selectedObjective, setSelectedObjective] = useState<OptimizationObjective>('max_sharpe');
  const [targetVol, setTargetVol] = useState('0.15');
  const [maxWeight, setMaxWeight] = useState('0.25');
  const { toastSuccess, toastError } = useToast();

  const { data: portfolio } = useQuery({
    queryKey: ['portfolio'],
    queryFn: () => api.get('/portfolio'),
  });

  const optimizeMutation = useMutation<{ data: OptimizationResult }, Error, { symbols: string[]; config: OptimizationConfig }>({
    mutationFn: (data) => api.post('/portfolio/optimize', data),
    onSuccess: (response) => {
      const sharpe = response.data.sharpeRatio.toFixed(2);
      toastSuccess('Optimization complete', { message: `Sharpe ratio: ${sharpe}` });
    },
    onError: (error) => {
      toastError('Optimization failed', { message: getErrorMessage(error) });
    },
  });

  const symbols = portfolio?.data?.positions?.map((p: { symbol: string }) => p.symbol) || [];

  const handleOptimize = () => {
    if (symbols.length === 0) return;

    const config: OptimizationConfig = {
      objective: selectedObjective,
      constraints: {
        maxWeight: parseFloat(maxWeight),
      },
    };

    if (selectedObjective === 'target_volatility') {
      config.constraints!.targetVolatility = parseFloat(targetVol);
    }

    optimizeMutation.mutate({ symbols, config });
  };

  const result = optimizeMutation.data?.data;
  const isPending = optimizeMutation.isPending;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div
        className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 animate-fade-in-up"
        style={{ animationDelay: '0ms', animationFillMode: 'both' }}
      >
        <div>
          <p className={kickerClass}>
            Optimize · <span className="text-[color:var(--color-accent-secondary)]">Monte Carlo</span>
          </p>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
            <span className="text-gradient-brand">Portfolio</span>{' '}
            <span className="text-theme">Optimization</span>
          </h1>
          <p className="mt-3 text-sm sm:text-base text-theme-secondary leading-relaxed max-w-2xl">
            Multi-factor optimization with cognitive insights. Maximize Sharpe, minimize variance,
            balance risk contribution, or pin volatility to a target band.
          </p>
        </div>

        {/* Convergence indicator — type-rail pill */}
        {(isPending || result) && (
          <div
            className={`glass-slab-floating relative overflow-hidden rounded-xl pl-5 pr-4 py-2.5 inline-flex items-center gap-2 before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] ${
              isPending
                ? "before:bg-[var(--color-warning)] shadow-[0_8px_30px_-12px_rgba(245,158,11,0.45)]"
                : "before:bg-[var(--color-positive)] shadow-[0_8px_30px_-12px_rgba(34,197,94,0.45)]"
            }`}
            role="status"
            aria-live="polite"
          >
            {isPending ? (
              <>
                <div className="w-3 h-3 border-2 border-[var(--color-warning)]/30 border-t-[var(--color-warning)] rounded-full animate-spin" aria-hidden="true" />
                <span className="mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-warning)]">
                  Sampling
                </span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-[var(--color-positive)] holo-pulse" aria-hidden="true" />
                <span className="mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-positive)]">
                  Converged
                </span>
              </>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Objective + Constraints (left) ────────────────────────────── */}
        <div
          className="lg:col-span-2 space-y-6 animate-fade-in-up"
          style={{ animationDelay: '50ms', animationFillMode: 'both' }}
        >
          <section className="glass-slab rounded-2xl p-6 sm:p-8">
            <header className="flex items-start gap-4 mb-6">
              <div
                className="p-2.5 rounded-lg shrink-0"
                style={{ backgroundColor: 'color-mix(in srgb, var(--color-accent) 10%, transparent)' }}
              >
                <Sparkles className="w-5 h-5" style={{ color: 'var(--color-accent)' }} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className={kickerClass}>Strategy</p>
                <h2 className="text-lg font-bold text-theme mt-1">Optimization Objective</h2>
                <p className="text-sm text-theme-secondary mt-1">
                  Choose what the optimizer should solve for
                </p>
              </div>
            </header>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-stagger">
              {objectives.map((obj) => {
                const active = selectedObjective === obj.value;
                return (
                  <button
                    key={obj.value}
                    type="button"
                    onClick={() => setSelectedObjective(obj.value)}
                    aria-pressed={active}
                    className={`animate-enter glass-slab-floating relative overflow-hidden p-4 min-h-[44px] rounded-xl text-left animate-press transition-[border-color,box-shadow,background-color] duration-200 ${
                      active
                        ? "before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-[image:var(--gradient-sovereign)] shadow-[0_4px_20px_rgba(123,44,255,0.18)]"
                        : ''
                    }`}
                    style={
                      active
                        ? { backgroundColor: 'color-mix(in srgb, var(--color-accent) 10%, transparent)' }
                        : undefined
                    }
                  >
                    <obj.icon
                      className="w-5 h-5 mb-2"
                      aria-hidden="true"
                      style={{ color: active ? 'var(--color-accent)' : 'var(--color-text-muted)' }}
                    />
                    <p className={`font-semibold ${active ? 'text-gradient-brand' : 'text-theme'}`}>
                      {obj.label}
                    </p>
                    <p className="text-sm text-theme-muted mt-0.5">{obj.description}</p>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="glass-slab rounded-2xl p-6 sm:p-8">
            <header className="flex items-start gap-4 mb-6">
              <div
                className="p-2.5 rounded-lg shrink-0"
                style={{ backgroundColor: 'color-mix(in srgb, var(--color-accent) 10%, transparent)' }}
              >
                <Shield className="w-5 h-5" style={{ color: 'var(--color-accent)' }} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className={kickerClass}>Constraints</p>
                <h2 className="text-lg font-bold text-theme mt-1">Bounds & Targets</h2>
                <p className="text-sm text-theme-secondary mt-1">
                  Per-position caps and any volatility targeting
                </p>
              </div>
            </header>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label htmlFor="opt-max-weight" className={labelClass}>
                  Max Position Weight
                </label>
                <input
                  id="opt-max-weight"
                  type="number"
                  step="0.01"
                  min="0.05"
                  max="1"
                  value={maxWeight}
                  onChange={(e) => setMaxWeight(e.target.value)}
                  className={`${inputClass} tabular-nums`}
                />
                <p className="text-xs text-theme-muted mt-2 tabular-nums">
                  Cap any single name at {(parseFloat(maxWeight) * 100).toFixed(0)}%
                </p>
              </div>
              {selectedObjective === 'target_volatility' && (
                <div>
                  <label htmlFor="opt-target-vol" className={labelClass}>
                    Target Volatility
                  </label>
                  <input
                    id="opt-target-vol"
                    type="number"
                    step="0.01"
                    min="0.05"
                    max="0.5"
                    value={targetVol}
                    onChange={(e) => setTargetVol(e.target.value)}
                    className={`${inputClass} tabular-nums`}
                  />
                  <p className="text-xs text-theme-muted mt-2 tabular-nums">
                    Pin annualized vol at {(parseFloat(targetVol) * 100).toFixed(0)}%
                  </p>
                </div>
              )}
            </div>

            <div className="mt-7 flex flex-col sm:flex-row sm:items-center gap-4">
              <button
                onClick={handleOptimize}
                disabled={symbols.length === 0 || isPending}
                aria-label="Run optimization"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 min-h-[44px] rounded-sm bg-[image:var(--gradient-sovereign)] text-white mono text-[10px] font-black tracking-[0.3em] uppercase animate-press animate-lift shadow-[0_4px_30px_rgba(123,44,255,0.35)] hover:brightness-110 hover:shadow-[0_6px_40px_rgba(123,44,255,0.5)] disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-[0_4px_30px_rgba(123,44,255,0.35)] transition-[filter,box-shadow] duration-200"
              >
                {isPending ? (
                  <>
                    <Spinner className="w-4 h-4" />
                    Running…
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" aria-hidden="true" />
                    Run Optimization
                  </>
                )}
              </button>
              {symbols.length === 0 && (
                <p className="mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-warning)]">
                  Add positions to your portfolio first
                </p>
              )}
            </div>
          </section>
        </div>

        {/* ── Holdings (right) ──────────────────────────────────────────── */}
        <div
          className="animate-fade-in-up"
          style={{ animationDelay: '100ms', animationFillMode: 'both' }}
        >
          <section className="glass-slab rounded-2xl p-6 sm:p-8">
            <header className="flex items-start gap-4 mb-6">
              <div
                className="p-2.5 rounded-lg shrink-0"
                style={{ backgroundColor: 'color-mix(in srgb, var(--color-accent) 10%, transparent)' }}
              >
                <Target className="w-5 h-5" style={{ color: 'var(--color-accent)' }} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className={kickerClass}>Universe</p>
                <h2 className="text-lg font-bold text-theme mt-1">Current Holdings</h2>
              </div>
            </header>

            {symbols.length === 0 ? (
              <p className="text-sm text-theme-muted">No positions in portfolio.</p>
            ) : (
              <div className="space-y-1 animate-stagger">
                {symbols.map((symbol: string) => {
                  const weight = result?.weights?.[symbol];
                  return (
                    <div
                      key={symbol}
                      className="animate-enter flex items-center justify-between py-2.5 px-3 rounded-sm hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150"
                    >
                      <span className="mono text-xs tracking-[0.2em] uppercase text-theme">{symbol}</span>
                      {weight !== undefined && (
                        <span className="mono text-xs tabular-nums text-[var(--color-accent)] font-semibold">
                          {(weight * 100).toFixed(1)}%
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* ── Results ───────────────────────────────────────────────────── */}
      {result && (
        <section
          className="glass-slab rounded-2xl p-6 sm:p-8 animate-fade-in-up"
          style={{ animationDelay: '150ms', animationFillMode: 'both' }}
        >
          <header className="flex items-start gap-4 mb-6">
            <div
              className="p-2.5 rounded-lg shrink-0"
              style={{ backgroundColor: 'color-mix(in srgb, var(--color-accent) 10%, transparent)' }}
            >
              <Sparkles className="w-5 h-5" style={{ color: 'var(--color-accent)' }} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className={kickerClass}>Output</p>
              <h2 className="text-lg font-bold text-theme mt-1">Optimization Results</h2>
              <p className="text-sm text-theme-secondary mt-1">
                Solver-derived weights, expected return, and risk profile
              </p>
            </div>
          </header>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 animate-stagger">
            <div className="animate-enter glass-slab-floating rounded-xl p-4">
              <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Expected Return</p>
              <p className="text-xl font-bold tabular-nums mt-1 text-[var(--color-positive)]">
                {(result.expectedReturn * 100).toFixed(1)}%
              </p>
            </div>
            <div className="animate-enter glass-slab-floating rounded-xl p-4">
              <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Expected Volatility</p>
              <p className="text-xl font-bold tabular-nums mt-1 text-[var(--color-warning)]">
                {(result.expectedVolatility * 100).toFixed(1)}%
              </p>
            </div>
            <div className="animate-enter glass-slab-floating rounded-xl p-4">
              <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Sharpe Ratio</p>
              <p className="text-xl font-bold tabular-nums mt-1 text-gradient-brand holo-pulse">
                {result.sharpeRatio.toFixed(2)}
              </p>
            </div>
            <div className="animate-enter glass-slab-floating rounded-xl p-4">
              <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Positions</p>
              <p className="text-xl font-bold tabular-nums mt-1 text-theme">
                {Object.keys(result.weights).length}
              </p>
            </div>
          </div>

          <p className={`${kickerClass} mt-2`}>Optimal Weights</p>
          <div className="space-y-2 animate-stagger">
            {Object.entries(result.weights)
              .sort(([, a], [, b]) => b - a)
              .map(([symbol, weight]) => (
                <div
                  key={symbol}
                  className="animate-enter flex items-center gap-3 py-1.5 px-2 rounded-sm hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150"
                >
                  <span className="w-16 mono text-xs tracking-[0.2em] uppercase text-theme">{symbol}</span>
                  <div className="flex-1 h-2.5 bg-[var(--color-bg-secondary)] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${weight * 100}%`,
                        background: 'var(--gradient-sovereign)',
                      }}
                    />
                  </div>
                  <span className="w-16 text-right mono text-xs tabular-nums text-theme-secondary">
                    {(weight * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
          </div>
        </section>
      )}

      {/* ── Monte Carlo Chart ─────────────────────────────────────────── */}
      {result && (
        <div
          className="animate-fade-in-up"
          style={{ animationDelay: '200ms', animationFillMode: 'both' }}
        >
          <MonteCarloChart
            result={result.monteCarlo || {
              // Generate Monte Carlo estimate from optimization result if not provided by API
              medianReturn: result.expectedReturn,
              var95: -result.expectedVolatility * 1.645,
              cvar95: -result.expectedVolatility * 2.063,
              probPositive: 0.5 + (result.expectedReturn / (result.expectedVolatility * 2)) * 0.3,
              confidenceInterval: {
                p5: result.expectedReturn - result.expectedVolatility * 1.645,
                p25: result.expectedReturn - result.expectedVolatility * 0.675,
                p50: result.expectedReturn,
                p75: result.expectedReturn + result.expectedVolatility * 0.675,
                p95: result.expectedReturn + result.expectedVolatility * 1.645,
              },
            }}
            timeHorizon="1 Year"
          />
        </div>
      )}
    </div>
  );
}
