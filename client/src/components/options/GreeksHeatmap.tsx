/**
 * GreeksHeatmap — Delta/gamma/theta/vega heatmap by strike and expiration.
 * Extracted from Options.tsx (Story UXR2-004).
 */

import React, { useState, useMemo, useCallback } from 'react';
import { BarChart3 } from 'lucide-react';
import { Card } from '@/components/shared/Card';
import type { OptionType, GreekType, GreeksHeatmapCell } from './options-types';
import { UNDERLYING_PRICE, EXPIRATION_LABELS } from './options-types';

interface GreeksHeatmapProps {
  cells: GreeksHeatmapCell[];
}

function GreeksHeatmapInner({ cells }: GreeksHeatmapProps) {
  const [selectedGreek, setSelectedGreek] = useState<GreekType>('delta');
  const [optionSide, setOptionSide] = useState<OptionType>('call');

  const greekKey = useMemo(
    () => `${optionSide}${selectedGreek.charAt(0).toUpperCase()}${selectedGreek.slice(1)}` as keyof GreeksHeatmapCell,
    [optionSide, selectedGreek]
  );

  const expirations = useMemo(() => [...new Set(cells.map((c) => c.expiration))], [cells]);
  const strikes = useMemo(() => [...new Set(cells.map((c) => c.strike))].sort((a, b) => a - b), [cells]);

  const cellMap = useMemo(() => {
    const map = new Map<string, GreeksHeatmapCell>();
    for (const cell of cells) {
      map.set(`${cell.strike}-${cell.expiration}`, cell);
    }
    return map;
  }, [cells]);

  const values = useMemo(() => cells.map((c) => c[greekKey] as number), [cells, greekKey]);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);

  const getColor = useCallback(
    (value: number) => {
      if (selectedGreek === 'theta') {
        const normalized = maxVal === minVal ? 0.5 : (value - minVal) / (maxVal - minVal);
        const r = Math.round(220 - normalized * 170);
        const g = Math.round(50 + normalized * 170);
        const b = Math.round(50 + normalized * 120);
        return `rgb(${r},${g},${b})`;
      }
      const normalized = maxVal === minVal ? 0.5 : (value - minVal) / (maxVal - minVal);
      const r = Math.round(60 + (1 - normalized) * 100);
      const g = Math.round(80 + normalized * 140);
      const b = Math.round(180 - normalized * 80);
      return `rgb(${r},${g},${b})`;
    },
    [selectedGreek, minVal, maxVal]
  );

  const greekLabels: Record<GreekType, string> = {
    delta: 'Delta',
    gamma: 'Gamma',
    theta: 'Theta',
    vega: 'Vega',
  };

  return (
    <Card>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold text-[var(--color-text)] flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-[var(--color-accent)]" />
          Greeks Heatmap
        </h2>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden" role="group" aria-label="Option side selector">
            {(['call', 'put'] as const).map((side) => (
              <button
                key={side}
                onClick={() => setOptionSide(side)}
                aria-pressed={optionSide === side}
                className={`px-3 py-2 text-xs font-medium min-h-[44px] transition-colors active:scale-[0.97] ${
                  optionSide === side
                    ? 'bg-[var(--color-bg-secondary)] text-[var(--color-text)]'
                    : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                }`}
                style={
                  optionSide === side
                    ? side === 'call'
                      ? { backgroundColor: 'color-mix(in srgb, var(--color-positive) 10%, transparent)', color: 'var(--color-positive)' }
                      : { backgroundColor: 'color-mix(in srgb, var(--color-negative) 10%, transparent)', color: 'var(--color-negative)' }
                    : undefined
                }
              >
                {side === 'call' ? 'Calls' : 'Puts'}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden" role="group" aria-label="Greek selector">
            {(['delta', 'gamma', 'theta', 'vega'] as const).map((greek) => (
              <button
                key={greek}
                onClick={() => setSelectedGreek(greek)}
                aria-pressed={selectedGreek === greek}
                className={`px-2.5 py-2 text-xs font-medium min-h-[44px] transition-colors active:scale-[0.97] ${
                  selectedGreek === greek
                    ? 'bg-[var(--color-bg-secondary)] text-[var(--color-text)]'
                    : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                }`}
                style={
                  selectedGreek === greek
                    ? { backgroundColor: 'color-mix(in srgb, var(--color-accent) 10%, transparent)', color: 'var(--color-accent)' }
                    : undefined
                }
              >
                {greekLabels[greek]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto -mx-6 px-6 animate-fade-in">
        <table
          className="w-full text-xs"
          role="img"
          aria-label={`${greekLabels[selectedGreek]} heatmap for ${optionSide}s across strikes and expirations`}
        >
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <th className="text-left px-2 py-2 text-[var(--color-text-muted)] font-medium sticky left-0 bg-[var(--color-bg)] z-10">
                Strike
              </th>
              {expirations.map((exp) => (
                <th key={exp} className="text-center px-2 py-2 text-[var(--color-text-muted)] font-medium">
                  {EXPIRATION_LABELS[exp]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {strikes.map((strike) => {
              const isATM = Math.abs(strike - UNDERLYING_PRICE) <= 1.25;
              return (
                <tr key={strike} className="border-b border-[var(--color-border)]">
                  <td className={`px-2 py-2 font-mono font-medium sticky left-0 bg-[var(--color-bg)] z-10 ${
                    isATM ? 'text-[var(--color-accent)] font-bold' : 'text-[var(--color-text)]'
                  }`}>
                    {strike.toFixed(1)}
                  </td>
                  {expirations.map((exp) => {
                    const cell = cellMap.get(`${strike}-${exp}`);
                    const value = cell ? (cell[greekKey] as number) : 0;
                    return (
                      <td
                        key={exp}
                        className="text-center px-2 py-2 font-mono"
                        style={{ backgroundColor: getColor(value), color: 'var(--color-text-inverse, #fff)' }}
                        title={`Strike ${strike}, ${EXPIRATION_LABELS[exp]}: ${value.toFixed(4)}`}
                      >
                        {selectedGreek === 'gamma' ? value.toFixed(5) : value.toFixed(3)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export const GreeksHeatmap = React.memo(GreeksHeatmapInner);
export default GreeksHeatmap;
