/**
 * ML Dashboard Page
 *
 * Orchestrator showing current market regime, model performance
 * metrics, training history, and factor attribution waterfall chart.
 */

import { Activity, TrendingUp, Target, Clock, RefreshCw } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { RegimeDetector, REGIME_CONFIG } from '@/components/ml/RegimeDetector';
import type { RegimeState } from '@/components/ml/RegimeDetector';
import { ModelVersions } from '@/components/ml/ModelVersions';
import type { ModelVersion } from '@/components/ml/ModelVersions';
import { FactorAttribution } from '@/components/ml/FactorAttribution';
import type { WaterfallBar, AttributionDriver } from '@/components/ml/FactorAttribution';

// ── MetricCard ──────────────────────────────────────────────────

interface MetricCardProps {
  label: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  color?: string;
}

function MetricCard({ label, value, subtitle, icon, color }: MetricCardProps) {
  const resolvedColor = color ?? 'var(--color-text)';
  return (
    <div className="flex items-center gap-3 p-4 rounded-xl bg-[var(--color-bg-tertiary)] border border-[var(--color-border-light)]">
      <div className="p-2.5 rounded-lg flex-shrink-0" style={{ backgroundColor: `color-mix(in srgb, ${resolvedColor} 12%, transparent)` }}>
        <span style={{ color: resolvedColor }}>{icon}</span>
      </div>
      <div className="min-w-0">
        <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">{label}</p>
        <p className="text-xl font-bold mt-0.5" style={{ color: resolvedColor }}>{value}</p>
        {subtitle && <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

// ── Mock Data ──────────────────────────────────────────────────

const MOCK_REGIME: RegimeState = {
  regime: 'bull',
  confidence: 0.82,
  probabilities: { bull: 0.82, sideways: 0.11, volatile: 0.05, bear: 0.02 },
  transitionMatrix: [
    { from: 'bull', to: { bull: 0.85, sideways: 0.08, volatile: 0.05, bear: 0.02 } },
    { from: 'bear', to: { bull: 0.10, sideways: 0.15, volatile: 0.15, bear: 0.60 } },
    { from: 'sideways', to: { bull: 0.20, sideways: 0.55, volatile: 0.15, bear: 0.10 } },
    { from: 'volatile', to: { bull: 0.15, sideways: 0.20, volatile: 0.45, bear: 0.20 } },
  ],
};

const MOCK_MODELS: ModelVersion[] = [
  {
    id: 'mv_1a2b3c',
    modelType: 'regime_detector',
    version: '2.1.0',
    status: 'deployed',
    accuracy: 0.847,
    sharpeImprovement: 0.31,
    maxDrawdownReduction: 0.18,
    trainedAt: '2026-02-10T14:30:00Z',
    deployedAt: '2026-02-10T15:00:00Z',
  },
  {
    id: 'mv_4d5e6f',
    modelType: 'neural_factor',
    version: '1.3.0',
    status: 'deployed',
    accuracy: 0.723,
    sharpeImprovement: 0.22,
    maxDrawdownReduction: 0.12,
    trainedAt: '2026-02-09T10:15:00Z',
    deployedAt: '2026-02-09T11:00:00Z',
  },
  {
    id: 'mv_7g8h9i',
    modelType: 'regime_detector',
    version: '2.0.0',
    status: 'archived',
    accuracy: 0.801,
    sharpeImprovement: 0.25,
    maxDrawdownReduction: 0.14,
    trainedAt: '2026-02-05T09:00:00Z',
    deployedAt: '2026-02-05T09:30:00Z',
  },
  {
    id: 'mv_jk1l2m',
    modelType: 'neural_factor',
    version: '1.2.0',
    status: 'archived',
    accuracy: 0.691,
    sharpeImprovement: 0.18,
    maxDrawdownReduction: 0.09,
    trainedAt: '2026-02-03T16:45:00Z',
    deployedAt: '2026-02-03T17:15:00Z',
  },
  {
    id: 'mv_3n4o5p',
    modelType: 'regime_detector',
    version: '2.2.0',
    status: 'validated',
    accuracy: 0.861,
    sharpeImprovement: 0.34,
    maxDrawdownReduction: 0.21,
    trainedAt: '2026-02-12T08:00:00Z',
    deployedAt: null,
  },
];

const MOCK_WATERFALL: WaterfallBar[] = [
  { label: 'Momentum', start: 0, end: 0.042, value: 0.042, type: 'positive' },
  { label: 'Value', start: 0.042, end: 0.069, value: 0.027, type: 'positive' },
  { label: 'Quality', start: 0.069, end: 0.088, value: 0.019, type: 'positive' },
  { label: 'Size', start: 0.088, end: 0.076, value: -0.012, type: 'negative' },
  { label: 'Volatility', start: 0.076, end: 0.058, value: -0.018, type: 'negative' },
  { label: 'Residual', start: 0.058, end: 0.065, value: 0.007, type: 'residual' },
  { label: 'Total', start: 0, end: 0.065, value: 0.065, type: 'total' },
];

const MOCK_TOP_DRIVERS: AttributionDriver[] = [
  { factor: 'Momentum', contribution: 0.042, direction: 'positive' },
  { factor: 'Value', contribution: 0.027, direction: 'positive' },
  { factor: 'Quality', contribution: 0.019, direction: 'positive' },
  { factor: 'Volatility', contribution: -0.018, direction: 'negative' },
  { factor: 'Size', contribution: -0.012, direction: 'negative' },
];

// ── Main Page ──────────────────────────────────────────────────

export function ML() {
  const regime = MOCK_REGIME;
  const models = MOCK_MODELS;
  const waterfall = MOCK_WATERFALL;
  const topDrivers = MOCK_TOP_DRIVERS;

  const deployedModels = models.filter((m) => m.status === 'deployed');
  const bestAccuracy = Math.max(...deployedModels.map((m) => m.accuracy));
  const avgSharpeImprovement = deployedModels.reduce((sum, m) => sum + m.sharpeImprovement, 0) / deployedModels.length;
  const lastTrained = models
    .map((m) => new Date(m.trainedAt).getTime())
    .reduce((a, b) => Math.max(a, b), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in-up"
        style={{ animationDelay: '0ms', animationFillMode: 'both' }}
      >
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Machine Learning</h1>
          <p className="text-[var(--color-text-muted)] mt-1">
            Regime detection, model performance &amp; factor attribution
          </p>
        </div>
        <Button disabled>
          <RefreshCw className="w-4 h-4 mr-2" />
          Retrain
        </Button>
      </div>

      {/* Stats Bar */}
      <div
        className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-in-up"
        style={{ animationDelay: '50ms', animationFillMode: 'both' }}
      >
        <MetricCard
          label="Current Regime"
          value={REGIME_CONFIG[regime.regime].label}
          subtitle={`${Math.round(regime.confidence * 100)}% confidence`}
          icon={<Activity className="w-4 h-4" />}
          color={REGIME_CONFIG[regime.regime].color}
        />
        <MetricCard
          label="Best Accuracy"
          value={`${(bestAccuracy * 100).toFixed(1)}%`}
          subtitle="Deployed model"
          icon={<Target className="w-4 h-4" />}
          color="var(--color-accent)"
        />
        <MetricCard
          label="Sharpe Improvement"
          value={`+${(avgSharpeImprovement * 100).toFixed(0)}%`}
          subtitle="Avg deployed"
          icon={<TrendingUp className="w-4 h-4" />}
          color="var(--color-positive)"
        />
        <MetricCard
          label="Last Trained"
          value={new Date(lastTrained).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          subtitle={new Date(lastTrained).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          icon={<Clock className="w-4 h-4" />}
        />
      </div>

      {/* Three-section grid: Regime | Models | Attribution */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Regime Section */}
        <div
          className="lg:col-span-4 animate-fade-in-up"
          style={{ animationDelay: '100ms', animationFillMode: 'both' }}
        >
          <RegimeDetector regime={regime} />
        </div>

        {/* Models Section */}
        <div
          className="lg:col-span-4 animate-fade-in-up"
          style={{ animationDelay: '150ms', animationFillMode: 'both' }}
        >
          <ModelVersions models={models} />
        </div>

        {/* Attribution Section */}
        <div
          className="lg:col-span-4 animate-fade-in-up"
          style={{ animationDelay: '200ms', animationFillMode: 'both' }}
        >
          <FactorAttribution waterfall={waterfall} topDrivers={topDrivers} />
        </div>
      </div>
    </div>
  );
}

export default ML;
