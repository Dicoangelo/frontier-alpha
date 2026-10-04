import { useMemo, useEffect, useRef } from 'react';
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
  suffix?: string;
  currency?: boolean;
  fractionDigits?: number;
}

function StatCard({ label, value, suffix = '', currency = false, fractionDigits = 0 }: StatCardProps) {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  const color = value > 0 ? 'var(--color-positive)' : value < 0 ? 'var(--color-negative)' : 'var(--color-text)';

  return (
    <div className="rounded-lg bg-[var(--color-bg-tertiary)] px-4 py-3">
      <p className="text-sm text-theme-secondary">{label}</p>
      <p className="text-xl font-semibold tabular-nums mt-1" style={{ color }}>
        {sign}{currency ? '$' : ''}{Math.abs(value).toLocaleString('en-US', {
          minimumFractionDigits: fractionDigits,
          maximumFractionDigits: fractionDigits,
        })}{suffix}
      </p>
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

  const isUp = stats.dailyChange >= 0;
  const deltaColor = isUp ? 'var(--color-positive)' : 'var(--color-negative)';
  const deltaBg = `color-mix(in srgb, ${deltaColor} 10%, transparent)`;

  return (
    <section
      className="portfolio-summary rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-5 sm:p-6"
      aria-label="Portfolio Overview"
    >
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="text-sm font-medium text-theme-secondary">Total portfolio value</h3>
        <span className="text-xs text-theme-muted">
          {portfolio.id === 'demo' ? 'Demo portfolio' : portfolio.currency}
        </span>
      </div>

      <p className="text-4xl sm:text-5xl font-semibold text-theme tabular-nums tracking-tight">
        ${stats.totalValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-3 mb-6">
        <span
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium tabular-nums"
          style={{ backgroundColor: deltaBg, color: deltaColor }}
        >
          {isUp ? <TrendingUp className="w-4 h-4" aria-hidden="true" /> : <TrendingDown className="w-4 h-4" aria-hidden="true" />}
          {isUp ? '+' : '−'}${Math.abs(stats.dailyChange).toLocaleString('en-US', { maximumFractionDigits: 0 })}
          {' '}({stats.dailyChangePercent >= 0 ? '+' : ''}{stats.dailyChangePercent.toFixed(2)}%)
        </span>
        <span
          className="text-xs text-theme-muted"
          title="Estimated as 30% of unrealized profit or loss; not a measured daily return."
        >
          Estimated daily change
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <StatCard label="Unrealized P&L" value={stats.totalPnL} currency />
        <StatCard label="Total return" value={stats.pnlPercent} suffix="%" fractionDigits={2} />
      </div>
    </section>
  );
}
