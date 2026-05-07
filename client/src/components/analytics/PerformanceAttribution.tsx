import { useState, useEffect } from 'react';
import { Card } from '@/components/shared/Card';
import { TrendingUp, TrendingDown, PieChart, Layers, RefreshCw } from 'lucide-react';

interface BrinsonAttribution {
  totalReturn: number;
  benchmarkReturn: number;
  activeReturn: number;
  allocationEffect: number;
  selectionEffect: number;
  interactionEffect: number;
  sectorBreakdown: Array<{
    sector: string;
    allocation: number;
    selection: number;
    interaction: number;
    total: number;
  }>;
}

interface FactorAttribution {
  totalReturn: number;
  factorReturn: number;
  specificReturn: number;
  factors: Array<{
    factor: string;
    exposure: number;
    factorReturn: number;
    contribution: number;
  }>;
}

interface AttributionData {
  period: string;
  startDate: string;
  endDate: string;
  brinson: BrinsonAttribution;
  factor: FactorAttribution;
  topContributors: Array<{
    symbol: string;
    contribution: number;
    weight: number;
  }>;
  topDetractors: Array<{
    symbol: string;
    contribution: number;
    weight: number;
  }>;
}

interface PerformanceAttributionProps {
  symbols?: string[];
}

const PERIODS = ['1W', '1M', '3M', '6M', '1Y', 'YTD'] as const;

