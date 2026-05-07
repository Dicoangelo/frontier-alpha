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

const severityRails: Record<string, string> = {
  critical: 'before:bg-[var(--color-negative)]',
  high: 'before:bg-[var(--color-warning)]',
  medium: 'before:bg-[var(--color-warning)]',
  low: 'before:bg-[var(--color-info)]',
};

const severityText: Record<string, string> = {
  critical: 'text-[var(--color-negative)]',
  high: 'text-[var(--color-warning)]',
  medium: 'text-[var(--color-warning)]',
  low: 'text-[var(--color-info)]',
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
    <Card className={className}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div>
            <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Risk · Factors</p>
            <h3 className="text-lg font-semibold text-theme mt-0.5">Factor Drift Monitor</h3>
          </div>
          {summary && (
            <span className={`text-sm font-medium ${healthColors[summary.overallHealth]}`}>
              {summary.overallHealth === 'healthy' && (
                <span className="flex items-center gap-1">
                  <CheckCircle className="w-4 h-4" aria-hidden="true" /> All factors within tolerance
                </span>
              )}
              {summary.overallHealth === 'warning' && (
                <span className="flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" aria-hidden="true" />
                  <span className="tabular-nums">{summary.factorsOutsideTolerance}</span> factor(s) drifting
                </span>
              )}
              {summary.overallHealth === 'critical' && (
                <span className="flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" aria-hidden="true" /> Critical drift detected
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
        <div className="glass-slab rounded-lg p-4 mb-4 animate-enter">
          <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted mb-2">Target Strategy</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(STRATEGY_PRESETS).map(([key, label]) => (
              <button
                key={key}
                onClick={() => handleStrategyChange(key)}
                aria-pressed={selectedStrategy === key}
                className={`px-3 py-1.5 mono text-xs tracking-wider uppercase rounded-lg transition-[background-color,color] duration-200 animate-press ${
                  selectedStrategy === key
                    ? 'bg-[image:var(--gradient-sovereign)] text-white shadow-[0_4px_18px_-6px_rgba(123,44,255,0.55)]'
                    : 'bg-theme-tertiary text-theme-secondary hover:bg-theme-secondary border border-theme'
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
        <div className="space-y-3 mb-4 animate-stagger">
          {drifts.map((drift) => (
            <div key={drift.factor} className="flex items-center gap-3 animate-enter">
              <span className="mono text-[10px] tracking-[0.2em] uppercase w-24 text-theme-secondary truncate">
                {formatFactorName(drift.factor)}
              </span>
              <div className="flex-1 relative">
                <div className="h-6 bg-[var(--color-bg-tertiary)] rounded-full overflow-hidden border border-theme-light">
                  {/* Target indicator */}
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-theme-muted z-10"
                    style={{
                      left: `${Math.min(Math.max((drift.target + 1) * 50, 0), 100)}%`,
                    }}
                  />
                  {/* Current value bar */}
                  <div
                    className={`h-full rounded-full transition-[width,margin-left] duration-500 ${
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
                  className={`mono tabular-nums text-sm font-semibold ${
                    drift.withinTolerance ? 'text-[var(--color-positive)]' : 'text-[var(--color-warning)]'
                  }`}
                >
                  {drift.current.toFixed(2)}
                </span>
                <span className="mono tabular-nums text-xs text-theme-muted ml-1">
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
        <div className="space-y-2 animate-stagger">
          <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Active Alerts</p>
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`
                glass-slab-floating relative overflow-hidden p-3 pl-5 rounded-lg animate-enter
                before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px]
                ${severityRails[alert.severity]}
              `}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className={`mono text-[10px] tracking-[0.3em] uppercase ${severityText[alert.severity]}`}>
                    {alert.severity}
                  </p>
                  <p className="font-medium text-theme mt-0.5">{alert.title}</p>
                  <p className="text-sm text-theme-secondary mt-1 leading-relaxed">{alert.message}</p>
                </div>
              </div>
              <p className="mono text-xs text-theme-muted mt-2">{alert.suggestedAction}</p>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {exposures.length === 0 && (
        <p className="text-theme-muted text-sm text-center py-4">
          Add positions to monitor factor drift
        </p>
      )}

      {/* Summary footer */}
      {summary && summary.totalFactorsTracked > 0 && (
        <div className="mt-4 pt-4 border-t border-theme-light flex items-center justify-between mono text-[10px] tracking-[0.2em] uppercase text-theme-muted">
          <span>
            Tracking <span className="tabular-nums">{summary.totalFactorsTracked}</span> factors ·{' '}
            <span className="tabular-nums">{summary.factorsWithinTolerance}</span> within tolerance
          </span>
          <span>Strategy · {STRATEGY_PRESETS[selectedStrategy] || 'Custom'}</span>
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
