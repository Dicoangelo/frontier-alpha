import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  Settings,
  RefreshCw,
} from 'lucide-react';
import { Card } from '@/components/shared/Card';
import { Button } from '@/components/shared/Button';
import { api } from '@/api/client';

interface FactorTarget {
  factor: string;
  target: number;
  tolerance: number;
}

interface FactorExposure {
  factor: string;
  exposure: number;
}

interface DriftResult {
  factor: string;
  current: number;
  target: number;
  drift: number;
  driftPct: number;
  withinTolerance: boolean;
}

interface DriftAlert {
  id: string;
  type: 'factor_drift';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  message: string;
  factor: string;
  currentExposure: number;
  targetExposure: number;
  driftPct: number;
  suggestedAction: string;
}

interface DriftSummary {
  totalFactorsTracked: number;
  factorsWithinTolerance: number;
  factorsOutsideTolerance: number;
  worstDrift: DriftResult | null;
  overallHealth: 'healthy' | 'warning' | 'critical';
}

interface FactorDriftAlertProps {
  exposures: FactorExposure[];
  onAlertGenerated?: (alerts: DriftAlert[]) => void;
  className?: string;
}

const STRATEGY_PRESETS: Record<string, string> = {
  balanced: 'Balanced',
  momentum: 'Momentum',
  quality: 'Quality',
  lowVol: 'Low Volatility',
};

const formatFactorName = (factor: string): string => {
  const names: Record<string, string> = {
    momentum_12m: '12M Momentum',
    momentum_6m: '6M Momentum',
    value: 'Value',
    low_vol: 'Low Volatility',
    roe: 'ROE',
    roa: 'ROA',
    gross_margin: 'Gross Margin',
    debt_to_equity: 'D/E Ratio',
    market: 'Market Beta',
    volatility: 'Volatility',
  };
  return (
    names[factor] ||
    factor.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  );
};

const severityColors: Record<string, string> = {
  critical: 'text-[var(--color-negative)] bg-[rgba(239, 68, 68,0.1)] border-[rgba(239, 68, 68,0.2)]',
  high: 'text-[var(--color-warning)] bg-[rgba(249, 115, 22,0.1)] border-[rgba(249, 115, 22,0.2)]',
  medium: 'text-[var(--color-warning)] bg-[rgba(245, 158, 11,0.1)] border-[rgba(245, 158, 11,0.2)]',
  low: 'text-[var(--color-info)] bg-[rgba(59, 130, 246,0.1)] border-[rgba(59, 130, 246,0.2)]',
};

const healthColors: Record<string, string> = {
  healthy: 'text-[var(--color-positive)]',
  warning: 'text-[var(--color-warning)]',
  critical: 'text-[var(--color-negative)]',
};

