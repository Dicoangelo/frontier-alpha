import React, { useMemo, useEffect, useRef } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import type { Portfolio } from '@/types';

interface PortfolioOverviewProps {
  portfolio: Portfolio;
}

export function useCountUp(target: number, duration = 800) {
  const ref = useRef<HTMLSpanElement>(null);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    startRef.current = null;

    const step = (timestamp: number) => {
      if (startRef.current === null) startRef.current = timestamp;
      const elapsed = timestamp - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = eased * target;
      el.textContent = current.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });
      if (progress < 1) requestAnimationFrame(step);
    };

    requestAnimationFrame(step);
  }, [target, duration]);

  return ref;
}

interface StatCardProps {
  label: string;
  value: number;
  isPositive: boolean;
  prefix?: string;
  suffix?: string;
  icon: React.ReactNode;
  iconBg: string;
  delay?: number;
}

const ICON_BG_STYLES: Record<string, React.CSSProperties> = {
  primary: { backgroundColor: 'var(--color-accent-light)' },
  positive: { backgroundColor: 'color-mix(in srgb, var(--color-positive) 10%, transparent)' },
  negative: { backgroundColor: 'color-mix(in srgb, var(--color-negative) 10%, transparent)' },
};

function StatCard({
  label,
  value,
  isPositive,
  prefix = '',
  suffix = '',
  icon,
  iconBg,
  delay = 0,
}: StatCardProps) {
  const countRef = useCountUp(Math.abs(value));

  return (
    <div
      className="glass-slab rounded-xl p-4 flex items-center gap-3 animate-enter transition-[transform,box-shadow] duration-200"
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}
    >
      <div
        className="p-3 rounded-lg flex-shrink-0"
        style={ICON_BG_STYLES[iconBg] ?? {}}
        aria-hidden="true"
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] mono tracking-[0.3em] uppercase text-theme-muted">
          {label}
        </p>
        <p
          className="text-xl font-bold tabular-nums mt-1"
          style={{
            color:
              isPositive
                ? 'var(--color-positive)'
                : value === 0
                ? 'var(--color-text)'
                : 'var(--color-negative)',
          }}
        >
          {prefix}
          {value < 0 ? '-' : ''}
          <span ref={countRef}>0</span>
          {suffix}
        </p>
      </div>
    </div>
  );
}

export function PortfolioOverview({ portfolio }: PortfolioOverviewProps) {
  const stats = useMemo(() => {
    const totalValue = portfolio.totalValue;
    const totalPnL = portfolio.positions.reduce((sum, p) => sum + p.unrealizedPnL, 0);
    const costBasis = totalValue - totalPnL;
    const pnlPercent = costBasis !== 0 ? (totalPnL / costBasis) * 100 : 0;

    const dailyChange = totalPnL * 0.3;
    const dailyChangePercent = costBasis !== 0 ? (dailyChange / costBasis) * 100 : 0;

    return { totalValue, totalPnL, pnlPercent, dailyChange, dailyChangePercent };
  }, [portfolio]);

  const heroCountRef = useCountUp(stats.totalValue, 1000);
  const isUp = stats.dailyChange >= 0;
  const deltaColor = isUp ? 'var(--color-positive)' : 'var(--color-negative)';
  const deltaBg = `color-mix(in srgb, ${deltaColor} 10%, transparent)`;

  return (
    <section
      className="glass-slab rounded-2xl p-6 sm:p-8 animate-enter"
      aria-label="Portfolio Overview"
    >
      {/* Kicker */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] mono tracking-[0.3em] uppercase text-theme-muted">
          Portfolio
        </p>
        <p className="text-[10px] mono tracking-[0.3em] uppercase text-theme-muted">
          Live
        </p>
      </div>

      {/* Hero metric */}
      <div className="gradient-brand-subtle rounded-xl p-5 sm:p-6 mb-5 border border-theme-light">
        <p className="text-[10px] mono tracking-[0.3em] uppercase text-theme-muted mb-2">
          Total Value
        </p>
        <div className="flex items-baseline gap-3 flex-wrap">
          <p className="text-4xl sm:text-5xl font-black text-gradient-brand tabular-nums tracking-tight holo-pulse">
            $<span ref={heroCountRef}>0</span>
          </p>

          {/* Daily change pill — type-rail pattern */}
          <span
            className="glass-slab-floating relative inline-flex items-center gap-1.5 pl-4 pr-3 py-1 rounded-full text-xs font-semibold tabular-nums overflow-hidden before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px]"
            style={{
              backgroundColor: deltaBg,
              color: deltaColor,
              ['--rail-color' as string]: deltaColor,
            }}
          >
            <span
              aria-hidden="true"
              className="absolute left-0 top-0 bottom-0 w-[3px]"
              style={{ backgroundColor: deltaColor }}
            />
            {isUp ? (
              <TrendingUp className="w-3.5 h-3.5 flex-shrink-0" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5 flex-shrink-0" />
            )}
            <span className="mono tracking-[0.1em]">
              {isUp ? '+' : ''}$
              {Math.abs(stats.dailyChange).toLocaleString(undefined, {
                maximumFractionDigits: 0,
              })}{' '}
              ({stats.dailyChangePercent >= 0 ? '+' : ''}
              {stats.dailyChangePercent.toFixed(2)}%) Today
            </span>
          </span>
        </div>
      </div>

      {/* Supporting metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 animate-stagger">
        <StatCard
          label="Unrealized P&L"
          value={stats.totalPnL}
          isPositive={stats.totalPnL >= 0}
          prefix={stats.totalPnL >= 0 ? '+$' : '-$'}
          icon={
            stats.totalPnL >= 0 ? (
              <TrendingUp className="w-5 h-5" style={{ color: 'var(--color-positive)' }} />
            ) : (
              <TrendingDown className="w-5 h-5" style={{ color: 'var(--color-negative)' }} />
            )
          }
          iconBg={stats.totalPnL >= 0 ? 'positive' : 'negative'}
          delay={80}
        />

        <StatCard
          label="Return"
          value={stats.pnlPercent}
          isPositive={stats.pnlPercent >= 0}
          prefix={stats.pnlPercent >= 0 ? '+' : ''}
          suffix="%"
          icon={
            stats.pnlPercent >= 0 ? (
              <TrendingUp className="w-5 h-5" style={{ color: 'var(--color-positive)' }} />
            ) : (
              <TrendingDown className="w-5 h-5" style={{ color: 'var(--color-negative)' }} />
            )
          }
          iconBg={stats.pnlPercent >= 0 ? 'positive' : 'negative'}
          delay={160}
        />
      </div>
    </section>
  );
}
