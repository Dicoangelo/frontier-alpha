/**
 * ML Dashboard Page
 *
 * Machine learning dashboard showing current market regime, model performance
 * metrics, training history, and factor attribution waterfall chart.
 */

import { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ReferenceLine,
} from 'recharts';
import {
  Cpu,
  Activity,
  TrendingUp,
  Target,
  Gauge,
  Clock,
  AlertTriangle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Zap,
} from 'lucide-react';
import { Card } from '@/components/shared/Card';
import { Button } from '@/components/shared/Button';

// ── Types ──────────────────────────────────────────────────────

type MarketRegime = 'bull' | 'bear' | 'sideways' | 'volatile';
type ModelStatus = 'training' | 'validated' | 'deployed' | 'archived';

interface RegimeState {
  regime: MarketRegime;
  confidence: number;
  probabilities: Record<MarketRegime, number>;
  transitionMatrix: Array<{ from: MarketRegime; to: Record<MarketRegime, number> }>;
}

interface ModelVersion {
  id: string;
  modelType: 'regime_detector' | 'neural_factor';
  version: string;
  status: ModelStatus;
  accuracy: number;
  sharpeImprovement: number;
  maxDrawdownReduction: number;
  trainedAt: string;
  deployedAt: string | null;
}

interface AttributionDriver {
  factor: string;
  contribution: number;
  direction: 'positive' | 'negative';
}

interface WaterfallBar {
  label: string;
  start: number;
  end: number;
  value: number;
  type: 'positive' | 'negative' | 'total' | 'residual';
}

// ── Mock Data ──────────────────────────────────────────────────

const REGIMES: MarketRegime[] = ['bull', 'bear', 'sideways', 'volatile'];

const REGIME_CONFIG: Record<MarketRegime, { label: string; color: string; bgColor: string; icon: typeof TrendingUp }> = {
  bull: { label: 'Bull', color: 'text-green-600', bgColor: 'bg-green-500/10', icon: TrendingUp },
  bear: { label: 'Bear', color: 'text-red-600', bgColor: 'bg-red-500/10', icon: AlertTriangle },
  sideways: { label: 'Sideways', color: 'text-yellow-600', bgColor: 'bg-yellow-500/10', icon: Activity },
  volatile: { label: 'Volatile', color: 'text-purple-600', bgColor: 'bg-purple-500/10', icon: Zap },
};

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

// ── Helper Components ──────────────────────────────────────────

interface MetricCardProps {
  label: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  color?: string;
}

function MetricCard({ label, value, subtitle, icon, color = 'text-[var(--color-text)]' }: MetricCardProps) {
  return (
    <div className="p-4 bg-[var(--color-bg)] rounded-xl border border-[var(--color-border)]">
      <div className="flex items-center gap-2 text-[var(--color-text-muted)] mb-2">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      {subtitle && <div className="text-xs text-[var(--color-text-muted)] mt-1">{subtitle}</div>}
    </div>
  );
}

