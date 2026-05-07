import { useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, Minus, Brain, ChevronDown, ChevronUp } from 'lucide-react';
import { Card } from '@/components/shared/Card';
import { Spinner } from '@/components/shared/Spinner';
import { useCVRFBeliefs } from '@/hooks/useCVRF';
import type { EarningsCalendarItem } from '@/api/earnings';

function useIsMobile(): boolean {
  return typeof window !== 'undefined' && window.innerWidth < 640;
}

interface ConvictionGaugeProps {
  value: number; // 0-1
  size?: number;
}

function ConvictionGauge({ value, size = 64 }: ConvictionGaugeProps) {
  const r = size * 0.38;
  const cx = size / 2;
  const cy = size / 2;
  const startAngle = -Math.PI * 0.8;
  const endAngle = Math.PI * 0.8;
  const totalArc = endAngle - startAngle;
  const fillAngle = startAngle + totalArc * Math.min(Math.max(value, 0), 1);

  const polarX = (angle: number) => cx + r * Math.cos(angle);
  const polarY = (angle: number) => cy + r * Math.sin(angle);

  const bgPath = `M ${polarX(startAngle)} ${polarY(startAngle)} A ${r} ${r} 0 1 1 ${polarX(endAngle)} ${polarY(endAngle)}`;
  const fillPath = value <= 0 ? '' : `M ${polarX(startAngle)} ${polarY(startAngle)} A ${r} ${r} 0 ${fillAngle - startAngle > Math.PI ? 1 : 0} 1 ${polarX(fillAngle)} ${polarY(fillAngle)}`;

  const color = value >= 0.7 ? 'var(--color-positive)' : value >= 0.4 ? 'var(--color-warning)' : 'var(--color-negative)';

  return (
    <svg width={size} height={size} aria-label={`Conviction gauge: ${(value * 100).toFixed(0)}%`}>
      <path d={bgPath} fill="none" stroke="var(--color-border)" strokeWidth={size * 0.09} strokeLinecap="round" />
      {fillPath && (
        <path d={fillPath} fill="none" stroke={color} strokeWidth={size * 0.09} strokeLinecap="round" />
      )}
      <text x={cx} y={cy + size * 0.06} textAnchor="middle" fontSize={size * 0.22} fontWeight="600" fill="var(--color-text)" fontFamily="var(--font-mono)">
        {(value * 100).toFixed(0)}
      </text>
      <text x={cx} y={cy + size * 0.22} textAnchor="middle" fontSize={size * 0.12} fill="var(--color-text-muted)" fontFamily="var(--font-mono)">
        %
      </text>
    </svg>
  );
}

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
  _symbol: string,
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
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(false);

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

  // Historical accuracy proxy: average regime confidence
  const historicalAccuracy = useMemo(() => {
    if (!beliefs) return null;
    return beliefs.regimeConfidence;
  }, [beliefs]);

  // Overall conviction score: average confidence of impacted factors
  const overallConviction = useMemo(() => {
    if (impacts.length === 0) return 0;
    return impacts.reduce((sum, i) => sum + i.currentConfidence, 0) / impacts.length;
  }, [impacts]);

  if (!selectedSymbol) {
    return (
      <Card title="CVRF Belief Impact">
        <div className="glass-slab gradient-brand-subtle rounded-2xl flex flex-col items-center justify-center min-h-[192px] p-8 text-theme-muted">
          <Brain className="w-10 h-10 mb-3 opacity-50" aria-hidden="true" />
          <p className="text-sm text-theme-secondary">No belief history — record decisions to build conviction</p>
        </div>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card title="CVRF Belief Impact">
        <div className="flex items-center justify-center min-h-[192px]">
          <Spinner className="w-6 h-6" />
        </div>
      </Card>
    );
  }

  if (!beliefs) {
    return (
      <Card title="CVRF Belief Impact">
        <div className="glass-slab gradient-brand-subtle rounded-2xl flex flex-col items-center justify-center min-h-[192px] p-8 text-theme-muted">
          <Brain className="w-10 h-10 mb-3 opacity-50" aria-hidden="true" />
          <p className="text-sm text-theme-secondary">No belief history — record decisions to build conviction</p>
        </div>
      </Card>
    );
  }

  const regime = beliefs.currentRegime;
  const regimeConfidence = beliefs.regimeConfidence;

  return (
    <Card title="CVRF Belief Impact">
      <div className="space-y-4">
        {/* Header with mobile collapse toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Symbol · Earnings</p>
            <p className="text-sm font-medium text-theme mt-0.5">
              {selectedSymbol} Earnings Impact
            </p>
            <p className="mono tabular-nums text-xs text-theme-muted mt-1">
              Expected move: ±{((selectedEarning?.expectedMove || 0) * 100).toFixed(1)}%
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Regime</p>
              <p className="text-sm font-medium capitalize text-theme mt-0.5 mono tabular-nums">
                {regime} ({(regimeConfidence * 100).toFixed(0)}%)
              </p>
            </div>
            {isMobile && (
              <button
                onClick={() => setCollapsed(c => !c)}
                className="p-1.5 hover:bg-theme-tertiary rounded-lg transition-colors duration-200 animate-press"
                aria-label={collapsed ? 'Expand panel' : 'Collapse panel'}
              >
                {collapsed
                  ? <ChevronDown className="w-4 h-4 text-theme-muted" aria-hidden="true" />
                  : <ChevronUp className="w-4 h-4 text-theme-muted" aria-hidden="true" />
                }
              </button>
            )}
          </div>
        </div>

        {(!isMobile || !collapsed) && (
          <>
            {/* Conviction gauge + historical accuracy */}
            {impacts.length > 0 && (
              <div className="glass-slab rounded-xl flex items-center gap-4 p-3 animate-enter">
                <ConvictionGauge value={overallConviction} size={64} />
                <div className="flex-1 space-y-1">
                  <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme">Factor Conviction</p>
                  <p className="text-xs text-theme-muted leading-relaxed">
                    Avg. confidence across <span className="mono tabular-nums">{impacts.length}</span> earnings-sensitive factors
                  </p>
                  {historicalAccuracy !== null && (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="mono text-[10px] tracking-wider uppercase text-theme-muted">Regime accuracy:</span>
                      <span className="mono tabular-nums text-xs font-semibold text-theme">
                        {(historicalAccuracy * 100).toFixed(0)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Factor impacts */}
            {impacts.length === 0 ? (
              <p className="text-sm text-theme-muted text-center py-4">
                No earnings-sensitive factors in current beliefs
              </p>
            ) : (
              <div className="space-y-2 animate-stagger">
                {impacts.slice(0, 6).map((impact) => (
                  <div
                    key={impact.factor}
                    className="animate-enter flex items-center justify-between py-2 border-b border-theme-light last:border-0"
                  >
                    <div className="flex items-center gap-2">
                      {impact.direction === 'up' ? (
                        <TrendingUp className="w-3.5 h-3.5 text-[var(--color-positive)]" aria-hidden="true" />
                      ) : impact.direction === 'down' ? (
                        <TrendingDown className="w-3.5 h-3.5 text-[var(--color-negative)]" aria-hidden="true" />
                      ) : (
                        <Minus className="w-3.5 h-3.5 text-theme-muted" aria-hidden="true" />
                      )}
                      <span className="mono text-xs tracking-wider uppercase text-theme">{formatFactor(impact.factor)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="mono tabular-nums text-xs text-theme-muted">
                        {impact.currentWeight.toFixed(2)}
                      </span>
                      <span className="mono text-xs text-theme-muted" aria-hidden="true">&rarr;</span>
                      <span className={`mono tabular-nums text-xs font-semibold ${
                        impact.direction === 'up' ? 'text-[var(--color-positive)]' :
                        impact.direction === 'down' ? 'text-[var(--color-negative)]' :
                        'text-theme-secondary'
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
              <div className="glass-slab rounded-xl p-3 mono text-xs text-theme-muted leading-relaxed">
                <p>
                  <span className="tabular-nums">{impacts.filter(i => i.direction === 'up').length}</span> factors may strengthen,{' '}
                  <span className="tabular-nums">{impacts.filter(i => i.direction === 'down').length}</span> may weaken after {selectedSymbol} reports.
                  {(selectedEarning?.expectedMove || 0) >= 0.08 && (
                    <span className="text-[var(--color-warning)]"> High volatility expected.</span>
                  )}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