export function FactorDriftAlert({
  exposures,
  onAlertGenerated,
  className = '',
}: FactorDriftAlertProps) {
  const [selectedStrategy, setSelectedStrategy] = useState('balanced');
  const [showSettings, setShowSettings] = useState(false);
  const [customTargets, setCustomTargets] = useState<FactorTarget[]>([]);

  // Fetch default targets
  const { data: configData } = useQuery({
    queryKey: ['factor-drift-config'],
    queryFn: () => api.get('/alerts/factor-drift'),
  });

  // Check for drift
  const driftMutation = useMutation({
    mutationFn: (data: { exposures: FactorExposure[]; targets?: FactorTarget[] }) =>
      api.post('/alerts/factor-drift', data),
    onSuccess: (response) => {
      const alerts = response.data?.alerts || [];
      if (onAlertGenerated && alerts.length > 0) {
        onAlertGenerated(alerts);
      }
    },
  });

  // Check drift when exposures change
  useEffect(() => {
    if (exposures.length > 0) {
      const targets =
        customTargets.length > 0
          ? customTargets
          : configData?.data?.strategies?.[selectedStrategy];

      driftMutation.mutate({ exposures, targets });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally omitting driftMutation and configData to avoid infinite re-trigger
  }, [exposures, selectedStrategy, customTargets]);

  const result = driftMutation.data?.data;
  const summary: DriftSummary | null = result?.summary || null;
  const drifts: DriftResult[] = result?.drifts || [];
  const alerts: DriftAlert[] = result?.alerts || [];

  const handleStrategyChange = (strategy: string) => {
    setSelectedStrategy(strategy);
    setCustomTargets([]);
  };

  // Note: handleTargetUpdate reserved for future custom target editing UI
  // const handleTargetUpdate = (factor: string, target: number, tolerance: number) => {
  //   setCustomTargets((prev) => {
  //     const existing = prev.findIndex((t) => t.factor === factor);
  //     if (existing >= 0) {
  //       const updated = [...prev];
  //       updated[existing] = { factor, target, tolerance };
  //       return updated;
  //     }
  //     return [...prev, { factor, target, tolerance }];
  //   });
  // };

  return (
    <Card className={`p-6 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-[var(--color-text)]">Factor Drift Monitor</h3>
          {summary && (
            <span
              className={`text-sm font-medium ${healthColors[summary.overallHealth]}`}
            >
              {summary.overallHealth === 'healthy' && (
                <span className="flex items-center gap-1">
                  <CheckCircle className="w-4 h-4" /> All factors within tolerance
                </span>
              )}
              {summary.overallHealth === 'warning' && (
                <span className="flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" /> {summary.factorsOutsideTolerance} factor(s) drifting
                </span>
              )}
              {summary.overallHealth === 'critical' && (
                <span className="flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" /> Critical drift detected
                </span>
              )}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => driftMutation.mutate({ exposures })}
            disabled={driftMutation.isPending}
            aria-label="Refresh factor drift data"
          >
            <RefreshCw
              className={`w-4 h-4 ${driftMutation.isPending ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSettings(!showSettings)}
            aria-label="Toggle drift monitor settings"
            aria-expanded={showSettings}
          >
            <Settings className="w-4 h-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* Strategy selector */}
      {showSettings && (
        <div className="mb-4 p-4 bg-[var(--color-bg-tertiary)] rounded-lg">
          <p className="text-sm font-medium text-[var(--color-text-secondary)] mb-2">Target Strategy</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(STRATEGY_PRESETS).map(([key, label]) => (
              <button
                key={key}
                onClick={() => handleStrategyChange(key)}
                className={`px-3 py-1.5 text-sm rounded-lg transition ${
                  selectedStrategy === key
                    ? 'bg-[var(--color-info)] text-white'
                    : 'bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] border border-[var(--color-border)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Drift visualization */}
      {drifts.length > 0 && (
        <div className="space-y-3 mb-4">
          {drifts.map((drift) => (
            <div key={drift.factor} className="flex items-center gap-3">
              <span className="w-24 text-sm font-medium text-[var(--color-text-secondary)] truncate">
                {formatFactorName(drift.factor)}
              </span>
              <div className="flex-1 relative">
                <div className="h-6 bg-[var(--color-bg-secondary)] rounded-full overflow-hidden">
                  {/* Target indicator */}
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-[var(--color-bg-tertiary)] z-10"
                    style={{
                      left: `${Math.min(Math.max((drift.target + 1) * 50, 0), 100)}%`,
                    }}
                  />
                  {/* Current value bar */}
                  <div
                    className={`h-full rounded-full transition-all ${
                      drift.withinTolerance
                        ? 'bg-[var(--color-positive)]'
                        : drift.driftPct > 0.5
                        ? 'bg-[var(--color-negative)]'
                        : 'bg-[var(--color-warning)]'
                    }`}
                    style={{
                      width: `${Math.min(Math.abs(drift.current) * 50, 100)}%`,
                      marginLeft: drift.current >= 0 ? '50%' : `${50 - Math.abs(drift.current) * 50}%`,
                    }}
                  />
                </div>
              </div>
              <div className="w-20 text-right">
                <span
                  className={`text-sm font-medium ${
                    drift.withinTolerance ? 'text-[var(--color-positive)]' : 'text-[var(--color-warning)]'
                  }`}
                >
                  {drift.current.toFixed(2)}
                </span>
                <span className="text-xs text-[var(--color-text-muted)] ml-1">
                  ({drift.target.toFixed(2)})
                </span>
              </div>
              {!drift.withinTolerance && (
                drift.drift > 0 ? (
                  <TrendingUp className="w-4 h-4 text-[var(--color-negative)]" aria-hidden="true" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-[var(--color-negative)]" aria-hidden="true" />
                )
              )}
            </div>
          ))}
        </div>
      )}

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-[var(--color-text-secondary)]">Active Alerts</p>
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`p-3 rounded-lg border ${severityColors[alert.severity]}`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium">{alert.title}</p>
                  <p className="text-sm opacity-80">{alert.message}</p>
                </div>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded ${
                    alert.severity === 'critical'
                      ? 'bg-[var(--color-negative)]'
                      : alert.severity === 'high'
                      ? 'bg-[var(--color-warning)]'
                      : alert.severity === 'medium'
                      ? 'bg-[var(--color-warning)]'
                      : 'bg-[var(--color-info)]'
                  }`}
                >
                  {alert.severity.toUpperCase()}
                </span>
              </div>
              <p className="text-xs mt-2 opacity-70">{alert.suggestedAction}</p>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {exposures.length === 0 && (
        <p className="text-[var(--color-text-muted)] text-sm text-center py-4">
          Add positions to monitor factor drift
        </p>
      )}

      {/* Summary footer */}
      {summary && summary.totalFactorsTracked > 0 && (
        <div className="mt-4 pt-4 border-t border-[var(--color-border-light)] flex items-center justify-between text-xs text-[var(--color-text-muted)]">
          <span>
            Tracking {summary.totalFactorsTracked} factors •{' '}
            {summary.factorsWithinTolerance} within tolerance
          </span>
          <span>Strategy: {STRATEGY_PRESETS[selectedStrategy] || 'Custom'}</span>
        </div>
      )}
    </Card>
  );
}

// Demo component
export function FactorDriftAlertDemo() {
  const sampleExposures: FactorExposure[] = [
    { factor: 'momentum_12m', exposure: 0.85 },
    { factor: 'value', exposure: -0.28 },
    { factor: 'low_vol', exposure: -0.42 },
    { factor: 'roe', exposure: 0.62 },
    { factor: 'market', exposure: 1.15 },
  ];

  return <FactorDriftAlert exposures={sampleExposures} />;
}
