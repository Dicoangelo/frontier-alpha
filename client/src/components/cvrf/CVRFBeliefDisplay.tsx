/**
 * CVRF Belief Display Component
 *
 * Displays current belief state including factor weights and confidences
 */

import { Scale, Gauge, Shield, BarChart3, Activity } from 'lucide-react';
import { useCVRFBeliefs, useRegimeDisplay } from '@/hooks/useCVRF';

interface FactorBarProps {
  factor: string;
  weight: number;
  confidence: number;
}

function FactorBar({ factor, weight, confidence }: FactorBarProps) {
  const weightPercent = Math.abs(weight) * 100;
  const isPositive = weight >= 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-gray-700 capitalize">{factor}</span>
        <div className="flex items-center gap-2">
          <span className={`font-mono ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
            {isPositive ? '+' : ''}{(weight * 100).toFixed(1)}%
          </span>
          <span className="text-xs text-gray-400">
            ({(confidence * 100).toFixed(0)}% conf)
          </span>
        </div>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${
            isPositive ? 'bg-green-500' : 'bg-red-500'
          }`}
          style={{ width: `${Math.min(weightPercent, 100)}%`, opacity: 0.5 + confidence * 0.5 }}
        />
      </div>
    </div>
  );
}

interface ConstraintRowProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color?: string;
}

function ConstraintRow({ label, value, icon, color = 'text-gray-900' }: ConstraintRowProps) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
      <div className="flex items-center gap-2 text-gray-500">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <span className={`font-mono text-sm font-medium ${color}`}>{value}</span>
    </div>
  );
}

export function CVRFBeliefDisplay() {
  const { data: beliefs, isLoading, isError } = useCVRFBeliefs();
  const regime = useRegimeDisplay(beliefs?.currentRegime, beliefs?.regimeConfidence);

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-6" />
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-4 bg-gray-200 rounded w-1/4" />
              <div className="h-2 bg-gray-200 rounded w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError || !beliefs) {
    return (
      <div className="bg-white rounded-xl border border-red-200 p-6">
        <div className="text-red-500 text-sm">Failed to load belief state</div>
      </div>
    );
  }

  const factors = Object.entries(beliefs.factorWeights).map(([factor, weight]) => ({
    factor,
    weight: weight as number,
    confidence: (beliefs.factorConfidences[factor] as number) || 0.5,
  }));

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Scale className="w-5 h-5 text-indigo-500" />
          Belief State
        </h3>
        <span className="text-xs text-gray-500">v{beliefs.version}</span>
      </div>

      {/* Market Regime */}
      <div className="mb-6 p-4 bg-gradient-to-r from-gray-50 to-indigo-50 rounded-lg">
        <div className="text-xs text-gray-500 mb-1">Market Regime</div>
        <div className="flex items-center gap-3">
          <span className="text-2xl">{regime.icon}</span>
          <div>
            <div className={`text-xl font-bold ${regime.color}`}>{regime.label}</div>
            <div className="text-xs text-gray-500">{regime.confidence} confidence</div>
          </div>
        </div>
      </div>

      {/* Factor Weights */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-gray-600 mb-3">
          <BarChart3 className="w-4 h-4" />
          <span className="text-sm font-medium">Factor Exposures</span>
        </div>
        <div className="space-y-3">
          {factors.map((f) => (
            <FactorBar key={f.factor} {...f} />
          ))}
        </div>
      </div>

      {/* Risk Constraints */}
      <div className="border-t border-gray-100 pt-4">
        <div className="flex items-center gap-2 text-gray-600 mb-3">
          <Shield className="w-4 h-4" />
          <span className="text-sm font-medium">Risk Constraints</span>
        </div>
        <div className="space-y-0">
          <ConstraintRow
            label="Risk Tolerance"
            value={`${(beliefs.riskTolerance * 100).toFixed(0)}%`}
            icon={<Gauge className="w-3.5 h-3.5" />}
            color="text-indigo-600"
          />
          <ConstraintRow
            label="Max Drawdown"
            value={`${(beliefs.maxDrawdownThreshold * 100).toFixed(0)}%`}
            icon={<Activity className="w-3.5 h-3.5" />}
            color="text-red-600"
          />
          <ConstraintRow
            label="Volatility Target"
            value={`${(beliefs.volatilityTarget * 100).toFixed(1)}%`}
            icon={<Activity className="w-3.5 h-3.5" />}
          />
          <ConstraintRow
            label="Concentration Limit"
            value={`${(beliefs.concentrationLimit * 100).toFixed(0)}%`}
            icon={<Scale className="w-3.5 h-3.5" />}
          />
          <ConstraintRow
            label="Min Position"
            value={`${(beliefs.minPositionSize * 100).toFixed(1)}%`}
            icon={<Scale className="w-3.5 h-3.5" />}
          />
        </div>
      </div>

      {/* Conceptual Priors */}
      {beliefs.conceptualPriors.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="text-xs text-gray-500 mb-2">Conceptual Priors</div>
          <div className="flex flex-wrap gap-1">
            {beliefs.conceptualPriors.slice(0, 5).map((prior, idx) => (
              <span
                key={idx}
                className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded"
                title={prior}
              >
                {prior.length > 30 ? prior.slice(0, 30) + '...' : prior}
              </span>
            ))}
            {beliefs.conceptualPriors.length > 5 && (
              <span className="px-2 py-0.5 text-gray-400 text-xs">
                +{beliefs.conceptualPriors.length - 5} more
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
