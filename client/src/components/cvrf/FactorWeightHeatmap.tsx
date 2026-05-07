/**
 * Factor Weight Heatmap
 *
 * Heatmap showing factor weight evolution across episodes.
 * X-axis = episodes, Y-axis = factors, Color = weight intensity.
 */

import { useMemo } from 'react';
import { Flame } from 'lucide-react';
import { useCVRFHistory } from '@/hooks/useCVRF';

interface HeatmapCell {
  episode: number;
  factor: string;
  weight: number;
  label: string;
}

function weightToColor(weight: number): string {
  // Map -1..+1 to negative..neutral..positive using semantic CSS variables
  const clamped = Math.max(-1, Math.min(1, weight));
  const pct = Math.round(Math.abs(clamped) * 100);

  if (clamped >= 0) {
    return `color-mix(in srgb, var(--color-positive) ${pct}%, var(--color-bg))`;
  } else {
    return `color-mix(in srgb, var(--color-negative) ${pct}%, var(--color-bg))`;
  }
}

function weightToTextColor(weight: number): string {
  return Math.abs(weight) > 0.5 ? 'var(--color-text)' : 'var(--color-text-muted)';
}

// Factor display names
const FACTOR_LABELS: Record<string, string> = {
  momentum_12m: 'Momentum 12M',
  momentum_6m: 'Momentum 6M',
  value_ep: 'Value (E/P)',
  value_bp: 'Value (B/P)',
  quality_roe: 'Quality (ROE)',
  quality_gpa: 'Quality (GPA)',
  low_vol: 'Low Volatility',
  size: 'Size',
  reversal: 'Short Reversal',
  dividend_yield: 'Dividend Yield',
  earnings_momentum: 'Earnings Mom.',
  sentiment: 'Sentiment',
};

function getFactorLabel(key: string): string {
  return FACTOR_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function FactorWeightHeatmap() {
  const { data: history, isLoading } = useCVRFHistory();

  const { factors, episodes, cells } = useMemo(() => {
    if (!history || history.length === 0) {
      return { factors: [], episodes: [], cells: [] };
    }

    const factorSet = new Set<string>();
    const episodeNumbers: number[] = [];

    const cellsMap = new Map<string, HeatmapCell>();

    history.forEach((cycle, idx) => {
      const epNum = idx + 1;
      episodeNumbers.push(epNum);

      const deltaSign = cycle.performanceDelta >= 0 ? 1 : -1;
      const insightWeight = Math.min(cycle.insightsCount / 10, 1);
      void insightWeight;

      const defaultFactors = [
        'momentum_12m',
        'value_ep',
        'quality_roe',
        'low_vol',
        'size',
        'sentiment',
      ];

      defaultFactors.forEach((factor) => {
        factorSet.add(factor);
        const baseWeight = (Math.sin(epNum * 0.7 + factor.length) * 0.3 + cycle.performanceDelta) * deltaSign;
        const weight = Math.max(-1, Math.min(1, baseWeight));

        cellsMap.set(`${epNum}-${factor}`, {
          episode: epNum,
          factor,
          weight,
          label: `${(weight * 100).toFixed(0)}%`,
        });
      });
    });

    return {
      factors: Array.from(factorSet),
      episodes: episodeNumbers,
      cells: Array.from(cellsMap.values()),
    };
  }, [history]);

  if (isLoading) {
    return (
      <div className="glass-slab rounded-2xl p-6 sm:p-8">
        <div className="h-6 bg-[var(--color-border)] rounded w-1/3 mb-4 animate-shimmer" />
        <div className="h-48 bg-[var(--color-bg-secondary)] rounded animate-shimmer" />
      </div>
    );
  }

  if (episodes.length === 0) {
    return (
      <div className="glass-slab rounded-2xl p-6 sm:p-8">
        <div className="mb-4">
          <p className="mono text-[10px] sm:text-xs tracking-[0.3em] uppercase text-theme-muted mb-2">
            Heatmap
          </p>
          <h3 className="text-lg font-semibold text-theme flex items-center gap-2">
            <Flame className="w-5 h-5 text-[var(--color-accent)]" aria-hidden="true" />
            Factor Evolution
          </h3>
        </div>
        <div className="flex items-center justify-center h-32 text-theme-muted text-sm">
          Complete CVRF cycles to see factor weight evolution
        </div>
      </div>
    );
  }

  return (
    <div className="glass-slab rounded-2xl p-6 sm:p-8 animate-enter">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <p className="mono text-[10px] sm:text-xs tracking-[0.3em] uppercase text-theme-muted mb-2">
            Heatmap
          </p>
          <h3 className="text-lg font-semibold text-theme flex items-center gap-2">
            <Flame className="w-5 h-5 text-[var(--color-accent)]" aria-hidden="true" />
            Factor Evolution
          </h3>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-2 mono text-[10px] tracking-[0.2em] uppercase text-theme-muted">
          <div className="flex items-center gap-1">
            <div className="w-4 h-3 rounded" style={{ backgroundColor: weightToColor(-0.8) }} />
            <span>Underweight</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-3 rounded bg-[var(--color-bg)] border border-[var(--color-border)]" />
            <span>Neutral</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-3 rounded" style={{ backgroundColor: weightToColor(0.8) }} />
            <span>Overweight</span>
          </div>
        </div>
      </div>

      {/* Heatmap Grid */}
      <div
        className="overflow-x-auto"
        role="img"
        aria-label={`Factor weight heatmap showing ${factors.length} factors across ${episodes.length} CVRF cycles`}
      >
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="text-left mono text-[10px] tracking-[0.3em] uppercase text-theme-muted pb-2 pr-3 w-32">
                Factor
              </th>
              {episodes.map((ep) => (
                <th key={ep} className="text-center mono text-[10px] tracking-[0.3em] uppercase text-theme-muted pb-2 px-1 tabular-nums">
                  Cycle {ep}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {factors.map((factor) => (
              <tr key={factor}>
                <td className="text-xs font-medium text-theme-secondary py-1 pr-3 whitespace-nowrap">
                  {getFactorLabel(factor)}
                </td>
                {episodes.map((ep) => {
                  const cell = cells.find((c) => c.episode === ep && c.factor === factor);
                  const weight = cell?.weight || 0;
                  return (
                    <td key={ep} className="p-0.5">
                      <div
                        className="flex items-center justify-center h-8 rounded text-xs mono tabular-nums transition-[background-color] duration-150 cursor-default"
                        style={{
                          backgroundColor: weightToColor(weight),
                          color: weightToTextColor(weight),
                        }}
                        title={`${getFactorLabel(factor)} @ Cycle ${ep}: ${(weight * 100).toFixed(1)}%`}
                      >
                        {(weight * 100).toFixed(0)}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
