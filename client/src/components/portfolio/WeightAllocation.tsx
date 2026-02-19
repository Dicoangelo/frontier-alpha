import { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/shared/Card';
import { useCountUp } from '@/components/portfolio/PortfolioOverview';
import type { Position } from '@/types';

const SEGMENT_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

interface WeightAllocationProps {
  positions: Position[];
  totalValue: number;
}

interface Segment {
  symbol: string;
  weight: number;
  value: number;
  color: string;
  dashArray: string;
  dashOffset: number;
  circumference: number;
}

function buildSegments(positions: Position[], _totalValue: number): Segment[] {
  // Radius and circumference for the donut
  const r = 54;
  const circumference = 2 * Math.PI * r;

  // Sort by weight descending, take top 6 and group rest as "Other"
  const sorted = [...positions].sort((a, b) => b.weight - a.weight);
  const top = sorted.slice(0, 6);
  const rest = sorted.slice(6);

  const items = [...top];
  if (rest.length > 0) {
    const otherWeight = rest.reduce((acc, p) => acc + p.weight, 0);
    const otherValue = rest.reduce((acc, p) => acc + p.shares * p.currentPrice, 0);
    items.push({ symbol: 'Other', shares: 0, weight: otherWeight, costBasis: 0, currentPrice: 0, unrealizedPnL: 0, value: otherValue } as Position & { value: number });
  }

  // Normalize weights (in case they don't sum exactly to 1)
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
      color: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
      dashArray: `${dash.toFixed(3)} ${gap.toFixed(3)}`,
      dashOffset: -offset,
      circumference,
    };
    offset += dash;
    return seg;
  });
}

export function WeightAllocation({ positions, totalValue }: WeightAllocationProps) {
  const [hoveredSymbol, setHoveredSymbol] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const hasAnimated = useRef(false);

  // Trigger draw-in animation on mount
  useEffect(() => {
    if (hasAnimated.current) return;
    hasAnimated.current = true;
    // Small delay to allow DOM paint before animation
    const frame = requestAnimationFrame(() => setIsVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const centerCountRef = useCountUp(totalValue, 900);

  if (positions.length === 0) return null;

  const SIZE = 160;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const r = 54;
  const circumference = 2 * Math.PI * r;
  const strokeWidth = 20;

  const segments = buildSegments(positions, totalValue);

  const hovered = hoveredSymbol ? segments.find(s => s.symbol === hoveredSymbol) : null;

  return (
    <Card title="Weight Allocation">
      <div className="flex flex-col sm:flex-row items-center gap-6">
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
              {segments.map((seg, i) => (
                <circle
                  key={seg.symbol}
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={hoveredSymbol === seg.symbol ? strokeWidth + 4 : strokeWidth}
                  strokeDasharray={seg.dashArray}
                  strokeDashoffset={isVisible ? seg.dashOffset : circumference}
                  strokeLinecap="butt"
                  className="cursor-pointer"
                  style={{
                    transition: isVisible
                      ? `stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1) ${i * 80}ms, stroke-width 0.15s ease`
                      : 'none',
                  }}
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
                {/* Center total with countUp — increased font size */}
                <foreignObject x={cx - 35} y={cy - 14} width="70" height="20">
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                    <span
                      ref={centerCountRef}
                      style={{
                        fontSize: '16px',
                        fontWeight: 700,
                        color: 'var(--color-text)',
                        fontFamily: 'inherit',
                      }}
                    >
                      0
                    </span>
                  </div>
                </foreignObject>
                {/* We prepend the $ sign separately for better alignment */}
                <text
                  x={cx - 28}
                  y={cy + 2}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="700"
                  fill="var(--color-text)"
                >
                  $
                </text>
                <text
                  x={cx}
                  y={cy + 18}
                  textAnchor="middle"
                  fontSize="9"
                  fill="var(--color-text-muted)"
                >
                  total value
                </text>
              </>
            )}
          </svg>
        </div>

        {/* Legend */}
        <div className="flex flex-col gap-2 flex-1 min-w-0">
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
}
