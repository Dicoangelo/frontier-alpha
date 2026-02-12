import { useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus, Brain } from 'lucide-react';
import { Card } from '@/components/shared/Card';
import { Spinner } from '@/components/shared/Spinner';
import { useCVRFBeliefs } from '@/hooks/useCVRF';
import type { EarningsCalendarItem } from '@/api/earnings';

interface BeliefImpactPanelProps {
  earnings: EarningsCalendarItem[];
  selectedSymbol: string | null;
}

interface FactorImpact {
  factor: string;
  currentWeight: number;
  currentConfidence: number;
  estimatedChange: number; // simulated delta from earnings
  direction: 'up' | 'down' | 'neutral';
}

// Factors typically affected by earnings results
const EARNINGS_SENSITIVE_FACTORS = [
  'roe', 'roa', 'gross_margin', 'net_margin', 'revenue_growth',
  'earnings_momentum', 'quality', 'momentum_12m', 'value',
];

function estimateImpact(
  factorWeights: Record<string, number>,
  factorConfidences: Record<string, number>,
  symbol: string,
  expectedMove: number,
): FactorImpact[] {
  const impacts: FactorImpact[] = [];

  for (const factor of EARNINGS_SENSITIVE_FACTORS) {
    const weight = factorWeights[factor];
    if (weight === undefined) continue;

    const confidence = factorConfidences[factor] || 0.5;

    // Simulate earnings impact on factor belief
    // Higher expected move = larger potential belief shift
    const moveMagnitude = Math.abs(expectedMove);
    const scaledDelta = moveMagnitude * (1 - confidence) * 0.3; // bigger shifts when confidence is low

    // Quality/profitability factors correlate positively with beats
    const isQualityFactor = ['roe', 'roa', 'gross_margin', 'net_margin', 'quality'].includes(factor);
    const baseDirection = isQualityFactor ? 1 : (factor.includes('momentum') ? 0.5 : 0);
    const estimatedChange = scaledDelta * (baseDirection > 0 ? 1 : -0.3);

    impacts.push({
      factor,
      currentWeight: weight,
      currentConfidence: confidence,
      estimatedChange,
      direction: estimatedChange > 0.01 ? 'up' : estimatedChange < -0.01 ? 'down' : 'neutral',
    });
  }

  return impacts.sort((a, b) => Math.abs(b.estimatedChange) - Math.abs(a.estimatedChange));
}

function formatFactor(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

export function BeliefImpactPanel({ earnings, selectedSymbol }: BeliefImpactPanelProps) {
  const { data: beliefs, isLoading } = useCVRFBeliefs();

  const selectedEarning = useMemo(() => {
    if (!selectedSymbol) return null;
    return earnings.find(e => e.symbol === selectedSymbol) || null;
  }, [earnings, selectedSymbol]);

  const impacts = useMemo(() => {
    if (!beliefs || !selectedEarning) return [];
    return estimateImpact(
      beliefs.factorWeights,
      beliefs.factorConfidences,
      selectedEarning.symbol,
      selectedEarning.expectedMove || 0.05,
    );
  }, [beliefs, selectedEarning]);

  if (!selectedSymbol) {
    return (
      <Card title="CVRF Belief Impact">
        <div className="flex flex-col items-center justify-center h-48 text-[var(--color-text-muted)]">
          <Brain className="w-10 h-10 mb-3 opacity-40" />
          <p className="text-sm">Select an earnings event to see projected CVRF impact</p>
        </div>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card title="CVRF Belief Impact">
        <div className="flex items-center justify-center h-48">
          <Spinner className="w-6 h-6" />
        </div>
      </Card>
    );
  }

  if (!beliefs) {
    return (
      <Card title="CVRF Belief Impact">
        <div className="flex flex-col items-center justify-center h-48 text-[var(--color-text-muted)]">
          <Brain className="w-10 h-10 mb-3 opacity-40" />
          <p className="text-sm">CVRF beliefs not available</p>
        </div>
      </Card>
    );
  }

  const regime = beliefs.currentRegime;
  const regimeConfidence = beliefs.regimeConfidence;

  return (
    <Card title="CVRF Belief Impact">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--color-text)]">
              {selectedSymbol} Earnings Impact
            </p>
            <p className="text-xs text-[var(--color-text-muted)]">
              Expected move: ±{((selectedEarning?.expectedMove || 0) * 100).toFixed(1)}%
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-[var(--color-text-muted)]">Regime</p>
            <p className="text-sm font-medium capitalize text-[var(--color-text)]">
              {regime} ({(regimeConfidence * 100).toFixed(0)}%)
            </p>
          </div>
        </div>

        {/* Factor impacts */}
        {impacts.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)] text-center py-4">
            No earnings-sensitive factors in current beliefs
          </p>
        ) : (
          <div className="space-y-2">
            {impacts.slice(0, 6).map((impact) => (
              <div
                key={impact.factor}
                className="flex items-center justify-between py-2 border-b border-[var(--color-border-light)] last:border-0"
              >
                <div className="flex items-center gap-2">
                  {impact.direction === 'up' ? (
                    <TrendingUp className="w-3.5 h-3.5 text-[var(--color-positive)]" />
                  ) : impact.direction === 'down' ? (
                    <TrendingDown className="w-3.5 h-3.5 text-[var(--color-negative)]" />
                  ) : (
                    <Minus className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
                  )}
                  <span className="text-sm text-[var(--color-text)]">{formatFactor(impact.factor)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {impact.currentWeight.toFixed(2)}
                  </span>
                  <span className="text-xs text-[var(--color-text-muted)]">&rarr;</span>
                  <span className={`text-xs font-medium ${
                    impact.direction === 'up' ? 'text-[var(--color-positive)]' :
                    impact.direction === 'down' ? 'text-[var(--color-negative)]' :
                    'text-[var(--color-text-secondary)]'
                  }`}>
                    {(impact.currentWeight + impact.estimatedChange).toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Summary */}
        {impacts.length > 0 && (
          <div className="pt-2 text-xs text-[var(--color-text-muted)] bg-[var(--color-bg-tertiary)] rounded-lg p-3">
            <p>
              {impacts.filter(i => i.direction === 'up').length} factors may strengthen,{' '}
              {impacts.filter(i => i.direction === 'down').length} may weaken after {selectedSymbol} reports.
              {(selectedEarning?.expectedMove || 0) >= 0.08 && (
                <span className="text-[var(--color-warning)]"> High volatility expected.</span>
              )}
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
