import type { ReactNode } from 'react';
import { Card } from '@/components/shared/Card';
import { Badge } from '@/components/shared/Badge';
import { HelpTooltip } from '@/components/help';
import { Shield, TrendingDown, Activity, Target, BarChart2 } from 'lucide-react';
import type { RiskMetrics as RiskMetricsType } from '@/types';
import type { DataSource } from '@/lib/dataSource';

// Configurable thresholds object — single source of truth per US-019
export const RISK_THRESHOLDS = {
  sharpe: { green: 1.0, yellow: 0.5 },           // >= green: good, >= yellow: ok, < yellow: danger
  volatility: { green: 0.15, yellow: 0.25 },      // <= green: good, <= yellow: ok, > yellow: danger
  drawdown: { green: -0.10, yellow: -0.20 },       // >= green: good, >= yellow: ok, < yellow: danger
  beta: { greenMin: 0.8, greenMax: 1.2 },          // inside range: good, outside: warning
  var95: { green: 0.02, yellow: 0.04 },            // <= green: good, <= yellow: ok, > yellow: danger
} as const;

interface RiskMetricsProps {
  /**
   * US-002: numeric props now come through a `DataSource<T>` so the empty
   * branch can render `—` placeholders rather than synthesizing zeros that
   * read as if they were the user's real metrics.
   */
  metrics: DataSource<RiskMetricsType>;
  benchmark?: { sharpeRatio?: number; volatility?: number; maxDrawdown?: number };
}

const EMPTY_PLACEHOLDER = '—';

function getSharpeLabel(value: number): { variant: 'success' | 'warning' | 'danger' | 'info'; text: string; color: string } {
  if (value >= RISK_THRESHOLDS.sharpe.green) return { variant: 'success', text: value >= 2.0 ? 'Excellent' : 'Good', color: 'var(--color-positive)' };
  if (value >= RISK_THRESHOLDS.sharpe.yellow) return { variant: 'warning', text: 'Below Avg', color: 'var(--color-warning)' };
  return { variant: 'danger', text: 'Poor', color: 'var(--color-danger)' };
}

function getVolatilityLabel(value: number): { variant: 'success' | 'warning' | 'danger' | 'info'; text: string; color: string; context: string } {
  if (value <= RISK_THRESHOLDS.volatility.green) return { variant: 'success', text: 'Low', color: 'var(--color-positive)', context: 'Suitable for conservative portfolios' };
  if (value <= RISK_THRESHOLDS.volatility.yellow) return { variant: 'warning', text: 'Elevated', color: 'var(--color-warning)', context: 'High for conservative, normal for growth' };
  return { variant: 'danger', text: 'High', color: 'var(--color-danger)', context: 'Expect large daily swings' };
}

function getDrawdownLabel(value: number): { variant: 'success' | 'warning' | 'danger' | 'info'; text: string; color: string } {
  if (value >= RISK_THRESHOLDS.drawdown.green) return { variant: 'success', text: 'Healthy', color: 'var(--color-positive)' };
  if (value >= RISK_THRESHOLDS.drawdown.yellow) return { variant: 'warning', text: 'Warning', color: 'var(--color-warning)' };
  return { variant: 'danger', text: 'Critical', color: 'var(--color-danger)' };
}

function getBetaLabel(value: number): { variant: 'success' | 'warning' | 'danger' | 'info'; text: string; color: string } {
  const { greenMin, greenMax } = RISK_THRESHOLDS.beta;
  if (value >= greenMin && value <= greenMax) return { variant: 'success', text: 'Neutral', color: 'var(--color-positive)' };
  return { variant: 'warning', text: value > greenMax ? 'Aggressive' : 'Defensive', color: 'var(--color-warning)' };
}

function getVarLabel(value: number): { variant: 'success' | 'warning' | 'danger' | 'info'; text: string; color: string } {
  if (value <= RISK_THRESHOLDS.var95.green) return { variant: 'success', text: 'Low', color: 'var(--color-positive)' };
  if (value <= RISK_THRESHOLDS.var95.yellow) return { variant: 'warning', text: 'Moderate', color: 'var(--color-warning)' };
  return { variant: 'danger', text: 'High', color: 'var(--color-danger)' };
}

