import React, { useMemo, useEffect, useRef } from 'react';
import { TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { Card } from '@/components/shared/Card';
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
  positive: { backgroundColor: 'rgba(16, 185, 129, 0.1)' },
  negative: { backgroundColor: 'rgba(239, 68, 68, 0.1)' },
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
      className="flex items-center gap-3 p-4 rounded-xl bg-[var(--color-bg-tertiary)] animate-fade-in-up"
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}
    >
      <div className="p-3 rounded-lg flex-shrink-0" style={ICON_BG_STYLES[iconBg] ?? {}}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">{label}</p>
        <p
          className="text-xl font-bold mt-0.5"
          style={{ color: isPositive ? 'var(--color-positive)' : value === 0 ? 'var(--color-text)' : 'var(--color-negative)' }}
        >
          {prefix}{value < 0 ? '-' : ''}<span ref={countRef}>0</span>{suffix}
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

  return (
    <Card title="Portfolio Overview">
      {/* Hero Value — full width, prominent */}
      <div className="gradient-brand-subtle rounded-xl p-6 mb-5 border border-[var(--color-border-light)]">
        <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-2">Total Value</p>
        <div className="flex items-baseline gap-3 flex-wrap">
          <p className="text-4xl lg:text-5xl font-bold text-[var(--color-text)] tracking-tight">
            $<span ref={heroCountRef}>0</span>
          </p>
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold"
            style={{
              backgroundColor: stats.dailyChange >= 0 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
              color: stats.dailyChange >= 0 ? 'var(--color-positive)' : 'var(--color-negative)',
            }}
          >
            {stats.dailyChange >= 0 ? (
              <TrendingUp className="w-3.5 h-3.5 flex-shrink-0" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5 flex-shrink-0" />
            )}
            {stats.dailyChange >= 0 ? '+' : ''}${Math.abs(stats.dailyChange).toLocaleString(undefined, { maximumFractionDigits: 0 })} ({stats.dailyChangePercent >= 0 ? '+' : ''}{stats.dailyChangePercent.toFixed(2)}%) today
          </span>
        </div>
      </div>

      {/* Supporting metrics — 2 column with card backgrounds */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
    </Card>
  );
}
