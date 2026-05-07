/**
 * StrategySelector — Strategy builder with P&L payoff diagram and leg editor.
 * Extracted from Options.tsx (Story UXR2-004).
 */

import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
} from 'recharts';
import { Target, ChevronDown } from 'lucide-react';
import { Card } from '@/components/shared/Card';
import type { StrategyType } from './options-types';
import { rechartsTooltipStyle } from '@/lib/theme';
import {
  UNDERLYING_PRICE,
  STRATEGIES,
  STRATEGY_LIST,
  generateStrategyPnL,
} from './options-types';

function StrategySelectorInner() {
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyType>('bull_call_spread');

  const strategy = STRATEGIES[selectedStrategy];
  const pnlData = useMemo(() => generateStrategyPnL(strategy), [strategy]);

  const maxProfit = useMemo(() => Math.max(...pnlData.map((p) => p.profit)), [pnlData]);
  const maxLoss = useMemo(() => Math.min(...pnlData.map((p) => p.profit)), [pnlData]);

  const breakevens = useMemo(() => {
    const brkPts: number[] = [];
    for (let i = 1; i < pnlData.length; i++) {
      if (
        (pnlData[i - 1].profit <= 0 && pnlData[i].profit > 0) ||
        (pnlData[i - 1].profit >= 0 && pnlData[i].profit < 0)
      ) {
        const x0 = pnlData[i - 1].price;
        const x1 = pnlData[i].price;
        const y0 = pnlData[i - 1].profit;
        const y1 = pnlData[i].profit;
        brkPts.push(+(x0 - y0 * (x1 - x0) / (y1 - y0)).toFixed(2));
      }
    }
    return brkPts;
  }, [pnlData]);

  const netDebit = useMemo(() => {
    return strategy.legs
      .filter((l) => l.type !== 'stock')
      .reduce((sum, l) => sum + l.quantity * l.premium, 0);
  }, [strategy]);

  return (
    <Card>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <p className="mono text-[10px] sm:text-xs tracking-[0.3em] uppercase text-theme-muted">
            Strategy P&amp;L
          </p>
          <h2 className="mt-1 text-lg font-semibold text-theme flex items-center gap-2">
            <Target className="w-5 h-5 text-[var(--color-accent)]" aria-hidden="true" />
            {strategy.name}
          </h2>
        </div>
        <div className="relative">
          <select
            value={selectedStrategy}
            onChange={(e) => setSelectedStrategy(e.target.value as StrategyType)}
            className="appearance-none glass-slab-floating rounded-lg px-3 py-2 pr-8 text-sm text-theme min-h-[44px] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] animate-press transition-[border-color,box-shadow] duration-200"
            aria-label="Select options strategy"
          >
            {STRATEGY_LIST.map((s) => (
              <option key={s.type} value={s.type}>
                {s.name}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-muted pointer-events-none" />
        </div>
      </div>

      {/* Strategy Info */}
      <div
        className="mb-4 glass-slab-floating rounded-xl p-4 animate-fade-in-up"
        style={{ animationDelay: '50ms', animationFillMode: 'both' }}
      >
        <div className="text-sm text-theme leading-relaxed">{strategy.description}</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <span
            className="px-2.5 py-1 mono text-[10px] tracking-[0.2em] uppercase rounded-full"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
              color: 'var(--color-accent)',
              border: '1px solid color-mix(in srgb, var(--color-accent) 22%, transparent)',
            }}
          >
            {strategy.outlook}
          </span>
          {strategy.legs.map((leg, i) => (
            <span
              key={i}
              className="px-2.5 py-1 mono text-[10px] tracking-[0.2em] uppercase rounded-full border tabular-nums"
              style={
                leg.quantity > 0
                  ? {
                      backgroundColor: 'color-mix(in srgb, var(--color-positive) 12%, transparent)',
                      color: 'var(--color-positive)',
                      borderColor: 'color-mix(in srgb, var(--color-positive) 22%, transparent)',
                    }
                  : {
                      backgroundColor: 'color-mix(in srgb, var(--color-negative) 12%, transparent)',
                      color: 'var(--color-negative)',
                      borderColor: 'color-mix(in srgb, var(--color-negative) 22%, transparent)',
                    }
              }
            >
              {leg.quantity > 0 ? 'Long' : 'Short'}{' '}
              {leg.type === 'stock' ? '100 shares' : `${leg.strike} ${leg.type.toUpperCase()}`}
              {leg.type !== 'stock' && ` @ $${leg.premium.toFixed(2)}`}
            </span>
          ))}
        </div>
      </div>

      {/* P&L Chart */}
      <div
        className="glass-slab-floating rounded-xl p-3 mb-4 animate-fade-in"
        style={{ minHeight: 280 }}
        role="img"
        aria-label={`P&L payoff diagram for ${strategy.name} strategy`}
      >
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={pnlData} margin={{ top: 10, right: 10, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light, var(--color-border))" vertical={false} />
              <XAxis
                dataKey="price"
                tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
                tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                axisLine={{ stroke: 'var(--color-border)' }}
              />
              <YAxis
                tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
                tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                axisLine={{ stroke: 'var(--color-border)' }}
              />
              <Tooltip
                contentStyle={rechartsTooltipStyle}
                formatter={(value: unknown) => [`$${Number(value).toFixed(2)}`, 'P&L']}
                labelFormatter={(label: unknown) => `Price: $${Number(label).toFixed(2)}`}
              />
              <ReferenceLine y={0} stroke="var(--color-text-muted)" strokeDasharray="2 2" />
              <ReferenceLine
                x={UNDERLYING_PRICE}
                stroke="var(--color-text-muted)"
                strokeDasharray="2 2"
                label={{ value: 'Current', position: 'top', fill: 'var(--color-text-muted)', fontSize: 10 }}
              />
              {breakevens.map((be, i) => (
                <ReferenceLine
                  key={i}
                  x={be}
                  stroke="var(--color-warning)"
                  strokeDasharray="4 4"
                  label={{ value: `BE: $${be.toFixed(0)}`, position: 'top', fill: 'var(--color-warning)', fontSize: 10 }}
                />
              ))}
              <Legend />
              <Line
                type="monotone"
                dataKey="profit"
                name="P&L at Expiry"
                stroke="var(--color-accent)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: 'var(--color-accent)' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Strategy Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="glass-slab-floating rounded-xl px-3 py-2.5">
          <div className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Max Profit</div>
          <div
            className="mt-1 mono text-base font-bold tabular-nums"
            style={{ color: 'var(--color-positive)' }}
          >
            {maxProfit >= 1e6 ? 'Unlimited' : `$${maxProfit.toFixed(0)}`}
          </div>
        </div>
        <div className="glass-slab-floating rounded-xl px-3 py-2.5">
          <div className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Max Loss</div>
          <div
            className="mt-1 mono text-base font-bold tabular-nums"
            style={{ color: 'var(--color-negative)' }}
          >
            ${maxLoss.toFixed(0)}
          </div>
        </div>
        <div className="glass-slab-floating rounded-xl px-3 py-2.5">
          <div className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Breakeven</div>
          <div className="mt-1 mono text-base font-bold tabular-nums text-theme">
            {breakevens.length > 0 ? breakevens.map((b) => `$${b.toFixed(1)}`).join(', ') : 'N/A'}
          </div>
        </div>
        <div className="glass-slab-floating rounded-xl px-3 py-2.5">
          <div className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Net Debit</div>
          <div
            className="mt-1 mono text-base font-bold tabular-nums"
            style={{ color: netDebit > 0 ? 'var(--color-negative)' : 'var(--color-positive)' }}
          >
            {netDebit > 0 ? `-$${netDebit.toFixed(2)}` : `+$${Math.abs(netDebit).toFixed(2)}`}
          </div>
        </div>
      </div>
    </Card>
  );
}

export const StrategySelector = React.memo(StrategySelectorInner);
export default StrategySelector;
