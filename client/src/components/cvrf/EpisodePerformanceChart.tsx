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
  ReferenceLine,
} from 'recharts';
import { BarChart3 } from 'lucide-react';
import { useCVRFEpisodes } from '@/hooks/useCVRF';
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
    .filter((e) => e && e.status === 'completed' && e.portfolioReturn !== undefined)
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
  payload?: { payload: ChartDataPoint }[];
  label?: string;
}

function ChartTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;

  const data = payload[0]?.payload as ChartDataPoint;
  if (!data) return null;

  return (
    <div className="backdrop-blur-md bg-[var(--color-bg-tooltip)] text-[var(--color-text-inverse)] border border-theme-light rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="mono text-[10px] tracking-[0.3em] uppercase opacity-70 mb-1">{label}</p>
      <div className="space-y-1">
        <div className="flex justify-between gap-4">
          <span className="opacity-70">Return</span>
          <span className={`mono tabular-nums font-semibold ${data.return >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}>
            {data.returnPct}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="opacity-70">Cumulative</span>
          <span className="mono tabular-nums font-semibold">{data.cumulativePct}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="opacity-70">Sharpe</span>
          <span className="mono tabular-nums">{data.sharpe.toFixed(2)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="opacity-70">Max DD</span>
          <span className="mono tabular-nums text-[var(--color-negative)]">-{data.drawdownPct}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="opacity-70">Decisions</span>
          <span className="mono tabular-nums">{data.decisions}</span>
        </div>
      </div>
    </div>
  );
}

export function EpisodePerformanceChart() {
  const { data: episodesData, isLoading } = useCVRFEpisodes();
  const [metric, setMetric] = useState<MetricView>('returns');

  const episodes = episodesData?.completed ?? [];
  const chartData = buildChartData(episodes);

  if (isLoading) {
    return (
      <div className="glass-slab rounded-2xl p-6 sm:p-8">
        <div className="h-6 bg-[var(--color-border)] rounded w-1/3 mb-4 animate-shimmer" />
        <div className="h-64 bg-[var(--color-bg-secondary)] rounded animate-shimmer" />
      </div>
    );
  }

  if (chartData.length < 2) {
    return (
      <div className="glass-slab rounded-2xl p-6 sm:p-8">
        <div className="mb-4">
          <p className="mono text-[10px] sm:text-xs tracking-[0.3em] uppercase text-theme-muted mb-2">
            Performance Curve
          </p>
          <h3 className="text-lg font-semibold text-theme flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[var(--color-accent)]" aria-hidden="true" />
            Episode Performance
          </h3>
        </div>
        <div className="flex items-center justify-center h-48 text-theme-muted text-sm">
          Complete at least 2 episodes to see performance trends
        </div>
      </div>
    );
  }

  const avgReturn = chartData.reduce((s, d) => s + d.return, 0) / chartData.length;
  const avgSharpe = chartData.reduce((s, d) => s + d.sharpe, 0) / chartData.length;
  const totalCumulative = chartData[chartData.length - 1]?.cumulativeReturn || 0;

  return (
    <div className="glass-slab rounded-2xl p-6 sm:p-8 animate-enter">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <p className="mono text-[10px] sm:text-xs tracking-[0.3em] uppercase text-theme-muted mb-2">
            Performance Curve
          </p>
          <h3 className="text-lg font-semibold text-theme flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[var(--color-accent)]" aria-hidden="true" />
            Episode Performance
          </h3>
        </div>
        {/* Segmented control — EquityCurve pattern */}
        <div
          className="flex gap-1 glass-slab-floating rounded-lg p-1"
          role="group"
          aria-label="Performance metric"
        >
          {(['returns', 'sharpe', 'drawdown'] as MetricView[]).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={`px-3 py-1.5 min-h-[32px] text-[10px] mono tracking-[0.2em] uppercase rounded-md animate-press transition-[color,background-color] duration-200 ${
                metric === m
                  ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)]'
                  : 'text-theme-secondary hover:text-theme'
              }`}
              aria-pressed={metric === m}
            >
              {m === 'returns' ? 'Returns' : m === 'sharpe' ? 'Sharpe' : 'Drawdown'}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4 mb-4 animate-stagger">
        <div className="glass-slab-floating rounded-xl p-3 text-center animate-enter">
          <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Cumulative</p>
          <p className={`text-xl font-bold tabular-nums mt-0.5 ${totalCumulative >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}>
            {totalCumulative >= 0 ? '+' : ''}
            {(totalCumulative * 100).toFixed(2)}%
          </p>
        </div>
        <div className="glass-slab-floating rounded-xl p-3 text-center animate-enter">
          <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Avg Episode</p>
          <p className={`text-xl font-bold tabular-nums mt-0.5 ${avgReturn >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}>
            {avgReturn >= 0 ? '+' : ''}
            {(avgReturn * 100).toFixed(2)}%
          </p>
        </div>
        <div className="glass-slab-floating rounded-xl p-3 text-center animate-enter">
          <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Avg Sharpe</p>
          <p className="text-xl font-bold text-[var(--color-accent)] tabular-nums mt-0.5">{avgSharpe.toFixed(2)}</p>
        </div>
      </div>

      {/* Chart */}
      <div
        className="min-h-[288px] h-72"
        role="img"
        aria-label={`Episode performance chart showing ${metric} across ${chartData.length} episodes`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light, var(--color-border))" />
            <XAxis
              dataKey="label"
              tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
              axisLine={{ stroke: 'var(--color-border)' }}
            />
            <YAxis
              tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
              axisLine={{ stroke: 'var(--color-border)' }}
              tickFormatter={(v) =>
                metric === 'sharpe' ? v.toFixed(1) : `${(v * 100).toFixed(0)}%`
              }
            />
            <Tooltip content={<ChartTooltip />} />
            <ReferenceLine y={0} stroke="var(--color-border)" strokeDasharray="2 2" />

            {metric === 'returns' && (
              <>
                <Bar
                  dataKey="return"
                  fill="var(--color-accent)"
                  opacity={0.3}
                  radius={[4, 4, 0, 0]}
                  name="Episode Return"
                />
                <Line
                  type="monotone"
                  dataKey="cumulativeReturn"
                  stroke="var(--color-accent)"
                  strokeWidth={2}
                  dot={{ r: 4, fill: 'var(--color-accent)' }}
                  name="Cumulative"
                />
              </>
            )}

            {metric === 'sharpe' && (
              <Line
                type="monotone"
                dataKey="sharpe"
                stroke="var(--chart-secondary)"
                strokeWidth={2}
                dot={{ r: 4, fill: 'var(--chart-secondary)' }}
                name="Sharpe Ratio"
              />
            )}

            {metric === 'drawdown' && (
              <Bar
                dataKey="maxDrawdown"
                fill="var(--color-negative)"
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
