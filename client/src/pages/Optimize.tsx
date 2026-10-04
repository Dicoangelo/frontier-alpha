import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { SlidersHorizontal, TrendingUp, Shield, Target, Info, RotateCcw } from 'lucide-react';
import { usePortfolio } from '@/hooks/usePortfolio';
import { api, getErrorMessage } from '@/api/client';
import { useToast } from '@/hooks/useToast';
import { Button } from '@/components/shared/Button';
import { UpgradeGate } from '@/components/shared/UpgradeGate';
import { SectionErrorBoundary } from '@/components/shared/ErrorBoundary';
import { MonteCarloChart } from '@/components/charts/MonteCarloChart';
import type { OptimizationConfig, OptimizationResult } from '@/types';

type OptimizationObjective = OptimizationConfig['objective'];
const inputClass = 'block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2.5 text-sm tabular-nums text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30';
const labelClass = 'mb-1.5 block text-xs font-medium text-[var(--color-text-secondary)]';
const panelClass = 'rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 sm:p-5';
const objectives: { value: OptimizationObjective; label: string; description: string; icon: typeof TrendingUp }[] = [
  { value: 'max_sharpe', label: 'Maximum Sharpe', description: 'Risk-adjusted return', icon: TrendingUp },
  { value: 'min_volatility', label: 'Minimum volatility', description: 'Lower portfolio volatility', icon: Shield },
  { value: 'risk_parity', label: 'Risk parity', description: 'Balanced risk contribution', icon: Target },
  { value: 'target_volatility', label: 'Target volatility', description: 'Set an annualized target', icon: Info },
];

export function Optimize() {
  return <UpgradeGate requiredPlan="pro" title="Portfolio optimizer" description="Compare allocation objectives and portfolio constraints with the Pro plan."><OptimizeContent /></UpgradeGate>;
}

