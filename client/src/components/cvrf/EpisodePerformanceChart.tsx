/**
 * Episode Performance Chart
 *
 * Line chart showing episode returns over time with Sharpe overlay
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
  Legend,
  ReferenceLine,
} from 'recharts';
import { BarChart3, TrendingUp } from 'lucide-react';
import { useCVRFEpisodes, useCVRFHistory } from '@/hooks/useCVRF';
import type { CVRFEpisode } from '@/types/cvrf';

type MetricView = 'returns' | 'sharpe' | 'drawdown';

interface ChartDataPoint {
  episode: number;
  label: string;
  return: number;
  returnPct: string;
  sharpe: number;
  maxDrawdown: number;
  drawdownPct: string;
  decisions: number;
  cumulativeReturn: number;
  cumulativePct: string;
}

function buildChartData(episodes: CVRFEpisode[]): ChartDataPoint[] {
  const completed = episodes
    .filter((e) => e.status === 'completed' && e.portfolioReturn !== undefined)
    .sort((a, b) => a.episodeNumber - b.episodeNumber);

  let cumulative = 1;
  return completed.map((ep) => {
    const ret = ep.portfolioReturn || 0;
    cumulative *= 1 + ret;

    return {
      episode: ep.episodeNumber,
      label: `Ep ${ep.episodeNumber}`,
      return: ret,
      returnPct: `${(ret * 100).toFixed(2)}%`,
      sharpe: ep.sharpeRatio || 0,
      maxDrawdown: Math.abs(ep.maxDrawdown || 0),
      drawdownPct: `${(Math.abs(ep.maxDrawdown || 0) * 100).toFixed(2)}%`,
      decisions: ep.decisionsCount,
      cumulativeReturn: cumulative - 1,
      cumulativePct: `${((cumulative - 1) * 100).toFixed(2)}%`,
    };
  });
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
}

function ChartTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;

  const data = payload[0]?.payload as ChartDataPoint;
  if (!data) return null;

  return (
    <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg shadow-lg p-3 text-sm">
      <div className="font-semibold text-[var(--color-text)] mb-2">{label}</div>
      <div className="space-y-1">
        <div className="flex justify-between gap-4">
          <span className="text-[var(--color-text-muted)]">Return:</span>
          <span className={data.return >= 0 ? 'text-green-600 font-mono' : 'text-red-600 font-mono'}>
            {data.returnPct}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-[var(--color-text-muted)]">Cumulative:</span>
          <span className="text-indigo-600 font-mono">{data.cumulativePct}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-[var(--color-text-muted)]">Sharpe:</span>
          <span className="text-[var(--color-text)] font-mono">{data.sharpe.toFixed(2)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-[var(--color-text-muted)]">Max DD:</span>
          <span className="text-red-600 font-mono">-{data.drawdownPct}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-[var(--color-text-muted)]">Decisions:</span>
          <span className="text-[var(--color-text)] font-mono">{data.decisions}</span>
        </div>
      </div>
    </div>
  );
}

export function EpisodePerformanceChart() {
  const { data: episodesData, isLoading } = useCVRFEpisodes();
  const [metric, setMetric] = useState<MetricView>('returns');

  const episodes = episodesData?.completed || [];
  const chartData = buildChartData(episodes);

  if (isLoading) {
    return (
      <div className="bg-[var(--color-bg)] rounded-xl border border-[var(--color-border)] p-6">
        <div className="h-6 bg-[var(--color-border)] rounded w-1/3 mb-4 animate-pulse" />
        <div className="h-64 bg-[var(--color-bg-secondary)] rounded animate-pulse" />
      </div>
    );
  }

  if (chartData.length < 2) {
    return (
      <div className="bg-[var(--color-bg)] rounded-xl border border-[var(--color-border)] p-6">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-5 h-5 text-indigo-500" />
          <h3 className="text-lg font-semibold text-[var(--color-text)]">Episode Performance</h3>
        </div>
        <div className="flex items-center justify-center h-48 text-[var(--color-text-muted)] text-sm">
          Complete at least 2 episodes to see performance trends
        </div>
      </div>
    );
  }

  const avgReturn = chartData.reduce((s, d) => s + d.return, 0) / chartData.length;
  const avgSharpe = chartData.reduce((s, d) => s + d.sharpe, 0) / chartData.length;
  const totalCumulative = chartData[chartData.length - 1]?.cumulativeReturn || 0;

  return (
    <div className="bg-[var(--color-bg)] rounded-xl border border-[var(--color-border)] p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-indigo-500" />
          <h3 className="text-lg font-semibold text-[var(--color-text)]">Episode Performance</h3>
        </div>
        <div className="flex gap-1 bg-[var(--color-bg-secondary)] rounded-lg p-0.5">
          {(['returns', 'sharpe', 'drawdown'] as MetricView[]).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                metric === m
                  ? 'bg-indigo-600 text-white'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
              }`}
            >
              {m === 'returns' ? 'Returns' : m === 'sharpe' ? 'Sharpe' : 'Drawdown'}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="p-3 bg-[var(--color-bg-tertiary)] rounded-lg text-center">
          <div className="text-xs text-[var(--color-text-muted)]">Cumulative Return</div>
          <div className={`text-xl font-bold ${totalCumulative >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {totalCumulative >= 0 ? '+' : ''}
            {(totalCumulative * 100).toFixed(2)}%
          </div>
        </div>
        <div className="p-3 bg-[var(--color-bg-tertiary)] rounded-lg text-center">
          <div className="text-xs text-[var(--color-text-muted)]">Avg Episode Return</div>
          <div className={`text-xl font-bold ${avgReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {avgReturn >= 0 ? '+' : ''}
            {(avgReturn * 100).toFixed(2)}%
          </div>
        </div>
        <div className="p-3 bg-[var(--color-bg-tertiary)] rounded-lg text-center">
          <div className="text-xs text-[var(--color-text-muted)]">Avg Sharpe Ratio</div>
          <div className="text-xl font-bold text-indigo-600">{avgSharpe.toFixed(2)}</div>
        </div>
      </div>

      {/* Chart */}
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light, #e5e7eb)" />
            <XAxis
              dataKey="label"
              tick={{ fill: 'var(--color-text-muted, #9ca3af)', fontSize: 12 }}
              axisLine={{ stroke: 'var(--color-border, #d1d5db)' }}
            />
            <YAxis
              tick={{ fill: 'var(--color-text-muted, #9ca3af)', fontSize: 12 }}
              axisLine={{ stroke: 'var(--color-border, #d1d5db)' }}
              tickFormatter={(v) =>
                metric === 'sharpe' ? v.toFixed(1) : `${(v * 100).toFixed(0)}%`
              }
            />
            <Tooltip content={<ChartTooltip />} />
            <ReferenceLine y={0} stroke="var(--color-border, #d1d5db)" strokeDasharray="2 2" />

            {metric === 'returns' && (
              <>
                <Bar
                  dataKey="return"
                  fill="#818cf8"
                  opacity={0.3}
                  radius={[4, 4, 0, 0]}
                  name="Episode Return"
                />
                <Line
                  type="monotone"
                  dataKey="cumulativeReturn"
                  stroke="#4f46e5"
                  strokeWidth={2}
                  dot={{ r: 4, fill: '#4f46e5' }}
                  name="Cumulative"
                />
              </>
            )}

            {metric === 'sharpe' && (
              <Line
                type="monotone"
                dataKey="sharpe"
                stroke="#8b5cf6"
                strokeWidth={2}
                dot={{ r: 4, fill: '#8b5cf6' }}
                name="Sharpe Ratio"
              />
            )}

            {metric === 'drawdown' && (
              <Bar
                dataKey="maxDrawdown"
                fill="#ef4444"
                opacity={0.5}
                radius={[4, 4, 0, 0]}
                name="Max Drawdown"
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
