import React, { useState, useMemo } from 'react';
import { Card } from '@/components/shared/Card';
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
  const isDark = useThemeStore((s) => s.resolved === 'dark');

  const SIZE = 160;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const r = 54;
  const strokeWidth = 20;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const segmentColors = useMemo(() => getSegmentColors(), [isDark]);
  const segments = useMemo(() => buildSegments(positions, segmentColors), [positions, segmentColors]);
  const hovered = hoveredSymbol ? segments.find(s => s.symbol === hoveredSymbol) : null;

  if (positions.length === 0) return null;

  return (
    <Card title="Weight allocation">
      <div className="flex flex-wrap items-center justify-center gap-5">
        {/* SVG Donut */}
        <div className="relative flex-shrink-0" style={{ minWidth: 160, minHeight: 160 }}>
          <svg
            width={SIZE}
            height={SIZE}
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
                  strokeWidth={hoveredSymbol === seg.symbol ? strokeWidth + 4 : strokeWidth}
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
                  y={cy - 8}
                  textAnchor="middle"
                  className="fill-[var(--color-text)] font-semibold"
                  fontSize="11"
                  fontWeight="600"
                  fill="var(--color-text)"
                >
                  {hovered.symbol}
                </text>
                <text
                  x={cx}
                  y={cy + 6}
                  textAnchor="middle"
                  fontSize="10"
                  fill="var(--color-text-muted)"
                >
                  {(hovered.weight * 100).toFixed(1)}%
                </text>
                <text
                  x={cx}
                  y={cy + 20}
                  textAnchor="middle"
                  fontSize="9"
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
                  fontSize="9"
                  fill="var(--color-text-muted)"
                >
                  {positions.length === 1 ? 'position' : 'positions'}
                </text>
              </>
            )}
          </svg>
        </div>

        {/* Legend */}
        <div className="flex flex-col gap-2 flex-1 basis-36 min-w-0">
          {segments.map((seg) => (
            <div
              key={seg.symbol}
              className={`flex items-center gap-2 cursor-pointer rounded px-2 py-1 transition-colors ${hoveredSymbol === seg.symbol ? 'bg-[var(--color-bg-tertiary)]' : ''}`}
              onMouseEnter={() => setHoveredSymbol(seg.symbol)}
              onMouseLeave={() => setHoveredSymbol(null)}
            >
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: seg.color }}
              />
              <span className="text-xs font-medium text-[var(--color-text)] truncate flex-1">
                {seg.symbol}
              </span>
              <span className="text-xs text-[var(--color-text-muted)] flex-shrink-0">
                {(seg.weight * 100).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
});
