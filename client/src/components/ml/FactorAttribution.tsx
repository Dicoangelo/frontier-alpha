/**
 * FactorAttribution — Waterfall chart showing factor contributions to total return.
 * Extracted from ML.tsx (Story UXR2-005).
 */

import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ReferenceLine,
} from 'recharts';
import { Target } from 'lucide-react';
import { Card } from '@/components/shared/Card';
import { rechartsTooltipStyle } from '@/lib/theme';

// ── Types ──────────────────────────────────────────────────────

export interface WaterfallBar {
  label: string;
  start: number;
  end: number;
  value: number;
  type: 'positive' | 'negative' | 'total' | 'residual';
}

export interface AttributionDriver {
  factor: string;
  contribution: number;
  direction: 'positive' | 'negative';
}

// ── Component ──────────────────────────────────────────────────

interface FactorAttributionProps {
  waterfall: WaterfallBar[];
  topDrivers: AttributionDriver[];
}

function FactorAttributionInner({ waterfall, topDrivers }: FactorAttributionProps) {
  const chartData = useMemo(() => {
    return waterfall.map((item) => ({
      label: item.label,
      base: item.type === 'total' ? 0 : Math.min(item.start, item.end),
      value: Math.abs(item.value),
      rawValue: item.value,
      type: item.type,
    }));
  }, [waterfall]);

  const barColors: Record<string, string> = {
    positive: 'var(--color-positive)',
    negative: 'var(--color-negative)',
    total: 'var(--color-accent)',
    residual: 'var(--chart-purple)',
  };

  return (
    <Card>
      <h2 className="text-lg font-semibold text-[var(--color-text)] flex items-center gap-2 mb-4">
        <Target className="w-5 h-5 text-[var(--color-accent)]" />
        Factor Attribution
      </h2>

      {/* Waterfall Chart */}
      <div className="h-64 mb-6" role="img" aria-label="Factor attribution waterfall chart showing contribution of each factor to total return">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 10, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light, var(--color-border))" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: 'var(--color-text-muted, var(--color-text-muted))', fontSize: 11 }}
              axisLine={{ stroke: 'var(--color-border, var(--color-border))' }}
            />
            <YAxis
              tick={{ fill: 'var(--color-text-muted, var(--color-text-muted))', fontSize: 11 }}
              tickFormatter={(v: number) => `${(v * 100).toFixed(1)}%`}
              axisLine={{ stroke: 'var(--color-border, var(--color-border))' }}
            />
            <Tooltip
              contentStyle={rechartsTooltipStyle}
              formatter={(_value: unknown, name: unknown, props: unknown) => {
                if (name === 'base') return [null, null];
                const p = props as { payload: { rawValue: number; type: string } };
                const raw = p.payload.rawValue;
                return [`${raw >= 0 ? '+' : ''}${(raw * 100).toFixed(2)}%`, p.payload.type === 'total' ? 'Total Return' : 'Contribution'];
              }}
            />
            <ReferenceLine y={0} stroke="var(--color-text-muted, var(--color-text-muted))" strokeDasharray="2 2" />
            {/* Invisible base bar */}
            <Bar dataKey="base" stackId="waterfall" fill="transparent" />
            {/* Visible value bar */}
            <Bar dataKey="value" stackId="waterfall" radius={[4, 4, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={index} fill={barColors[entry.type]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Top 5 Drivers */}
      <div>
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">Top 5 Drivers</h3>
        <div className="space-y-2">
          {topDrivers.map((driver) => {
            const isPositive = driver.direction === 'positive';
            return (
              <div
                key={driver.factor}
                className="flex items-center justify-between hover:bg-[var(--color-bg-secondary)] rounded-lg px-2 -mx-2 transition-colors duration-150"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-2 h-6 rounded-full"
                    style={{ backgroundColor: isPositive ? 'var(--color-positive)' : 'var(--color-negative)' }}
                  />
                  <span className="text-sm text-[var(--color-text)]">{driver.factor}</span>
                </div>
                <span
                  className="text-sm font-mono font-bold"
                  style={{ color: isPositive ? 'var(--color-positive)' : 'var(--color-negative)' }}
                >
                  {driver.contribution >= 0 ? '+' : ''}
                  {(driver.contribution * 100).toFixed(2)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

export const FactorAttribution = React.memo(FactorAttributionInner);
export default FactorAttribution;
