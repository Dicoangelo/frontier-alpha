import React, { useMemo, useEffect, useRef } from 'react';
import { TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { Card } from '@/components/shared/Card';
import type { Portfolio } from '@/types';

interface PortfolioOverviewProps {
  portfolio: Portfolio;
}

function useCountUp(target: number, duration = 800) {
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
      // ease-out: 1 - (1-t)^3
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
  dailyChange?: number;
  dailyChangePercent?: number;
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
  dailyChange,
  dailyChangePercent,
  icon,
  iconBg,
  delay = 0,
}: StatCardProps) {
  const countRef = useCountUp(Math.abs(value));

  return (
    <div
      className="flex items-center gap-3 animate-fade-in-up"
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}
    >
      <div className="p-3 rounded-lg flex-shrink-0" style={ICON_BG_STYLES[iconBg] ?? {}}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm text-[var(--color-text-muted)]">{label}</p>
        <p
          className="text-2xl font-bold"
          style={{ color: isPositive ? 'var(--color-positive)' : value === 0 ? 'var(--color-text)' : 'var(--color-negative)' }}
        >
          {prefix}{value < 0 ? '-' : ''}<span ref={countRef}>0</span>{suffix}
        </p>
        {dailyChange !== undefined && dailyChangePercent !== undefined && (
          <p
            className="text-xs font-medium mt-0.5 flex items-center gap-1"
            style={{ color: dailyChange >= 0 ? 'var(--color-positive)' : 'var(--color-negative)' }}
          >
            {dailyChange >= 0 ? (
              <TrendingUp className="w-3 h-3 flex-shrink-0" />
            ) : (
              <TrendingDown className="w-3 h-3 flex-shrink-0" />
            )}
            {dailyChange >= 0 ? '+' : ''}${Math.abs(dailyChange).toLocaleString()} ({dailyChangePercent >= 0 ? '+' : ''}{dailyChangePercent.toFixed(2)}%)
          </p>
        )}
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

    // Estimate daily change as ~30% of total unrealized PnL (demo heuristic)
    const dailyChange = totalPnL * 0.3;
    const dailyChangePercent = costBasis !== 0 ? (dailyChange / costBasis) * 100 : 0;

    return { totalValue, totalPnL, pnlPercent, dailyChange, dailyChangePercent };
  }, [portfolio]);

  return (
    <Card title="Portfolio Overview">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <StatCard
          label="Total Value"
          value={stats.totalValue}
          isPositive={true}
          prefix="$"
          dailyChange={stats.dailyChange}
          dailyChangePercent={stats.dailyChangePercent}
          icon={<DollarSign className="w-6 h-6" style={{ color: 'var(--color-primary)' }} />}
          iconBg="primary"
          delay={0}
        />

        <StatCard
          label="Unrealized P&L"
          value={stats.totalPnL}
          isPositive={stats.totalPnL >= 0}
          prefix={stats.totalPnL >= 0 ? '+$' : '-$'}
          icon={
            stats.totalPnL >= 0 ? (
              <TrendingUp className="w-6 h-6" style={{ color: 'var(--color-positive)' }} />
            ) : (
              <TrendingDown className="w-6 h-6" style={{ color: 'var(--color-negative)' }} />
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
              <TrendingUp className="w-6 h-6" style={{ color: 'var(--color-positive)' }} />
            ) : (
              <TrendingDown className="w-6 h-6" style={{ color: 'var(--color-negative)' }} />
            )
          }
          iconBg={stats.pnlPercent >= 0 ? 'positive' : 'negative'}
          delay={160}
        />
      </div>
    </Card>
  );
}