export function RiskMetrics({ metrics, benchmark }: RiskMetricsProps) {
  // Empty state — render dashes everywhere instead of synthesizing zeros that
  // read as if the user actually has a 0% drawdown / 0 sharpe portfolio.
  if (metrics.kind === 'empty') {
    return (
      <Card title="Risk Metrics">
        <div className="grid grid-cols-2 gap-4">
          {[
            { icon: <Target className="w-5 h-5 text-[var(--color-text-muted)]" />, label: 'Sharpe Ratio' },
            { icon: <Activity className="w-5 h-5 text-[var(--color-text-muted)]" />, label: 'Volatility (Ann.)' },
            { icon: <TrendingDown className="w-5 h-5 text-[var(--color-text-muted)]" />, label: 'Max Drawdown' },
            { icon: <Shield className="w-5 h-5 text-[var(--color-text-muted)]" />, label: 'VaR (95%)' },
            { icon: <BarChart2 className="w-5 h-5 text-[var(--color-text-muted)]" />, label: 'Beta' },
            { icon: <Shield className="w-5 h-5 text-[var(--color-text-muted)]" />, label: 'CVaR (95%)' },
          ].map((m) => (
            <MetricCard
              key={m.label}
              icon={m.icon}
              label={m.label}
              value={EMPTY_PLACEHOLDER}
              badge={{ variant: 'info', text: 'No data', color: 'var(--color-text-muted)' }}
              tooltip="Add positions to compute this metric."
            />
          ))}
        </div>
      </Card>
    );
  }

  const m = metrics.value;
  const volInfo = getVolatilityLabel(m.volatility);
  const sharpeInfo = getSharpeLabel(m.sharpeRatio);
  const drawdownInfo = getDrawdownLabel(m.maxDrawdown);
  const betaInfo = getBetaLabel(m.beta);
  const varInfo = getVarLabel(m.var95);

  return (
    <Card title="Risk Metrics">
      <div className="grid grid-cols-2 gap-4">
        <MetricCard
          icon={<Target className="w-5 h-5" style={{ color: sharpeInfo.color }} />}
          label="Sharpe Ratio"
          value={m.sharpeRatio.toFixed(2)}
          badge={sharpeInfo}
          helpKey="sharpeRatio"
          tooltip={`Risk-adjusted return. >= ${RISK_THRESHOLDS.sharpe.green} is good, >= ${RISK_THRESHOLDS.sharpe.yellow} is adequate, below ${RISK_THRESHOLDS.sharpe.yellow} is poor.`}
          benchmarkValue={benchmark?.sharpeRatio != null ? benchmark.sharpeRatio.toFixed(2) : undefined}
          valueColor={sharpeInfo.color}
        />

        <MetricCard
          icon={<Activity className="w-5 h-5" style={{ color: volInfo.color }} />}
          label="Volatility (Ann.)"
          value={`${(m.volatility * 100).toFixed(1)}%`}
          badge={volInfo}
          helpKey="volatility"
          tooltip={`${volInfo.context}. <= ${RISK_THRESHOLDS.volatility.green * 100}% is low, <= ${RISK_THRESHOLDS.volatility.yellow * 100}% is elevated, above ${RISK_THRESHOLDS.volatility.yellow * 100}% is high.`}
          benchmarkValue={benchmark?.volatility != null ? `${(benchmark.volatility * 100).toFixed(1)}%` : undefined}
          valueColor={volInfo.color}
        />

        <MetricCard
          icon={<TrendingDown className="w-5 h-5" style={{ color: drawdownInfo.color }} />}
          label="Max Drawdown"
          value={`${(m.maxDrawdown * 100).toFixed(1)}%`}
          badge={drawdownInfo}
          helpKey="maxDrawdown"
          tooltip={`The largest peak-to-trough decline. >= ${RISK_THRESHOLDS.drawdown.green * 100}% is healthy, >= ${RISK_THRESHOLDS.drawdown.yellow * 100}% warrants attention, below is critical.`}
          benchmarkValue={benchmark?.maxDrawdown != null ? `${(benchmark.maxDrawdown * 100).toFixed(1)}%` : undefined}
          valueColor={drawdownInfo.color}
        />

        <MetricCard
          icon={<Shield className="w-5 h-5" style={{ color: varInfo.color }} />}
          label="VaR (95%)"
          value={`${(m.var95 * 100).toFixed(1)}%`}
          badge={varInfo}
          helpKey="var95"
          tooltip={`Daily Value at Risk. <= ${RISK_THRESHOLDS.var95.green * 100}% is low risk, <= ${RISK_THRESHOLDS.var95.yellow * 100}% is moderate, above is high risk.`}
          valueColor={varInfo.color}
        />

        <MetricCard
          icon={<BarChart2 className="w-5 h-5" style={{ color: betaInfo.color }} />}
          label="Beta"
          value={m.beta.toFixed(2)}
          badge={betaInfo}
          helpKey="beta"
          tooltip={`Market sensitivity. ${RISK_THRESHOLDS.beta.greenMin}–${RISK_THRESHOLDS.beta.greenMax} is neutral (market-like), above is aggressive, below is defensive.`}
          valueColor={betaInfo.color}
        />

        <MetricCard
          icon={<Shield className="w-5 h-5 text-[var(--color-text-muted)]" />}
          label="CVaR (95%)"
          value={`${(m.cvar95 * 100).toFixed(1)}%`}
          badge={{ variant: 'info', text: 'Daily', color: 'var(--color-info)' }}
          helpKey="cvar95"
          tooltip="Conditional Value at Risk — the average loss in the worst 5% of scenarios. Always higher than VaR."
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
  valueColor,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  badge: { variant: 'success' | 'warning' | 'danger' | 'info'; text: string; color?: string };
  helpKey?: string;
  tooltip?: string;
  benchmarkValue?: string;
  valueColor?: string;
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
          <p
            className="text-xl font-bold"
            style={{ color: valueColor || 'var(--color-text)' }}
          >
            {value}
          </p>
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
