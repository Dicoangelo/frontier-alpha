/**
 * RegimeDetector — Regime visualization + transition probability matrix.
 * Extracted from ML.tsx (Story UXR2-005).
 */

import React, { useState } from 'react';
import {
  TrendingUp,
  Activity,
  AlertTriangle,
  Gauge,
  ChevronDown,
  ChevronUp,
  Zap,
} from 'lucide-react';
import { Card } from '@/components/shared/Card';
import { ScrollableTable } from '@/components/shared/ScrollableTable';

// ── Types ──────────────────────────────────────────────────────

type MarketRegime = 'bull' | 'bear' | 'sideways' | 'volatile';

export interface RegimeState {
  regime: MarketRegime;
  confidence: number;
  probabilities: Record<MarketRegime, number>;
  transitionMatrix: Array<{ from: MarketRegime; to: Record<MarketRegime, number> }>;
}

// ── Constants ──────────────────────────────────────────────────

const REGIMES: MarketRegime[] = ['bull', 'bear', 'sideways', 'volatile'];

const REGIME_CONFIG: Record<
  MarketRegime,
  { label: string; color: string; bgColor: string; icon: typeof TrendingUp }
> = {
  bull: {
    label: 'Bull',
    color: 'var(--color-positive)',
    bgColor: 'color-mix(in srgb, var(--color-positive) 12%, transparent)',
    icon: TrendingUp,
  },
  bear: {
    label: 'Bear',
    color: 'var(--color-negative)',
    bgColor: 'color-mix(in srgb, var(--color-negative) 12%, transparent)',
    icon: AlertTriangle,
  },
  sideways: {
    label: 'Sideways',
    color: 'var(--color-warning)',
    bgColor: 'color-mix(in srgb, var(--color-warning) 12%, transparent)',
    icon: Activity,
  },
  volatile: {
    label: 'Volatile',
    color: 'var(--color-accent)',
    bgColor: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
    icon: Zap,
  },
};

export { REGIME_CONFIG };

// ── Component ──────────────────────────────────────────────────

interface RegimeDetectorProps {
  regime: RegimeState;
}

function RegimeDetectorInner({ regime }: RegimeDetectorProps) {
  const [showMatrix, setShowMatrix] = useState(false);
  const currentConfig = REGIME_CONFIG[regime.regime];
  const RegimeIcon = currentConfig.icon;

  const confidencePercent = Math.round(regime.confidence * 100);

  return (
    <Card>
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="mono text-[10px] sm:text-xs tracking-[0.3em] uppercase text-theme-muted mb-2">
            Live Regime
          </p>
          <h2 className="text-lg font-semibold text-theme flex items-center gap-2">
            <Gauge className="w-5 h-5 text-[var(--color-accent)]" aria-hidden="true" />
            Market Regime
          </h2>
        </div>
        <button
          onClick={() => setShowMatrix(!showMatrix)}
          className="px-3 py-1.5 mono text-[10px] tracking-[0.3em] uppercase text-theme-muted hover:text-theme glass-slab-floating rounded-lg flex items-center gap-1 animate-press transition-[color,background-color] duration-150"
          aria-expanded={showMatrix}
          aria-label="Toggle transition probability matrix"
        >
          Transitions
          {showMatrix ? <ChevronUp className="w-4 h-4" aria-hidden="true" /> : <ChevronDown className="w-4 h-4" aria-hidden="true" />}
        </button>
      </div>

      {/* Current Regime Badge */}
      <div className="flex items-center gap-4 mb-6">
        <div
          className="p-3 rounded-xl flex-shrink-0"
          style={{ backgroundColor: currentConfig.bgColor }}
          aria-hidden="true"
        >
          <RegimeIcon className="w-8 h-8" style={{ color: currentConfig.color }} />
        </div>
        <div>
          <p className="text-2xl font-bold tabular-nums" style={{ color: currentConfig.color }}>
            {currentConfig.label}
          </p>
          <p className="mono text-[10px] tracking-[0.2em] uppercase text-theme-muted mt-0.5">
            Current market regime
          </p>
        </div>
      </div>

      {/* Confidence Gauge */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Confidence</span>
          <span className="font-bold text-theme tabular-nums">{confidencePercent}%</span>
        </div>
        <div className="relative h-4 bg-[var(--color-bg-secondary)] rounded-full overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 bg-[image:var(--gradient-sovereign)]"
            style={{ width: `${confidencePercent}%` }}
          />
        </div>
      </div>

      {/* Regime Probabilities */}
      <div className="grid grid-cols-2 gap-3 mb-4 animate-stagger">
        {REGIMES.map((r) => {
          const rc = REGIME_CONFIG[r];
          const prob = regime.probabilities[r];
          const isActive = r === regime.regime;
          return (
            <div
              key={r}
              className="p-3 rounded-lg border transition-[background-color,border-color] duration-150 animate-enter"
              style={
                isActive
                  ? {
                      backgroundColor: rc.bgColor,
                      borderColor: rc.color,
                    }
                  : {
                      backgroundColor: 'var(--color-bg-secondary)',
                      borderColor: 'var(--color-border)',
                    }
              }
            >
              <div className="flex items-center justify-between">
                <span
                  className="text-sm font-medium"
                  style={{ color: isActive ? rc.color : 'var(--color-text)' }}
                >
                  {rc.label}
                </span>
                <span
                  className="text-sm mono font-bold tabular-nums"
                  style={{ color: isActive ? rc.color : 'var(--color-text-muted)' }}
                >
                  {(prob * 100).toFixed(0)}%
                </span>
              </div>
              <div className="mt-1 h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-[width,opacity] duration-300"
                  style={{
                    width: `${prob * 100}%`,
                    backgroundColor: isActive ? rc.color : 'var(--color-text-muted)',
                    opacity: isActive ? 1 : 0.3,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Transition Probability Matrix */}
      {showMatrix && (
        <ScrollableTable className="mt-4">
          <table className="w-full text-sm" role="img" aria-label="Regime transition probability matrix">
            <thead>
              <tr>
                <th className="text-left p-2 mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">From → To</th>
                {REGIMES.map((r) => (
                  <th key={r} className="p-2 text-center mono text-[10px] tracking-[0.3em] uppercase" style={{ color: REGIME_CONFIG[r].color }}>
                    {REGIME_CONFIG[r].label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {regime.transitionMatrix.map((row) => (
                <tr key={row.from} className="border-t border-[var(--color-border)] transition-[background-color] duration-150 hover:bg-[var(--color-bg-tertiary)]">
                  <td className="p-2 font-medium" style={{ color: REGIME_CONFIG[row.from].color }}>
                    {REGIME_CONFIG[row.from].label}
                  </td>
                  {REGIMES.map((to) => {
                    const prob = row.to[to];
                    const isHigh = prob > 0.3;
                    return (
                      <td key={to} className="p-2 text-center">
                        <span
                          className={`mono text-xs tabular-nums ${
                            isHigh ? 'font-bold text-theme' : 'text-theme-muted'
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
        </ScrollableTable>
      )}
    </Card>
  );
}

export const RegimeDetector = React.memo(RegimeDetectorInner);
export default RegimeDetector;
