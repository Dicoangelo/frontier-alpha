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
    bgColor: 'color-mix(in srgb, var(--color-positive) 10%, transparent)',
    icon: TrendingUp,
  },
  bear: {
    label: 'Bear',
    color: 'var(--color-negative)',
    bgColor: 'color-mix(in srgb, var(--color-negative) 10%, transparent)',
    icon: AlertTriangle,
  },
  sideways: {
    label: 'Sideways',
    color: 'var(--color-warning)',
    bgColor: 'color-mix(in srgb, var(--color-warning) 10%, transparent)',
    icon: Activity,
  },
  volatile: {
    label: 'Volatile',
    color: 'var(--color-accent)',
    bgColor: 'color-mix(in srgb, var(--color-accent) 10%, transparent)',
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
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-[var(--color-text)] flex items-center gap-2">
          <Gauge className="w-5 h-5 text-[var(--color-accent)]" />
          Market Regime
        </h2>
        <button
          onClick={() => setShowMatrix(!showMatrix)}
          className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] flex items-center gap-1 transition-colors hover:bg-[var(--color-bg-secondary)] rounded-lg transition-colors"
          aria-expanded={showMatrix}
          aria-label="Toggle transition probability matrix"
        >
          Transitions
          {showMatrix ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Current Regime Badge */}
      <div className="flex items-center gap-4 mb-6">
        <div
          className="p-3 rounded-xl"
          style={{ backgroundColor: currentConfig.bgColor }}
        >
          <RegimeIcon className="w-8 h-8" style={{ color: currentConfig.color }} />
        </div>
        <div>
          <div className="text-2xl font-bold" style={{ color: currentConfig.color }}>
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
            className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
            style={{
              width: `${confidencePercent}%`,
              background: 'linear-gradient(to right, var(--color-accent), var(--chart-purple))',
            }}
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
              className="p-3 rounded-lg border transition-colors"
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
                  className="text-sm font-mono font-bold"
                  style={{ color: isActive ? rc.color : 'var(--color-text-muted)' }}
                >
                  {(prob * 100).toFixed(0)}%
                </span>
              </div>
              <div className="mt-1 h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
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
                <th className="text-left p-2 text-[var(--color-text-muted)]">From \ To</th>
                {REGIMES.map((r) => (
                  <th key={r} className="p-2 text-center" style={{ color: REGIME_CONFIG[r].color }}>
                    {REGIME_CONFIG[r].label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {regime.transitionMatrix.map((row) => (
                <tr key={row.from} className="border-t border-[var(--color-border)]">
                  <td className="p-2 font-medium" style={{ color: REGIME_CONFIG[row.from].color }}>
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
        </ScrollableTable>
      )}
    </Card>
  );
}

export const RegimeDetector = React.memo(RegimeDetectorInner);
export default RegimeDetector;
