import React, { useState, useMemo, useRef } from 'react';
import { useThemeStore } from '@/stores/themeStore';
import type { Position } from '@/types';

// Read chart palette from CSS variables at render time (theme-reactive)
function getSegmentColors(): string[] {
  const cs = getComputedStyle(document.documentElement);
  return [
    cs.getPropertyValue('--chart-primary').trim(),
    cs.getPropertyValue('--chart-secondary').trim(),
    cs.getPropertyValue('--chart-accent').trim(),
    cs.getPropertyValue('--chart-danger').trim(),
    cs.getPropertyValue('--chart-purple').trim(),
    cs.getPropertyValue('--chart-cyan').trim(),
  ];
}

interface WeightAllocationProps {
  positions: Position[];
}

interface Segment {
  symbol: string;
  weight: number;
  value: number;
  color: string;
  dashArray: string;
  dashOffset: number;
}

function buildSegments(positions: Position[], segmentColors: string[]): Segment[] {
  const r = 54;
  const circumference = 2 * Math.PI * r;

  const sorted = [...positions].sort((a, b) => b.weight - a.weight);
  const top = sorted.slice(0, 6);
  const rest = sorted.slice(6);

  const items = [...top];
  if (rest.length > 0) {
    const otherWeight = rest.reduce((acc, p) => acc + p.weight, 0);
    const otherValue = rest.reduce((acc, p) => acc + p.shares * p.currentPrice, 0);
    items.push({ symbol: 'Other', shares: 0, weight: otherWeight, costBasis: 0, currentPrice: 0, unrealizedPnL: 0, value: otherValue } as Position & { value: number });
  }

  const totalWeight = items.reduce((acc, p) => acc + p.weight, 0) || 1;

  let offset = 0;
  return items.map((p, i) => {
    const normalizedWeight = p.weight / totalWeight;
    const dash = normalizedWeight * circumference;
    const gap = circumference - dash;
    const seg: Segment = {
      symbol: p.symbol,
      weight: normalizedWeight,
      value: (p as Position & { value?: number }).value ?? p.shares * p.currentPrice,
      color: segmentColors[i % segmentColors.length],
      dashArray: `${dash.toFixed(3)} ${gap.toFixed(3)}`,
      dashOffset: -offset,
    };
    offset += dash;
    return seg;
  });
}

