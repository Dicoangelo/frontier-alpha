import { useState, useEffect } from 'react';
import { Card } from '@/components/shared/Card';
import { TrendingUp, TrendingDown, PieChart, BarChart3, Layers, RefreshCw } from 'lucide-react';

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
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        </div>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card title="Performance Attribution">
        <div className="text-center py-8">
          <p className="text-red-600 mb-4">{error || 'No data available'}</p>
          <button
            onClick={fetchAttribution}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
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
          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      }
    >
      <div className="space-y-6">
        {/* Period Selector */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  period === p
                    ? 'bg-white shadow text-gray-900'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setView('brinson')}
              className={`px-3 py-1 text-sm rounded-md transition-colors flex items-center gap-1 ${
                view === 'brinson'
                  ? 'bg-white shadow text-gray-900'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <PieChart className="w-3 h-3" />
              Brinson
            </button>
            <button
              onClick={() => setView('factor')}
              className={`px-3 py-1 text-sm rounded-md transition-colors flex items-center gap-1 ${
                view === 'factor'
                  ? 'bg-white shadow text-gray-900'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Layers className="w-3 h-3" />
              Factor
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-xs text-gray-500 mb-1">Portfolio Return</p>
            <p className={`text-xl font-bold ${data.brinson.totalReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatPercent(data.brinson.totalReturn)}
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-xs text-gray-500 mb-1">Benchmark Return</p>
            <p className={`text-xl font-bold ${data.brinson.benchmarkReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatPercent(data.brinson.benchmarkReturn)}
            </p>
          </div>
          <div className="bg-blue-50 rounded-lg p-4">
            <p className="text-xs text-blue-600 mb-1">Active Return</p>
            <p className={`text-xl font-bold ${data.brinson.activeReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatPercent(data.brinson.activeReturn)}
            </p>
          </div>
          <div className="bg-purple-50 rounded-lg p-4">
            <p className="text-xs text-purple-600 mb-1">Specific Return</p>
            <p className={`text-xl font-bold ${data.factor.specificReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatPercent(data.factor.specificReturn)}
            </p>
          </div>
        </div>

        {/* Brinson Attribution View */}
        {view === 'brinson' && (
          <div className="space-y-4">
            {/* Effects Summary */}
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 border rounded-lg">
                <p className="text-sm text-gray-500 mb-1">Allocation Effect</p>
                <p className={`text-lg font-bold ${data.brinson.allocationEffect >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatBps(data.brinson.allocationEffect)}
                </p>
                <p className="text-xs text-gray-400 mt-1">Sector weight decisions</p>
              </div>
              <div className="p-4 border rounded-lg">
                <p className="text-sm text-gray-500 mb-1">Selection Effect</p>
                <p className={`text-lg font-bold ${data.brinson.selectionEffect >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatBps(data.brinson.selectionEffect)}
                </p>
                <p className="text-xs text-gray-400 mt-1">Stock picking within sectors</p>
              </div>
              <div className="p-4 border rounded-lg">
                <p className="text-sm text-gray-500 mb-1">Interaction Effect</p>
                <p className={`text-lg font-bold ${data.brinson.interactionEffect >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatBps(data.brinson.interactionEffect)}
                </p>
                <p className="text-xs text-gray-400 mt-1">Combined decisions</p>
              </div>
            </div>

            {/* Sector Breakdown */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-3">Sector Breakdown</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="pb-2 font-medium">Sector</th>
                      <th className="pb-2 font-medium text-right">Allocation</th>
                      <th className="pb-2 font-medium text-right">Selection</th>
                      <th className="pb-2 font-medium text-right">Interaction</th>
                      <th className="pb-2 font-medium text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.brinson.sectorBreakdown.slice(0, 6).map((sector) => (
                      <tr key={sector.sector} className="border-b border-gray-100">
                        <td className="py-2 font-medium text-gray-900">{sector.sector}</td>
                        <td className={`py-2 text-right ${sector.allocation >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatBps(sector.allocation)}
                        </td>
                        <td className={`py-2 text-right ${sector.selection >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatBps(sector.selection)}
                        </td>
                        <td className={`py-2 text-right ${sector.interaction >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatBps(sector.interaction)}
                        </td>
                        <td className={`py-2 text-right font-medium ${sector.total >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatBps(sector.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Factor Attribution View */}
        {view === 'factor' && (
          <div className="space-y-4">
            {/* Factor Return Breakdown */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 border rounded-lg">
                <p className="text-sm text-gray-500 mb-1">Factor Return</p>
                <p className={`text-lg font-bold ${data.factor.factorReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatPercent(data.factor.factorReturn)}
                </p>
                <p className="text-xs text-gray-400 mt-1">From systematic exposures</p>
              </div>
              <div className="p-4 border rounded-lg">
                <p className="text-sm text-gray-500 mb-1">Specific Return</p>
                <p className={`text-lg font-bold ${data.factor.specificReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatPercent(data.factor.specificReturn)}
                </p>
                <p className="text-xs text-gray-400 mt-1">Idiosyncratic / stock-specific</p>
              </div>
            </div>

            {/* Factor Contributions */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-3">Factor Contributions</h4>
              <div className="space-y-3">
                {data.factor.factors.map((factor) => {
                  const maxContribution = Math.max(...data.factor.factors.map((f) => Math.abs(f.contribution)));
                  const barWidth = Math.abs(factor.contribution) / maxContribution * 100;
                  const isPositive = factor.contribution >= 0;

                  return (
                    <div key={factor.factor} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-700 capitalize">{factor.factor.replace('_', ' ')}</span>
                        <span className={isPositive ? 'text-green-600' : 'text-red-600'}>
                          {formatBps(factor.contribution)}
                        </span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${isPositive ? 'bg-green-500' : 'bg-red-500'}`}
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-gray-400">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t">
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-500" />
              Top Contributors
            </h4>
            <div className="space-y-2">
              {data.topContributors.map((c) => (
                <div key={c.symbol} className="flex justify-between items-center p-2 bg-green-50 rounded">
                  <span className="font-medium text-gray-900">{c.symbol}</span>
                  <span className="text-green-600">{formatBps(c.contribution)}</span>
                </div>
              ))}
              {data.topContributors.length === 0 && (
                <p className="text-sm text-gray-500">No positive contributors</p>
              )}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-red-500" />
              Top Detractors
            </h4>
            <div className="space-y-2">
              {data.topDetractors.map((c) => (
                <div key={c.symbol} className="flex justify-between items-center p-2 bg-red-50 rounded">
                  <span className="font-medium text-gray-900">{c.symbol}</span>
                  <span className="text-red-600">{formatBps(c.contribution)}</span>
                </div>
              ))}
              {data.topDetractors.length === 0 && (
                <p className="text-sm text-gray-500">No negative detractors</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
