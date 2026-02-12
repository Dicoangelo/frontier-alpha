import { Card } from '@/components/shared/Card';
import { Badge } from '@/components/shared/Badge';
import { HelpTooltip } from '@/components/help';
import { Shield, TrendingDown, Activity, Target } from 'lucide-react';
import type { RiskMetrics as RiskMetricsType } from '@/types';

interface RiskMetricsProps {
  metrics: RiskMetricsType;
  benchmark?: { sharpeRatio?: number; volatility?: number; maxDrawdown?: number };
}

function getSharpeLabel(value: number): { variant: 'success' | 'warning' | 'danger' | 'info'; text: string } {
  if (value >= 2.0) return { variant: 'success', text: 'Excellent' };
  if (value >= 1.5) return { variant: 'success', text: 'Good' };
  if (value >= 1.0) return { variant: 'info', text: 'Adequate' };
  if (value >= 0.5) return { variant: 'warning', text: 'Below Avg' };
  return { variant: 'danger', text: 'Poor' };
}

function getVolatilityLabel(value: number): { variant: 'success' | 'warning' | 'danger' | 'info'; text: string; context: string } {
  if (value <= 0.12) return { variant: 'success', text: 'Low', context: 'Suitable for conservative portfolios' };
  if (value <= 0.20) return { variant: 'info', text: 'Moderate', context: 'Normal for a balanced portfolio' };
  if (value <= 0.30) return { variant: 'warning', text: 'Elevated', context: 'High for conservative, normal for growth' };
  return { variant: 'danger', text: 'High', context: 'Expect large daily swings' };
}

function getDrawdownLabel(value: number): { variant: 'success' | 'warning' | 'danger' | 'info'; text: string } {
  const absVal = Math.abs(value);
  if (absVal <= 0.05) return { variant: 'success', text: 'Healthy' };
  if (absVal <= 0.10) return { variant: 'info', text: 'Caution' };
  if (absVal <= 0.20) return { variant: 'warning', text: 'Warning' };
  return { variant: 'danger', text: 'Critical' };
}

export function RiskMetrics({ metrics, benchmark }: RiskMetricsProps) {
  const volInfo = getVolatilityLabel(metrics.volatility);

  return (
    <Card title="Risk Metrics">
      <div className="grid grid-cols-2 gap-4">
        <MetricCard
          icon={<Target className="w-5 h-5 text-[var(--color-info)]" />}
          label="Sharpe Ratio"
          value={metrics.sharpeRatio.toFixed(2)}
          badge={getSharpeLabel(metrics.sharpeRatio)}
          helpKey="sharpeRatio"
          tooltip="Risk-adjusted return. Above 1.5 is good, above 2.0 is excellent. Measures how much return you get per unit of risk."
          benchmarkValue={benchmark?.sharpeRatio != null ? benchmark.sharpeRatio.toFixed(2) : undefined}
        />

        <MetricCard
          icon={<Activity className="w-5 h-5 text-[var(--color-accent)]" />}
          label="Volatility (Ann.)"
          value={`${(metrics.volatility * 100).toFixed(1)}%`}
          badge={volInfo}
          helpKey="volatility"
          tooltip={`${volInfo.context}. A 20% volatility means your portfolio could move ~1.3% on any given day.`}
          benchmarkValue={benchmark?.volatility != null ? `${(benchmark.volatility * 100).toFixed(1)}%` : undefined}
        />

        <MetricCard
          icon={<TrendingDown className="w-5 h-5 text-[var(--color-danger)]" />}
          label="Max Drawdown"
          value={`${(metrics.maxDrawdown * 100).toFixed(1)}%`}
          badge={getDrawdownLabel(metrics.maxDrawdown)}
          helpKey="maxDrawdown"
          tooltip="The largest peak-to-trough decline. Under 5% is healthy, 10-20% warrants attention, above 20% is critical."
          benchmarkValue={benchmark?.maxDrawdown != null ? `${(benchmark.maxDrawdown * 100).toFixed(1)}%` : undefined}
        />

        <MetricCard
          icon={<Shield className="w-5 h-5 text-[var(--color-warning)]" />}
          label="VaR (95%)"
          value={`${(metrics.var95 * 100).toFixed(1)}%`}
          badge={{ variant: 'info', text: 'Daily' }}
          helpKey="var95"
          tooltip="Value at Risk — the maximum loss you can expect on 95% of trading days. A 2% VaR means you'd lose more than 2% only 1 in 20 days."
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
  helpKey,
  tooltip,
  benchmarkValue,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  badge: { variant: 'success' | 'warning' | 'danger' | 'info'; text: string };
  helpKey?: string;
  tooltip?: string;
  benchmarkValue?: string;
}) {
  return (
    <div className="p-4 bg-[var(--color-bg-tertiary)] rounded-lg" title={tooltip}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <p className="text-sm text-[var(--color-text-muted)]">{label}</p>
        {helpKey && <HelpTooltip metricKey={helpKey} size="sm" />}
      </div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xl font-bold text-[var(--color-text)]">{value}</p>
          {benchmarkValue && (
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              vs SPY: {benchmarkValue}
            </p>
          )}
        </div>
        <Badge variant={badge.variant}>{badge.text}</Badge>
      </div>
    </div>
  );
}