function StatusBadge({ status }: { status: ModelStatus }) {
  const config: Record<ModelStatus, { label: string; className: string }> = {
    deployed: { label: 'Deployed', className: 'bg-green-500/10 text-green-600 border-green-500/20' },
    validated: { label: 'Validated', className: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
    training: { label: 'Training', className: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20' },
    archived: { label: 'Archived', className: 'bg-gray-500/10 text-gray-500 border-gray-500/20' },
  };
  const c = config[status];
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${c.className}`}>
      {c.label}
    </span>
  );
}

// ── Regime Section ─────────────────────────────────────────────

function RegimeSection({ regime }: { regime: RegimeState }) {
  const [showMatrix, setShowMatrix] = useState(false);
  const currentConfig = REGIME_CONFIG[regime.regime];
  const RegimeIcon = currentConfig.icon;

  const confidencePercent = Math.round(regime.confidence * 100);

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-[var(--color-text)] flex items-center gap-2">
          <Gauge className="w-5 h-5 text-indigo-500" />
          Market Regime
        </h2>
        <button
          onClick={() => setShowMatrix(!showMatrix)}
          className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] flex items-center gap-1 transition-colors"
          aria-expanded={showMatrix}
          aria-label="Toggle transition probability matrix"
        >
          Transitions
          {showMatrix ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Current Regime Badge */}
      <div className="flex items-center gap-4 mb-6">
        <div className={`p-3 rounded-xl ${currentConfig.bgColor}`}>
          <RegimeIcon className={`w-8 h-8 ${currentConfig.color}`} />
        </div>
        <div>
          <div className={`text-2xl font-bold ${currentConfig.color}`}>
            {currentConfig.label}
          </div>
          <div className="text-sm text-[var(--color-text-muted)]">
            Current market regime
          </div>
        </div>
      </div>

      {/* Confidence Gauge */}
      <div className="mb-6">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-[var(--color-text-muted)]">Confidence</span>
          <span className="font-bold text-[var(--color-text)]">{confidencePercent}%</span>
        </div>
        <div className="relative h-4 bg-[var(--color-bg-secondary)] rounded-full overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500"
            style={{ width: `${confidencePercent}%` }}
          />
        </div>
      </div>

      {/* Regime Probabilities */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {REGIMES.map((r) => {
          const rc = REGIME_CONFIG[r];
          const prob = regime.probabilities[r];
          const isActive = r === regime.regime;
          return (
            <div
              key={r}
              className={`p-3 rounded-lg border transition-colors ${
                isActive
                  ? `${rc.bgColor} border-current ${rc.color}`
                  : 'bg-[var(--color-bg-secondary)] border-[var(--color-border)]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-sm font-medium ${isActive ? rc.color : 'text-[var(--color-text)]'}`}>
                  {rc.label}
                </span>
                <span className={`text-sm font-mono font-bold ${isActive ? rc.color : 'text-[var(--color-text-muted)]'}`}>
                  {(prob * 100).toFixed(0)}%
                </span>
              </div>
              <div className="mt-1 h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    isActive ? 'bg-current' : 'bg-[var(--color-text-muted)]'
                  }`}
                  style={{ width: `${prob * 100}%`, opacity: isActive ? 1 : 0.3 }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Transition Probability Matrix */}
      {showMatrix && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm" role="img" aria-label="Regime transition probability matrix">
            <thead>
              <tr>
                <th className="text-left p-2 text-[var(--color-text-muted)]">From \ To</th>
                {REGIMES.map((r) => (
                  <th key={r} className={`p-2 text-center ${REGIME_CONFIG[r].color}`}>
                    {REGIME_CONFIG[r].label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {regime.transitionMatrix.map((row) => (
                <tr key={row.from} className="border-t border-[var(--color-border)]">
                  <td className={`p-2 font-medium ${REGIME_CONFIG[row.from].color}`}>
                    {REGIME_CONFIG[row.from].label}
                  </td>
                  {REGIMES.map((to) => {
                    const prob = row.to[to];
                    const isHigh = prob > 0.3;
                    return (
                      <td key={to} className="p-2 text-center">
                        <span
                          className={`font-mono text-xs ${
                            isHigh ? 'font-bold text-[var(--color-text)]' : 'text-[var(--color-text-muted)]'
                          }`}
                        >
                          {(prob * 100).toFixed(0)}%
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ── Models Section ─────────────────────────────────────────────

function ModelsSection({ models }: { models: ModelVersion[] }) {
  const [showAll, setShowAll] = useState(false);

  const deployedModels = models.filter((m) => m.status === 'deployed');
  const displayModels = showAll ? models : models.slice(0, 3);

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-[var(--color-text)] flex items-center gap-2">
          <Cpu className="w-5 h-5 text-indigo-500" />
          Model Performance
        </h2>
        <span className="text-sm text-[var(--color-text-muted)]">
          {deployedModels.length} deployed
        </span>
      </div>

      {/* Model Cards */}
      <div className="space-y-3">
        {displayModels.map((model) => (
          <div
            key={model.id}
            className="p-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)]"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-[var(--color-text)]">
                  {model.modelType === 'regime_detector' ? 'Regime Detector' : 'Neural Factor'}
                </span>
                <span className="text-xs text-[var(--color-text-muted)] font-mono">v{model.version}</span>
                <StatusBadge status={model.status} />
              </div>
              <div className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
                <Clock className="w-3 h-3" />
                {new Date(model.trainedAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            </div>

            {/* Metrics Row */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="text-xs text-[var(--color-text-muted)]">Accuracy</div>
                <div className="text-sm font-bold text-[var(--color-text)]">
                  {(model.accuracy * 100).toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-xs text-[var(--color-text-muted)]">Sharpe +</div>
                <div className="text-sm font-bold text-green-600">
                  +{(model.sharpeImprovement * 100).toFixed(0)}%
                </div>
              </div>
              <div>
                <div className="text-xs text-[var(--color-text-muted)]">DD Reduction</div>
                <div className="text-sm font-bold text-blue-600">
                  -{(model.maxDrawdownReduction * 100).toFixed(0)}%
                </div>
              </div>
            </div>

            {/* Accuracy Bar */}
            <div className="mt-3 h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300"
                style={{ width: `${model.accuracy * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {models.length > 3 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mt-3 w-full py-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors flex items-center justify-center gap-1"
        >
          {showAll ? (
            <>Show less <ChevronUp className="w-4 h-4" /></>
          ) : (
            <>Show all {models.length} versions <ChevronDown className="w-4 h-4" /></>
          )}
        </button>
      )}
    </Card>
  );
}

// ── Attribution Section ────────────────────────────────────────

function AttributionSection({
  waterfall,
  topDrivers,
}: {
  waterfall: WaterfallBar[];
  topDrivers: AttributionDriver[];
}) {
  // Transform waterfall data for Recharts stacked bar approach
  const chartData = useMemo(() => {
    return waterfall.map((item) => ({
      label: item.label,
      // "invisible" base for the waterfall effect
      base: item.type === 'total' ? 0 : Math.min(item.start, item.end),
      // visible bar value (always positive for display)
      value: Math.abs(item.value),
      rawValue: item.value,
      type: item.type,
    }));
  }, [waterfall]);

  const barColors: Record<string, string> = {
    positive: '#22c55e',
    negative: '#ef4444',
    total: '#6366f1',
    residual: '#a855f7',
  };

  return (
    <Card>
      <h2 className="text-lg font-semibold text-[var(--color-text)] flex items-center gap-2 mb-4">
        <Target className="w-5 h-5 text-indigo-500" />
        Factor Attribution
      </h2>

      {/* Waterfall Chart */}
      <div className="h-64 mb-6" role="img" aria-label="Factor attribution waterfall chart showing contribution of each factor to total return">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 10, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light, #e5e7eb)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: 'var(--color-text-muted, #9ca3af)', fontSize: 11 }}
              axisLine={{ stroke: 'var(--color-border, #e5e7eb)' }}
            />
            <YAxis
              tick={{ fill: 'var(--color-text-muted, #9ca3af)', fontSize: 11 }}
              tickFormatter={(v: number) => `${(v * 100).toFixed(1)}%`}
              axisLine={{ stroke: 'var(--color-border, #e5e7eb)' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--color-bg, #fff)',
                border: '1px solid var(--color-border, #e5e7eb)',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              formatter={(value: number, name: string, props: { payload: { rawValue: number; type: string } }) => {
                if (name === 'base') return [null, null];
                const raw = props.payload.rawValue;
                return [`${raw >= 0 ? '+' : ''}${(raw * 100).toFixed(2)}%`, props.payload.type === 'total' ? 'Total Return' : 'Contribution'];
              }}
            />
            <ReferenceLine y={0} stroke="var(--color-text-muted, #9ca3af)" strokeDasharray="2 2" />
            {/* Invisible base bar */}
            <Bar dataKey="base" stackId="waterfall" fill="transparent" />
            {/* Visible value bar */}
            <Bar dataKey="value" stackId="waterfall" radius={[4, 4, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={index} fill={barColors[entry.type]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Top 5 Drivers */}
      <div>
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">Top 5 Drivers</h3>
        <div className="space-y-2">
          {topDrivers.map((driver) => {
            const isPositive = driver.direction === 'positive';
            return (
              <div key={driver.factor} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-6 rounded-full ${isPositive ? 'bg-green-500' : 'bg-red-500'}`}
                  />
                  <span className="text-sm text-[var(--color-text)]">{driver.factor}</span>
                </div>
                <span
                  className={`text-sm font-mono font-bold ${
                    isPositive ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {driver.contribution >= 0 ? '+' : ''}
                  {(driver.contribution * 100).toFixed(2)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
          color="text-indigo-600"
        />
        <MetricCard
          label="Sharpe Improvement"
          value={`+${(avgSharpeImprovement * 100).toFixed(0)}%`}
          subtitle="Avg deployed"
          icon={<TrendingUp className="w-4 h-4" />}
          color="text-green-600"
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
        <div className="lg:col-span-4">
          <RegimeSection regime={regime} />
        </div>

        {/* Models Section */}
        <div className="lg:col-span-4">
          <ModelsSection models={models} />
        </div>

        {/* Attribution Section */}
        <div className="lg:col-span-4">
          <AttributionSection waterfall={waterfall} topDrivers={topDrivers} />
        </div>
      </div>
    </div>
  );
}

export default ML;
