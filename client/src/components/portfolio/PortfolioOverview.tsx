import { useMemo } from 'react';
import { TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { Card } from '@/components/shared/Card';
import type { Portfolio } from '@/types';

interface PortfolioOverviewProps {
  portfolio: Portfolio;
}

export function PortfolioOverview({ portfolio }: PortfolioOverviewProps) {
  const stats = useMemo(() => {
    const totalValue = portfolio.totalValue;
    const totalPnL = portfolio.positions.reduce((sum, p) => sum + p.unrealizedPnL, 0);
    const pnlPercent = (totalPnL / (totalValue - totalPnL)) * 100;
    return { totalValue, totalPnL, pnlPercent };
  }, [portfolio]);

  return (
    <Card title="Portfolio Overview">
      <div className="grid grid-cols-3 gap-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-500/10 rounded-lg">
            <DollarSign className="w-6 h-6 text-blue-500" />
          </div>
          <div>
            <p className="text-sm text-[var(--color-text-muted)]">Total Value</p>
            <p className="text-2xl font-bold text-[var(--color-text)]">
              ${stats.totalValue.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-lg ${stats.totalPnL >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
            {stats.totalPnL >= 0 ? (
              <TrendingUp className="w-6 h-6 text-green-500" />
            ) : (
              <TrendingDown className="w-6 h-6 text-red-500" />
            )}
          </div>
          <div>
            <p className="text-sm text-[var(--color-text-muted)]">Unrealized P&L</p>
            <p className={`text-2xl font-bold ${stats.totalPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {stats.totalPnL >= 0 ? '+' : ''}${stats.totalPnL.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-lg ${stats.pnlPercent >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
            {stats.pnlPercent >= 0 ? (
              <TrendingUp className="w-6 h-6 text-green-500" />
            ) : (
              <TrendingDown className="w-6 h-6 text-red-500" />
            )}
          </div>
          <div>
            <p className="text-sm text-[var(--color-text-muted)]">Return</p>
            <p className={`text-2xl font-bold ${stats.pnlPercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {stats.pnlPercent >= 0 ? '+' : ''}{stats.pnlPercent.toFixed(2)}%
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}
