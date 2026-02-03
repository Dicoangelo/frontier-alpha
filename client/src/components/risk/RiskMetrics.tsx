import { Card } from '@/components/shared/Card';
import { Badge } from '@/components/shared/Badge';
import { Shield, TrendingDown, Activity, Target } from 'lucide-react';
import type { RiskMetrics as RiskMetricsType } from '@/types';

interface RiskMetricsProps {
  metrics: RiskMetricsType;
}

export function RiskMetrics({ metrics }: RiskMetricsProps) {
  return (
    <Card title="Risk Metrics">
      <div className="grid grid-cols-2 gap-4">
        <MetricCard
          icon={<Target className="w-5 h-5 text-blue-600" />}
          label="Sharpe Ratio"
          value={metrics.sharpeRatio.toFixed(2)}
          badge={metrics.sharpeRatio >= 1 ? { variant: 'success', text: 'Good' } : { variant: 'warning', text: 'Fair' }}
        />

        <MetricCard
          icon={<Activity className="w-5 h-5 text-purple-600" />}
          label="Volatility (Ann.)"
          value={`${(metrics.volatility * 100).toFixed(1)}%`}
          badge={metrics.volatility <= 0.20 ? { variant: 'success', text: 'Normal' } : { variant: 'warning', text: 'Elevated' }}
        />

        <MetricCard
          icon={<TrendingDown className="w-5 h-5 text-red-600" />}
          label="Max Drawdown"
          value={`${(metrics.maxDrawdown * 100).toFixed(1)}%`}
          badge={Math.abs(metrics.maxDrawdown) <= 0.10 ? { variant: 'success', text: 'OK' } : { variant: 'danger', text: 'High' }}
        />

        <MetricCard
          icon={<Shield className="w-5 h-5 text-orange-600" />}
          label="VaR (95%)"
          value={`${(metrics.var95 * 100).toFixed(1)}%`}
          badge={{ variant: 'info', text: 'Daily' }}
        />
      </div>
    </Card>
  );
}

function MetricCard({
  icon,
  label,
  value,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  badge: { variant: 'success' | 'warning' | 'danger' | 'info'; text: string };
}) {
  return (
    <div className="p-4 bg-gray-50 rounded-lg">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <p className="text-sm text-gray-500">{label}</p>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xl font-bold text-gray-800">{value}</p>
        <Badge variant={badge.variant}>{badge.text}</Badge>
      </div>
    </div>
  );
}