function OptimizeContent() {
  const [selectedObjective, setSelectedObjective] = useState<OptimizationObjective>('max_sharpe');
  const [targetVol, setTargetVol] = useState('0.15');
  const [maxWeight, setMaxWeight] = useState('0.25');
  const [validationError, setValidationError] = useState<string | null>(null);
  const { toastSuccess, toastError } = useToast();
  const { data: portfolio, isLoading: portfolioLoading, isError: portfolioError, refetch: refetchPortfolio } = usePortfolio();
  const symbols = [...new Set(portfolio?.positions?.map(p => p.symbol) || [])];
  const optimizeMutation = useMutation<{ data: OptimizationResult }, Error, { symbols: string[]; config: OptimizationConfig }>({
    mutationFn: data => api.post('/portfolio/optimize', data),
    onSuccess: response => toastSuccess('Optimization complete', { message: `Sharpe ratio: ${response.data.sharpeRatio.toFixed(2)}` }),
    onError: error => toastError('Optimization failed', { message: getErrorMessage(error) }),
  });
  const result = optimizeMutation.data?.data;
  const isPending = optimizeMutation.isPending;
  const clearResult = () => { optimizeMutation.reset(); setValidationError(null); };
  const handleReset = () => {
    setSelectedObjective('max_sharpe'); setTargetVol('0.15'); setMaxWeight('0.25'); clearResult();
  };
  const handleOptimize = () => {
    const weight = Number(maxWeight);
    const volatility = Number(targetVol);
    if (symbols.length < 2) { setValidationError('Add at least two holdings with price history to optimize a portfolio.'); return; }
    if (!maxWeight.trim() || !Number.isFinite(weight) || weight < 0.05 || weight > 1) { setValidationError('Enter a maximum position weight between 0.05 and 1.'); return; }
    if (selectedObjective === 'target_volatility' && (!targetVol.trim() || !Number.isFinite(volatility) || volatility < 0.05 || volatility > 0.5)) { setValidationError('Enter a target volatility between 0.05 and 0.50.'); return; }
    setValidationError(null);
    const config: OptimizationConfig = { objective: selectedObjective, riskFreeRate: 0.045, constraints: { maxWeight: weight } };
    if (selectedObjective === 'target_volatility') {
      config.targetVolatility = volatility;
      config.constraints!.targetVolatility = volatility;
    }
    optimizeMutation.mutate({ symbols, config });
  };
  const monteCarlo = result?.monteCarlo;

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-border)] pb-4">
        <div><p className="mb-1 text-xs font-medium text-[var(--color-text-muted)]">Research / Allocation</p><h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">Portfolio optimizer</h1><p className="mt-1 text-sm text-[var(--color-text-secondary)]">Compare allocation objectives, position limits, and projected risk.</p></div>
        <Button variant="outline" size="sm" onClick={handleReset} disabled={isPending} leftIcon={<RotateCcw size={15} />}>Reset inputs</Button>
      </header>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(240px,1fr)]">
        <section className={panelClass} aria-labelledby="optimizer-settings">
          <h2 id="optimizer-settings" className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]"><SlidersHorizontal size={16} aria-hidden="true" /> Optimization settings</h2>
          <fieldset disabled={isPending}>
            <legend className={labelClass}>Objective</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {objectives.map(obj => <button key={obj.value} type="button" onClick={() => { setSelectedObjective(obj.value); clearResult(); }} aria-pressed={selectedObjective === obj.value} className={`flex items-start gap-3 rounded-md border p-3 text-left transition-colors disabled:opacity-60 ${selectedObjective === obj.value ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]' : 'border-[var(--color-border)] hover:bg-[var(--color-bg-tertiary)]'}`}><obj.icon size={17} className="mt-0.5 shrink-0 text-[var(--color-accent-text)]" aria-hidden="true" /><span><span className="block text-sm font-medium text-[var(--color-text)]">{obj.label}</span><span className="mt-0.5 block text-xs text-[var(--color-text-muted)]">{obj.description}</span></span></button>)}
            </div>
            <div className="mt-5 grid grid-cols-1 gap-4 border-t border-[var(--color-border-light)] pt-4 sm:grid-cols-2">
              <div><label htmlFor="opt-max-weight" className={labelClass}>Maximum position weight</label><input id="opt-max-weight" type="number" step="0.01" min="0.05" max="1" value={maxWeight} onChange={e => { setMaxWeight(e.target.value); clearResult(); }} className={inputClass} /><p className="mt-1.5 text-xs text-[var(--color-text-muted)]">Decimal allocation: 0.25 limits a holding to 25%.</p></div>
              {selectedObjective === 'target_volatility' && <div><label htmlFor="opt-target-vol" className={labelClass}>Target volatility</label><input id="opt-target-vol" type="number" step="0.01" min="0.05" max="0.5" value={targetVol} onChange={e => { setTargetVol(e.target.value); clearResult(); }} className={inputClass} /><p className="mt-1.5 text-xs text-[var(--color-text-muted)]">Annualized decimal: 0.15 represents 15%.</p></div>}
            </div>
          </fieldset>
          {(validationError || optimizeMutation.error) && <p role="alert" className="mt-4 rounded-md border border-[var(--color-negative)]/25 bg-[color-mix(in_srgb,var(--color-negative)_5%,transparent)] p-3 text-sm text-[var(--color-negative)]">{validationError || getErrorMessage(optimizeMutation.error)}</p>}
          <div className="mt-5 flex flex-wrap items-center gap-3"><Button onClick={handleOptimize} disabled={symbols.length < 2 || portfolioLoading || portfolioError} isLoading={isPending} leftIcon={<SlidersHorizontal size={16} />}>{isPending ? 'Running optimization…' : 'Run optimization'}</Button><span className="text-xs text-[var(--color-text-muted)]" role="status">{isPending ? 'Calculating allocation and risk.' : symbols.length < 2 ? 'At least two holdings are required.' : `${symbols.length} holdings · 4.5% risk-free rate`}</span></div>
        </section>
        <section className={panelClass} aria-labelledby="optimizer-holdings">
          <div className="mb-3 flex items-center justify-between gap-3"><h2 id="optimizer-holdings" className="text-sm font-semibold text-[var(--color-text)]">Portfolio holdings</h2><Link to="/portfolio" className="text-xs font-medium text-[var(--color-accent-text)] hover:underline">Manage</Link></div>
          {portfolioLoading ? <p role="status" className="py-5 text-sm text-[var(--color-text-muted)]">Loading holdings…</p> : portfolioError ? <div role="alert" className="space-y-3 py-3"><p className="text-sm text-[var(--color-negative)]">Unable to load your holdings.</p><Button variant="outline" size="sm" onClick={() => refetchPortfolio()}>Retry holdings</Button></div> : symbols.length === 0 ? <p className="py-5 text-sm text-[var(--color-text-muted)]">Add positions to your portfolio to compare allocations.</p> : <><div className="mb-1 flex justify-between border-b border-[var(--color-border-light)] pb-2 text-xs text-[var(--color-text-muted)]"><span>Symbol</span><span>{result ? 'Model weight' : 'Current weight'}</span></div><ul className="divide-y divide-[var(--color-border-light)]">{symbols.map(symbol => { const weight = result ? result.weights[symbol] : portfolio?.positions?.filter(p => p.symbol === symbol).reduce((sum, p) => sum + p.weight, 0); return <li key={symbol} className="flex items-center justify-between py-2.5 text-sm"><span className="font-medium text-[var(--color-text)]">{symbol}</span><span className="tabular-nums text-[var(--color-text-secondary)]">{weight === undefined ? '—' : `${(weight * 100).toFixed(1)}%`}</span></li>; })}</ul></>}
        </section>
      </div>
      {result && <SectionErrorBoundary sectionName="Optimization results"><section className={panelClass}>
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Model results</h2><p className="mt-1 text-xs text-[var(--color-text-muted)]">Estimates returned by the optimizer. Changing an input clears these results.</p>
        <div className="my-4 grid grid-cols-2 gap-4 border-y border-[var(--color-border-light)] py-4 md:grid-cols-4">{[['Expected return', `${(result.expectedReturn * 100).toFixed(1)}%`], ['Expected volatility', `${(result.expectedVolatility * 100).toFixed(1)}%`], ['Sharpe ratio', result.sharpeRatio.toFixed(2)], ['Positions', Object.keys(result.weights).length]].map(([label, value]) => <div key={label}><p className="text-xs text-[var(--color-text-muted)]">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums text-[var(--color-text)]">{value}</p></div>)}</div>
        <h3 className="mb-3 text-xs font-medium text-[var(--color-text-secondary)]">Model allocation</h3><div className="space-y-3">{Object.entries(result.weights).sort(([,a], [,b]) => b - a).map(([symbol, weight]) => <div key={symbol} className="flex items-center gap-3 text-xs"><span className="w-16 font-medium text-[var(--color-text)]">{symbol}</span><div className="h-2 flex-1 overflow-hidden rounded-sm bg-[var(--color-bg-tertiary)]"><div className="h-full bg-[var(--color-accent)]" style={{width:`${weight * 100}%`}} /></div><span className="w-14 text-right tabular-nums text-[var(--color-text-secondary)]">{(weight * 100).toFixed(1)}%</span></div>)}</div>
        {result.explanation && <p className="mt-5 border-t border-[var(--color-border-light)] pt-4 text-sm leading-6 text-[var(--color-text-secondary)]">{result.explanation}</p>}
      </section>
      {monteCarlo && <section className={`${panelClass} mt-4`}><h2 className="text-sm font-semibold text-[var(--color-text)]">Simulation risk summary</h2><div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">{[['Median return', `${(monteCarlo.medianReturn * 100).toFixed(1)}%`], ['95% value at risk', `${(monteCarlo.var95 * 100).toFixed(1)}%`], ['95% conditional VaR', `${(monteCarlo.cvar95 * 100).toFixed(1)}%`], ['Positive return probability', `${(monteCarlo.probPositive * 100).toFixed(1)}%`]].map(([label,value]) => <div key={label}><p className="text-xs text-[var(--color-text-muted)]">{label}</p><p className="mt-1 text-lg font-semibold tabular-nums text-[var(--color-text)]">{value}</p></div>)}</div></section>}
      {monteCarlo?.confidenceInterval && monteCarlo.simulations && monteCarlo.simulations.length > 0 ? <div className="mt-4"><MonteCarloChart result={{...monteCarlo, confidenceInterval: monteCarlo.confidenceInterval}} timeHorizon="1 Year" /></div> : <p className="mt-3 text-xs text-[var(--color-text-muted)]">{monteCarlo ? 'The response includes summary statistics; a simulation distribution was not returned.' : 'Simulation statistics were not included in this result.'}</p>}
      </SectionErrorBoundary>}
    </div>
  );
}
