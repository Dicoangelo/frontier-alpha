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
        <div>
          <p className="mono text-[10px] sm:text-xs tracking-[0.3em] uppercase text-theme-muted">
            Greeks Heatmap
          </p>
          <h2 className="mt-1 text-lg font-semibold text-theme flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[var(--color-accent)]" aria-hidden="true" />
            {greekLabels[selectedGreek]} surface
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex glass-slab-floating rounded-lg p-1 gap-1"
            role="group"
            aria-label="Option side selector"
          >
            {(['call', 'put'] as const).map((side) => {
              const active = optionSide === side;
              return (
                <button
                  key={side}
                  onClick={() => setOptionSide(side)}
                  aria-pressed={active}
                  className="px-3 py-1.5 min-h-[36px] mono text-[10px] tracking-[0.2em] uppercase rounded-md animate-press transition-[color,background-color] duration-200"
                  style={
                    active
                      ? side === 'call'
                        ? {
                            backgroundColor: 'color-mix(in srgb, var(--color-positive) 12%, transparent)',
                            color: 'var(--color-positive)',
                          }
                        : {
                            backgroundColor: 'color-mix(in srgb, var(--color-negative) 12%, transparent)',
                            color: 'var(--color-negative)',
                          }
                      : { color: 'var(--color-text-secondary)' }
                  }
                >
                  {side === 'call' ? 'Calls' : 'Puts'}
                </button>
              );
            })}
          </div>
          <div
            className="flex glass-slab-floating rounded-lg p-1 gap-1"
            role="group"
            aria-label="Greek selector"
          >
            {(['delta', 'gamma', 'theta', 'vega'] as const).map((greek) => {
              const active = selectedGreek === greek;
              return (
                <button
                  key={greek}
                  onClick={() => setSelectedGreek(greek)}
                  aria-pressed={active}
                  className="px-2.5 py-1.5 min-h-[36px] mono text-[10px] tracking-[0.2em] uppercase rounded-md animate-press transition-[color,background-color] duration-200"
                  style={
                    active
                      ? {
                          backgroundColor: 'var(--color-accent-light)',
                          color: 'var(--color-accent)',
                        }
                      : { color: 'var(--color-text-secondary)' }
                  }
                >
                  {greekLabels[greek]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="glass-slab-floating rounded-xl overflow-hidden" style={{ minHeight: 280 }}>
        <div className="overflow-x-auto animate-fade-in">
          <table
            className="w-full text-xs"
            role="img"
            aria-label={`${greekLabels[selectedGreek]} heatmap for ${optionSide}s across strikes and expirations`}
          >
            <thead>
              <tr className="border-b border-theme-light">
                <th className="text-left mono text-[10px] tracking-[0.2em] uppercase px-2 py-2 text-theme-muted sticky left-0 bg-[var(--color-bg-secondary)] z-10">
                  Strike
                </th>
                {expirations.map((exp) => (
                  <th
                    key={exp}
                    className="text-center mono text-[10px] tracking-[0.2em] uppercase px-2 py-2 text-theme-muted"
                  >
                    {EXPIRATION_LABELS[exp]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {strikes.map((strike) => {
                const isATM = Math.abs(strike - UNDERLYING_PRICE) <= 1.25;
                return (
                  <tr key={strike} className="border-b border-theme-light">
                    <td
                      className={`px-2 py-2 mono font-medium tabular-nums sticky left-0 bg-[var(--color-bg-secondary)] z-10 ${
                        isATM ? 'text-[var(--color-accent)] font-bold' : 'text-theme'
                      }`}
                    >
                      {strike.toFixed(1)}
                    </td>
                    {expirations.map((exp) => {
                      const cell = cellMap.get(`${strike}-${exp}`);
                      const value = cell ? (cell[greekKey] as number) : 0;
                      return (
                        <td
                          key={exp}
                          className="text-center mono px-2 py-2 tabular-nums"
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
      </div>
    </Card>
  );
}

export const GreeksHeatmap = React.memo(GreeksHeatmapInner);
export default GreeksHeatmap;