export const WeightAllocation = React.memo(function WeightAllocation({ positions }: WeightAllocationProps) {
  const [hoveredSymbol, setHoveredSymbol] = useState<string | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const legendRef = useRef<HTMLDivElement>(null);
  const isDark = useThemeStore((s) => s.resolved === 'dark');

  const SIZE = 160;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const r = 54;
  const strokeWidth = 20;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const segmentColors = useMemo(() => getSegmentColors(), [isDark]);
  const segments = useMemo(() => buildSegments(positions, segmentColors), [positions, segmentColors]);
  const activeSymbol = hoveredSymbol ?? selectedSymbol;
  const hovered = activeSymbol ? segments.find(s => s.symbol === activeSymbol) : null;
  const hasSelection = segments.some(segment => segment.symbol === selectedSymbol);

  if (positions.length === 0) return null;

  return (
    <section className="desk-panel allocation-panel" aria-labelledby="allocation-heading">
      <header className="allocation-header"><h2 id="allocation-heading">Holdings mix</h2><p>Invested holdings · cash excluded</p></header>
      <div className="allocation-body">
        {/* SVG Donut */}
        <div className="relative flex-shrink-0" style={{ width: 144, height: 144, flexShrink: 0 }}>
          <svg
            width="144"
            height="144"
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            aria-label="Portfolio weight allocation donut chart"
            role="img"
          >
            {/* Track ring */}
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke="var(--color-border-light)"
              strokeWidth={strokeWidth}
            />

            {/* Segments — rotate so first segment starts at top */}
            <g transform={`rotate(-90 ${cx} ${cy})`}>
              {segments.map((seg) => (
                <circle
                  key={seg.symbol}
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={activeSymbol === seg.symbol ? strokeWidth + 4 : strokeWidth}
                  strokeDasharray={seg.dashArray}
                  strokeDashoffset={seg.dashOffset}
                  strokeLinecap="butt"
                  className="cursor-pointer"
                  style={{ transition: 'stroke-width 0.15s ease' }}
                  onMouseEnter={() => setHoveredSymbol(seg.symbol)}
                  onMouseLeave={() => setHoveredSymbol(null)}
                  onTouchStart={() => setHoveredSymbol(seg.symbol)}
                  onTouchEnd={() => setHoveredSymbol(null)}
                  aria-label={`${seg.symbol}: ${(seg.weight * 100).toFixed(1)}%`}
                />
              ))}
            </g>

            {/* Center text */}
            {hovered ? (
              <>
                <text
                  x={cx}
                  y={cy - 14}
                  textAnchor="middle"
                  className="fill-[var(--color-text)] font-semibold"
                  fontSize="15"
                  fontWeight="600"
                  fill="var(--color-text)"
                >
                  {hovered.symbol}
                </text>
                <text
                  x={cx}
                  y={cy + 5}
                  textAnchor="middle"
                  fontSize="14"
                  fill="var(--color-text-muted)"
                >
                  {(hovered.weight * 100).toFixed(1)}%
                </text>
                <text
                  x={cx}
                  y={cy + 24}
                  textAnchor="middle"
                  fontSize="14"
                  fill="var(--color-text-muted)"
                >
                  ${hovered.value >= 1000 ? `${(hovered.value / 1000).toFixed(1)}k` : hovered.value.toFixed(0)}
                </text>
              </>
            ) : (
              <>
                <text
                  x={cx}
                  y={cy - 2}
                  textAnchor="middle"
                  fontSize="16"
                  fontWeight="700"
                  fill="var(--color-text)"
                >
                  {positions.length}
                </text>
                <text
                  x={cx}
                  y={cy + 14}
                  textAnchor="middle"
                  fontSize="14"
                  fill="var(--color-text-muted)"
                >
                  {positions.length === 1 ? 'position' : 'positions'}
                </text>
              </>
            )}
          </svg>
        </div>

        {/* Legend */}
        <div ref={legendRef} className="allocation-legend">
          {segments.map((seg) => (
            <button
              key={seg.symbol}
              type="button"
              className={`allocation-row ${activeSymbol === seg.symbol ? 'is-active' : ''}`}
              onMouseEnter={() => setHoveredSymbol(seg.symbol)}
              onMouseLeave={() => setHoveredSymbol(null)}
              onFocus={() => setHoveredSymbol(seg.symbol)}
              onBlur={() => setHoveredSymbol(null)}
              onClick={() => setSelectedSymbol(current => current === seg.symbol ? null : seg.symbol)}
              aria-pressed={selectedSymbol === seg.symbol}
              aria-label={`Inspect ${seg.symbol} allocation: ${(seg.weight * 100).toFixed(1)}% of holdings, ${seg.value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}`}
            >
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: seg.color }}
              />
              <span className="allocation-symbol">{seg.symbol}</span>
              <span className="allocation-bar"><i style={{ width: `${Math.max(0, Math.min(100, seg.weight * 100))}%`, backgroundColor: seg.color }} /></span>
              <span className="allocation-weight">{(seg.weight * 100).toFixed(1)}%</span>
            </button>
          ))}
        </div>
      </div>
      <footer className="allocation-footer">Percentages are normalized across holdings, excluding cash. Select a symbol to pin its details.{hasSelection && <button type="button" onClick={() => { legendRef.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.focus(); setSelectedSymbol(null); setHoveredSymbol(null); }}>Clear selection</button>}</footer>
    </section>
  );
});
