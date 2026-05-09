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
        <span className="font-medium text-theme-secondary capitalize">{factor}</span>
        <div className="flex items-center gap-2">
          <span className={`mono tabular-nums ${isPositive ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}>
            {isPositive ? '+' : ''}{(weight * 100).toFixed(1)}%
          </span>
          <span className="mono text-[10px] tracking-[0.2em] uppercase text-theme-muted tabular-nums">
            ({(confidence * 100).toFixed(0)}% conf)
          </span>
        </div>
      </div>
      <div className="h-2 bg-[var(--color-bg-secondary)] rounded-full overflow-hidden">
        <div
          className={`h-full transition-[width,opacity] duration-300 ${
            isPositive ? 'bg-[var(--color-positive)]' : 'bg-[var(--color-negative)]'
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

function ConstraintRow({ label, value, icon, color = 'text-theme' }: ConstraintRowProps) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-[var(--color-border-light)] last:border-0">
      <div className="flex items-center gap-2 text-theme-muted">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <span className={`mono text-sm font-medium tabular-nums ${color}`}>{value}</span>
    </div>
  );
}

export function CVRFBeliefDisplay() {
  const { data: beliefs, isLoading, isError } = useCVRFBeliefs();
  const regime = useRegimeDisplay(beliefs?.currentRegime, beliefs?.regimeConfidence);

  if (isLoading) {
    return (
      <div className="glass-slab rounded-2xl p-6 sm:p-8 animate-shimmer">
        <div className="h-6 bg-[var(--color-border)] rounded w-1/3 mb-6" />
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-4 bg-[var(--color-border)] rounded w-1/4" />
              <div className="h-2 bg-[var(--color-border)] rounded w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError || !beliefs) {
    return (
      <div
        className="glass-slab-floating relative overflow-hidden rounded-2xl p-6 sm:p-8 shadow-[0_18px_60px_-20px_rgba(239,68,68,0.45)] before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-[var(--color-negative)]"
        role="alert"
      >
        <p className="mono text-[10px] sm:text-xs tracking-[0.3em] uppercase text-theme-muted mb-2">Belief State</p>
        <p className="text-[var(--color-negative)] text-sm">Failed to load belief state</p>
      </div>
    );
  }

  // Guard against partial belief state on fresh accounts — both maps are
  // serialized objects from the server and may be missing.
  const factorWeightsObj = beliefs.factorWeights ?? {};
  const factorConfidencesObj = beliefs.factorConfidences ?? {};
  const factors = Object.entries(factorWeightsObj).map(([factor, weight]) => ({
    factor,
    weight: weight as number,
    confidence: (factorConfidencesObj[factor] as number) || 0.5,
  }));
  const conceptualPriors = beliefs.conceptualPriors ?? [];

  return (
    <div className="glass-slab rounded-2xl p-6 sm:p-8 animate-enter">
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="mono text-[10px] sm:text-xs tracking-[0.3em] uppercase text-theme-muted mb-2">
            Belief State
          </p>
          <h3 className="text-lg font-semibold text-theme flex items-center gap-2">
            <Scale className="w-5 h-5 text-[var(--color-accent)]" aria-hidden="true" />
            Active Posture
          </h3>
        </div>
        <span className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted tabular-nums">
          v{beliefs.version}
        </span>
      </div>

      {/* Market Regime */}
      <div className="mb-6 glass-slab-floating rounded-xl p-4">
        <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted mb-2">Market Regime</p>
        <div className="flex items-center gap-3">
          <span className="text-2xl" aria-hidden="true">{regime.icon}</span>
          <div>
            <p className={`text-xl font-bold ${regime.color}`}>{regime.label}</p>
            <p className="mono text-[10px] tracking-[0.2em] uppercase text-theme-muted tabular-nums">
              {regime.confidence} confidence
            </p>
          </div>
        </div>
      </div>

      {/* Factor Weights */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-theme-secondary mb-3">
          <BarChart3 className="w-4 h-4" aria-hidden="true" />
          <span className="mono text-[10px] tracking-[0.3em] uppercase">Factor Exposures</span>
        </div>
        <div className="space-y-3">
          {factors.length === 0 ? (
            <p className="text-xs text-theme-muted">
              Factor weights initialize after your first CVRF cycle.
            </p>
          ) : (
            factors.map((f) => <FactorBar key={f.factor} {...f} />)
          )}
        </div>
      </div>

      {/* Risk Constraints */}
      <div className="border-t border-[var(--color-border-light)] pt-4">
        <div className="flex items-center gap-2 text-theme-secondary mb-3">
          <Shield className="w-4 h-4" aria-hidden="true" />
          <span className="mono text-[10px] tracking-[0.3em] uppercase">Risk Constraints</span>
        </div>
        <div className="space-y-0">
          <ConstraintRow
            label="Risk Tolerance"
            value={`${(beliefs.riskTolerance * 100).toFixed(0)}%`}
            icon={<Gauge className="w-3.5 h-3.5" />}
            color="text-[var(--color-accent)]"
          />
          <ConstraintRow
            label="Max Drawdown"
            value={`${(beliefs.maxDrawdownThreshold * 100).toFixed(0)}%`}
            icon={<Activity className="w-3.5 h-3.5" />}
            color="text-[var(--color-negative)]"
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
      {conceptualPriors.length > 0 && (
        <div className="mt-4 pt-4 border-t border-[var(--color-border-light)]">
          <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted mb-2">Conceptual Priors</p>
          <div className="flex flex-wrap gap-1">
            {conceptualPriors.slice(0, 5).map((prior) => (
              <span
                key={prior.id}
                className={`px-2 py-0.5 text-xs rounded ${
                  prior.impactDirection === 'positive'
                    ? 'bg-[color-mix(in_srgb,var(--color-positive)_10%,transparent)] text-[var(--color-positive)]'
                    : prior.impactDirection === 'negative'
                    ? 'bg-[color-mix(in_srgb,var(--color-negative)_10%,transparent)] text-[var(--color-negative)]'
                    : 'bg-[var(--color-bg-secondary)] text-theme-secondary'
                }`}
                title={prior.concept}
              >
                {prior.concept.length > 40 ? prior.concept.slice(0, 40) + '...' : prior.concept}
              </span>
            ))}
            {conceptualPriors.length > 5 && (
              <span className="px-2 py-0.5 text-theme-muted text-xs tabular-nums">
                +{conceptualPriors.length - 5} more
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
