import { useMemo, useEffect, useRef } from 'react';
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

const money = (value: number) => `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

export function PortfolioOverview({ portfolio }: PortfolioOverviewProps) {
  const stats = useMemo(() => {
    const totalPnL = portfolio.positions.reduce((sum, p) => sum + p.unrealizedPnL, 0);
    const totalCost = portfolio.totalValue - totalPnL;
    const pnlPercent = totalCost !== 0 ? (totalPnL / totalCost) * 100 : 0;
    const holdingsValue = portfolio.positions.reduce((sum, p) => sum + p.shares * p.currentPrice, 0);
    const cashPercent = portfolio.totalValue !== 0 ? portfolio.cash / portfolio.totalValue * 100 : 0;
    return { totalPnL, pnlPercent, holdingsValue, cashPercent };
  }, [portfolio]);
  const pnlColor = stats.totalPnL > 0 ? 'var(--color-positive)' : stats.totalPnL < 0 ? 'var(--color-negative)' : 'var(--color-text)';
  const sign = stats.totalPnL > 0 ? '+' : stats.totalPnL < 0 ? '−' : '';

  return (
    <section className="desk-kpis" aria-label="Portfolio Overview">
      <div className="desk-kpi desk-kpi-primary">
        <p className="desk-kpi-label">Portfolio value</p>
        <p className="desk-kpi-value">{money(portfolio.totalValue)}</p>
        <p className="desk-kpi-note">{portfolio.id === 'demo' ? 'Demo portfolio' : portfolio.name} · {portfolio.currency}</p>
      </div>
      <div className="desk-kpi">
        <p className="desk-kpi-label">Unrealized P&amp;L</p>
        <p className="desk-kpi-value" style={{ color: pnlColor }}>{sign}{money(Math.abs(stats.totalPnL))}</p>
        <p className="desk-kpi-note" title="Unrealized profit or loss divided by total portfolio cost, including cash.">
          {stats.pnlPercent > 0 ? '+' : ''}{stats.pnlPercent.toFixed(2)}% on total cost
        </p>
      </div>
      <div className="desk-kpi">
        <p className="desk-kpi-label">Holdings value</p>
        <p className="desk-kpi-value">{money(stats.holdingsValue)}</p>
        <p className="desk-kpi-note">{portfolio.positions.length} open {portfolio.positions.length === 1 ? 'position' : 'positions'}</p>
      </div>
      <div className="desk-kpi">
        <p className="desk-kpi-label">Cash balance</p>
        <p className="desk-kpi-value">{money(portfolio.cash)}</p>
        <p className="desk-kpi-note">{stats.cashPercent.toFixed(1)}% of portfolio</p>
      </div>
    </section>
  );
}
