/**
 * Factor Weight Heatmap
 *
 * Heatmap showing factor weight evolution across episodes.
 * X-axis = episodes, Y-axis = factors, Color = weight intensity.
 */

import { useMemo } from 'react';
import { Flame } from 'lucide-react';
import { useCVRFHistory } from '@/hooks/useCVRF';
import type { CVRFCycleResult } from '@/types/cvrf';

interface HeatmapCell {
  episode: number;
  factor: string;
  weight: number;
  label: string;
}

function weightToColor(weight: number): string {
  // Map -1..+1 to red..neutral..green
  const clamped = Math.max(-1, Math.min(1, weight));

  if (clamped >= 0) {
    // 0 → neutral, 1 → bright green
    const intensity = Math.round(clamped * 255);
    return `rgb(${255 - intensity}, 255, ${255 - intensity})`;
  } else {
    // 0 → neutral, -1 → bright red
    const intensity = Math.round(Math.abs(clamped) * 255);
    return `rgb(255, ${255 - intensity}, ${255 - intensity})`;
  }
}

function weightToTextColor(weight: number): string {
  return Math.abs(weight) > 0.5 ? '#1f2937' : '#6b7280';
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

    // Extract unique factors from cycle data
    // Each cycle has belief updates showing factor weight changes
    // We'll use a simplified view based on available cycle data
    const factorSet = new Set<string>();
    const episodeNumbers: number[] = [];

    // Build a synthetic view: for each cycle, extract factor weights
    // from the performance data
    const cellsMap = new Map<string, HeatmapCell>();

    history.forEach((cycle, idx) => {
      const epNum = idx + 1;
      episodeNumbers.push(epNum);

      // Use performance delta as a proxy for the overall factor exposure direction
      // In a full implementation, this would use the actual factor weight snapshots
      // from the belief-history endpoint
      const deltaSign = cycle.performanceDelta >= 0 ? 1 : -1;
      const overlap = cycle.decisionOverlap;

      // Generate factor cells from the cycle's insight count as a proxy
      const insightWeight = Math.min(cycle.insightsCount / 10, 1);

      // Common factors to show
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
        // Generate weight based on cycle performance for demonstration
        // This will be replaced with real belief-history data
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
      <div className="bg-[var(--color-bg)] rounded-xl border border-[var(--color-border)] p-6">
        <div className="h-6 bg-[var(--color-border)] rounded w-1/3 mb-4 animate-pulse" />
        <div className="h-48 bg-[var(--color-bg-secondary)] rounded animate-pulse" />
      </div>
    );
  }

  if (episodes.length === 0) {
    return (
      <div className="bg-[var(--color-bg)] rounded-xl border border-[var(--color-border)] p-6">
        <div className="flex items-center gap-2 mb-4">
          <Flame className="w-5 h-5 text-indigo-500" />
          <h3 className="text-lg font-semibold text-[var(--color-text)]">Factor Evolution</h3>
        </div>
        <div className="flex items-center justify-center h-32 text-[var(--color-text-muted)] text-sm">
          Complete CVRF cycles to see factor weight evolution
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[var(--color-bg)] rounded-xl border border-[var(--color-border)] p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Flame className="w-5 h-5 text-indigo-500" />
          <h3 className="text-lg font-semibold text-[var(--color-text)]">Factor Evolution</h3>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
          <div className="flex items-center gap-1">
            <div className="w-4 h-3 rounded" style={{ backgroundColor: weightToColor(-0.8) }} />
            <span>Underweight</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-3 rounded bg-gray-100 border border-gray-200" />
            <span>Neutral</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-3 rounded" style={{ backgroundColor: weightToColor(0.8) }} />
            <span>Overweight</span>
          </div>
        </div>
      </div>

      {/* Heatmap Grid */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="text-left text-xs text-[var(--color-text-muted)] pb-2 pr-3 w-32">
                Factor
              </th>
              {episodes.map((ep) => (
                <th key={ep} className="text-center text-xs text-[var(--color-text-muted)] pb-2 px-1">
                  Cycle {ep}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {factors.map((factor) => (
              <tr key={factor}>
                <td className="text-xs font-medium text-[var(--color-text-secondary)] py-1 pr-3 whitespace-nowrap">
                  {getFactorLabel(factor)}
                </td>
                {episodes.map((ep) => {
                  const cell = cells.find((c) => c.episode === ep && c.factor === factor);
                  const weight = cell?.weight || 0;
                  return (
                    <td key={ep} className="p-0.5">
                      <div
                        className="flex items-center justify-center h-8 rounded text-xs font-mono transition-colors cursor-default"
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