export function PerformanceAttribution({ symbols }: PerformanceAttributionProps) {
  const [period, setPeriod] = useState<string>('1M');
  const [data, setData] = useState<AttributionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'brinson' | 'factor'>('brinson');

  const fetchAttribution = async () => {
    setLoading(true);
    setError(null);

    try {
      const symbolsParam = symbols?.join(',') || 'NVDA,AAPL,MSFT,GOOGL,AMZN';
      const response = await fetch(`/api/v1/portfolio/attribution?period=${period}&symbols=${symbolsParam}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch attribution: ${response.status}`);
      }

      const result = await response.json();
      if (result.success) {
        setData(result.data);
      } else {
        throw new Error(result.error?.message || 'Unknown error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load attribution');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttribution();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchAttribution is stable, symbols serialized for comparison
  }, [period, symbols?.join(',')]);

  const formatPercent = (value: number, decimals: number = 2): string => {
    const pct = (value * 100).toFixed(decimals);
    return value >= 0 ? `+${pct}%` : `${pct}%`;
  };

  const formatBps = (value: number): string => {
    const bps = Math.round(value * 10000);
    return value >= 0 ? `+${bps} bps` : `${bps} bps`;
  };

  if (loading) {
    return (
      <Card title="Performance Attribution">
        <div className="flex items-center justify-center" style={{ minHeight: 256 }}>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-info)]" />
        </div>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card title="Performance Attribution">
        <div className="text-center py-8" style={{ minHeight: 256 }}>
          <p className="text-[var(--color-negative)] mb-4">{error || 'No data available'}</p>
          <button
            onClick={fetchAttribution}
            className="px-4 py-2 min-h-[40px] bg-[image:var(--gradient-sovereign)] text-white rounded-lg animate-press transition-[box-shadow,transform] duration-200 hover:shadow-lg"
          >
            Retry
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card
      title="Performance Attribution"
      action={
        <button
          onClick={fetchAttribution}
          className="p-2 min-h-[40px] min-w-[40px] text-theme-muted hover:text-theme-secondary glass-slab-floating rounded-lg animate-press transition-[color,box-shadow] duration-200"
          aria-label="Refresh performance attribution"
        >
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
        </button>
      }
    >
      <div className="space-y-6">
        {/* Period Selector + View Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div
            className="flex gap-1 glass-slab-floating rounded-lg p-1"
            role="group"
            aria-label="Attribution period"
          >
            {PERIODS.map((p) => {
              const active = period === p;
              return (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className="px-3 py-1.5 min-h-[32px] mono text-[10px] tracking-[0.2em] uppercase rounded-md animate-press transition-[color,background-color] duration-200"
                  style={
                    active
                      ? { backgroundColor: 'var(--color-accent-light)', color: 'var(--color-accent)' }
                      : { color: 'var(--color-text-secondary)' }
                  }
                  aria-pressed={active}
                >
                  {p}
                </button>
              );
            })}
          </div>

          <div className="flex gap-1 glass-slab-floating rounded-lg p-1">
            {([
              { key: 'brinson', label: 'Brinson', Icon: PieChart },
              { key: 'factor', label: 'Factor', Icon: Layers },
            ] as const).map(({ key, label, Icon }) => {
              const active = view === key;
              return (
                <button
                  key={key}
                  onClick={() => setView(key)}
                  className="px-3 py-1.5 min-h-[32px] mono text-[10px] tracking-[0.2em] uppercase rounded-md flex items-center gap-1.5 animate-press transition-[color,background-color] duration-200"
                  style={
                    active
                      ? { backgroundColor: 'var(--color-accent-light)', color: 'var(--color-accent)' }
                      : { color: 'var(--color-text-secondary)' }
                  }
                  aria-pressed={active}
                >
                  <Icon className="w-3 h-3" aria-hidden="true" />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="glass-slab-floating rounded-xl p-4">
            <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Portfolio Return</p>
            <p className={`mt-1 mono text-xl font-bold tabular-nums ${data.brinson.totalReturn >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}>
              {formatPercent(data.brinson.totalReturn)}
            </p>
          </div>
          <div className="glass-slab-floating rounded-xl p-4">
            <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Benchmark Return</p>
            <p className={`mt-1 mono text-xl font-bold tabular-nums ${data.brinson.benchmarkReturn >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}>
              {formatPercent(data.brinson.benchmarkReturn)}
            </p>
          </div>
          <div
            className="glass-slab-floating rounded-xl p-4 bg-[var(--color-info)]/8"
          >
            <p className="mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-info)]">Active Return</p>
            <p className={`mt-1 mono text-xl font-bold tabular-nums ${data.brinson.activeReturn >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}>
              {formatPercent(data.brinson.activeReturn)}
            </p>
          </div>
          <div
            className="glass-slab-floating rounded-xl p-4 bg-[var(--color-accent)]/8"
          >
            <p className="mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-accent)]">Specific Return</p>
            <p className={`mt-1 mono text-xl font-bold tabular-nums ${data.factor.specificReturn >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}>
              {formatPercent(data.factor.specificReturn)}
            </p>
          </div>
        </div>

        {/* Brinson Attribution View */}
        {view === 'brinson' && (
          <div className="space-y-4">
            {/* Effects Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="glass-slab-floating rounded-xl p-4">
                <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Allocation Effect</p>
                <p className={`mt-1 mono text-lg font-bold tabular-nums ${data.brinson.allocationEffect >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}>
                  {formatBps(data.brinson.allocationEffect)}
                </p>
                <p className="text-xs leading-relaxed text-theme-muted mt-1">Sector weight decisions</p>
              </div>
              <div className="glass-slab-floating rounded-xl p-4">
                <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Selection Effect</p>
                <p className={`mt-1 mono text-lg font-bold tabular-nums ${data.brinson.selectionEffect >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}>
                  {formatBps(data.brinson.selectionEffect)}
                </p>
                <p className="text-xs leading-relaxed text-theme-muted mt-1">Stock picking within sectors</p>
              </div>
              <div className="glass-slab-floating rounded-xl p-4">
                <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Interaction Effect</p>
                <p className={`mt-1 mono text-lg font-bold tabular-nums ${data.brinson.interactionEffect >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}>
                  {formatBps(data.brinson.interactionEffect)}
                </p>
                <p className="text-xs leading-relaxed text-theme-muted mt-1">Combined decisions</p>
              </div>
            </div>

            {/* Sector Breakdown */}
            <div>
              <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted mb-3">Sector Breakdown</p>
              <div className="glass-slab-floating rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b border-theme-light">
                        <th className="mono text-[10px] tracking-[0.2em] uppercase px-3 py-2 text-theme-muted font-medium">Sector</th>
                        <th className="mono text-[10px] tracking-[0.2em] uppercase px-3 py-2 text-right text-theme-muted font-medium">Allocation</th>
                        <th className="mono text-[10px] tracking-[0.2em] uppercase px-3 py-2 text-right text-theme-muted font-medium">Selection</th>
                        <th className="mono text-[10px] tracking-[0.2em] uppercase px-3 py-2 text-right text-theme-muted font-medium">Interaction</th>
                        <th className="mono text-[10px] tracking-[0.2em] uppercase px-3 py-2 text-right text-theme-muted font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.brinson.sectorBreakdown.slice(0, 6).map((sector) => (
                        <tr key={sector.sector} className="border-b border-theme-light last:border-b-0">
                          <td className="px-3 py-2 font-medium text-theme">{sector.sector}</td>
                          <td className={`px-3 py-2 text-right mono tabular-nums ${sector.allocation >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}>
                            {formatBps(sector.allocation)}
                          </td>
                          <td className={`px-3 py-2 text-right mono tabular-nums ${sector.selection >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}>
                            {formatBps(sector.selection)}
                          </td>
                          <td className={`px-3 py-2 text-right mono tabular-nums ${sector.interaction >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}>
                            {formatBps(sector.interaction)}
                          </td>
                          <td className={`px-3 py-2 text-right mono tabular-nums font-medium ${sector.total >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}>
                            {formatBps(sector.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Factor Attribution View */}
        {view === 'factor' && (
          <div className="space-y-4">
            {/* Factor Return Breakdown */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="glass-slab-floating rounded-xl p-4">
                <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Factor Return</p>
                <p className={`mt-1 mono text-lg font-bold tabular-nums ${data.factor.factorReturn >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}>
                  {formatPercent(data.factor.factorReturn)}
                </p>
                <p className="text-xs leading-relaxed text-theme-muted mt-1">From systematic exposures</p>
              </div>
              <div className="glass-slab-floating rounded-xl p-4">
                <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Specific Return</p>
                <p className={`mt-1 mono text-lg font-bold tabular-nums ${data.factor.specificReturn >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}>
                  {formatPercent(data.factor.specificReturn)}
                </p>
                <p className="text-xs leading-relaxed text-theme-muted mt-1">Idiosyncratic / stock-specific</p>
              </div>
            </div>

            {/* Factor Contributions */}
            <div>
              <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted mb-3">Factor Contributions</p>
              <div className="space-y-3" style={{ minHeight: 200 }}>
                {data.factor.factors.map((factor) => {
                  const maxContribution = Math.max(...data.factor.factors.map((f) => Math.abs(f.contribution)));
                  const barWidth = Math.abs(factor.contribution) / maxContribution * 100;
                  const isPositive = factor.contribution >= 0;

                  return (
                    <div key={factor.factor} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-theme-secondary capitalize">{factor.factor.replace('_', ' ')}</span>
                        <span className={`mono tabular-nums ${isPositive ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}>
                          {formatBps(factor.contribution)}
                        </span>
                      </div>
                      <div className="h-2 bg-[var(--color-bg-secondary)] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-[width] duration-500 ease-out ${isPositive ? 'bg-[var(--color-positive)]' : 'bg-[var(--color-negative)]'}`}
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                      <div className="flex justify-between mono text-[10px] tracking-[0.2em] uppercase tabular-nums text-theme-muted">
                        <span>Exposure: {factor.exposure.toFixed(2)}</span>
                        <span>Factor Return: {formatPercent(factor.factorReturn)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Top Contributors & Detractors */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-theme-light">
          <div>
            <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[var(--color-positive)]" aria-hidden="true" />
              Top Contributors
            </p>
            <div className="space-y-2">
              {data.topContributors.map((c) => (
                <div
                  key={c.symbol}
                  className="glass-slab-floating flex justify-between items-center p-2.5 rounded-lg"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--color-positive) 8%, transparent)' }}
                >
                  <span className="font-medium text-theme">{c.symbol}</span>
                  <span className="mono tabular-nums text-[var(--color-positive)]">{formatBps(c.contribution)}</span>
                </div>
              ))}
              {data.topContributors.length === 0 && (
                <p className="text-sm text-theme-muted">No positive contributors</p>
              )}
            </div>
          </div>

          <div>
            <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted mb-3 flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-[var(--color-negative)]" aria-hidden="true" />
              Top Detractors
            </p>
            <div className="space-y-2">
              {data.topDetractors.map((c) => (
                <div
                  key={c.symbol}
                  className="glass-slab-floating flex justify-between items-center p-2.5 rounded-lg"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--color-negative) 8%, transparent)' }}
                >
                  <span className="font-medium text-theme">{c.symbol}</span>
                  <span className="mono tabular-nums text-[var(--color-negative)]">{formatBps(c.contribution)}</span>
                </div>
              ))}
              {data.topDetractors.length === 0 && (
                <p className="text-sm text-theme-muted">No negative detractors</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
