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
          <div className="p-3 bg-blue-100 rounded-lg">
            <DollarSign className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Total Value</p>
            <p className="text-2xl font-bold text-gray-800">
              ${stats.totalValue.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-lg ${stats.totalPnL >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
            {stats.totalPnL >= 0 ? (
              <TrendingUp className="w-6 h-6 text-green-600" />
            ) : (
              <TrendingDown className="w-6 h-6 text-red-600" />
            )}
          </div>
          <div>
            <p className="text-sm text-gray-500">Unrealized P&L</p>
            <p className={`text-2xl font-bold ${stats.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {stats.totalPnL >= 0 ? '+' : ''}${stats.totalPnL.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-lg ${stats.pnlPercent >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
            {stats.pnlPercent >= 0 ? (
              <TrendingUp className="w-6 h-6 text-green-600" />
            ) : (
              <TrendingDown className="w-6 h-6 text-red-600" />
            )}
          </div>
          <div>
            <p className="text-sm text-gray-500">Return</p>
            <p className={`text-2xl font-bold ${stats.pnlPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {stats.pnlPercent >= 0 ? '+' : ''}{stats.pnlPercent.toFixed(2)}%
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}
