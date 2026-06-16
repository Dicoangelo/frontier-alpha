/**
 * Contribution Waterfall — drill-down that answers "which factors actually
 * drive my portfolio's signal, and in which direction?"
 *
 * The Factors grid shows 80+ raw exposures with equal visual weight. This card
 * aggregates each factor's *contribution* across holdings, ranks them, and
 * renders a classic floating-bar waterfall so the cumulative build-up from zero
 * to the net signal is legible at a glance. Positive contributions step the
 * running total right (green); negative step it left (red). No new API surface —
 * it reads the same `contribution` field the grid already receives.
 *
 * ROADMAP "Next session candidates" #2 (Factors page deeper drill-down).
 */

import { useMemo } from 'react';
import { Waves, Info } from 'lucide-react';
import type { FactorExposureWithCategory } from '@/api/factors';

const TOP_N = 8;

export interface WaterfallStep {
  /** Factor name, or the synthetic 'Other' bucket. */
  factor: string;
  category: string;
  /** Aggregate (summed-across-holdings) contribution. */
  contribution: number;
  /** Average exposure across holdings (for the explainer). */
  exposure: number;
  /** How many (symbol, factor) rows folded into this step. */
  count: number;
}

export interface WaterfallModel {
  steps: WaterfallStep[];
  net: number;
  /** True when no factor carries any contribution signal. */
  empty: boolean;
}

/**
 * Pure aggregation: fold per-(symbol, factor) exposures into ranked,
 * net-preserving waterfall steps. Exported for unit testing.
 *
 * The `net` total always equals the sum of every input contribution — the
 * `Other` bucket exists precisely so truncating to the top N never changes the
 * total the user sees.
 */
export function aggregateContributions(
  factors: FactorExposureWithCategory[],
  topN: number = TOP_N,
): WaterfallModel {
  const byName = new Map<string, { contribution: number; exposureSum: number; count: number; category: string }>();

  for (const f of factors) {
    const existing = byName.get(f.factor) ?? {
      contribution: 0,
      exposureSum: 0,
      count: 0,
      category: f.category,
    };
    existing.contribution += f.contribution ?? 0;
    existing.exposureSum += f.exposure ?? 0;
    existing.count += 1;
    byName.set(f.factor, existing);
  }

  const all: WaterfallStep[] = [...byName.entries()].map(([factor, v]) => ({
    factor,
    category: v.category,
    contribution: v.contribution,
    exposure: v.count > 0 ? v.exposureSum / v.count : 0,
    count: v.count,
  }));

  const net = all.reduce((sum, s) => sum + s.contribution, 0);

  // Rank by magnitude of contribution; the loudest drivers come first.
  all.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  let steps = all;
  if (all.length > topN) {
    const head = all.slice(0, topN);
    const tail = all.slice(topN);
    const otherContribution = tail.reduce((sum, s) => sum + s.contribution, 0);
    steps = [
      ...head,
      {
        factor: 'Other',
        category: 'Other',
        contribution: otherContribution,
        exposure: 0,
        count: tail.reduce((sum, s) => sum + s.count, 0),
      },
    ];
  }

  const empty = all.every((s) => Math.abs(s.contribution) < 1e-9);

  return { steps, net, empty };
}

const CATEGORY_BAR: Record<string, string> = {
  style: 'var(--color-accent)',
  macro: 'var(--color-negative)',
  sector: 'var(--color-info)',
  volatility: 'var(--color-warning)',
  sentiment: 'var(--color-positive)',
  Other: 'var(--color-text-muted)',
};

function prettyFactor(name: string): string {
  if (name === 'Other') return 'Other factors';
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ContributionWaterfall({ factors }: { factors: FactorExposureWithCategory[] }) {
  const model = useMemo(() => aggregateContributions(factors), [factors]);

  // Build the floating-bar geometry: each step spans [from, to] of the running
  // cumulative total. The domain is padded to include 0 and the net so the
  // zero line and the final total both sit on the same scale.
  const geometry = useMemo(() => {
    let cum = 0;
    const bars = model.steps.map((step) => {
      const from = cum;
      cum += step.contribution;
      const to = cum;
      return { step, from, to, lo: Math.min(from, to), hi: Math.max(from, to) };
    });

    const cumulatives = bars.flatMap((b) => [b.from, b.to]);
    const domainMin = Math.min(0, ...cumulatives, model.net);
    const domainMax = Math.max(0, ...cumulatives, model.net);
    const span = domainMax - domainMin || 1;
    const x = (v: number) => ((v - domainMin) / span) * 100;

    return { bars, x, zeroPct: ((0 - domainMin) / span) * 100 };
  }, [model]);

  if (factors.length === 0 || model.empty) {
    return null;
  }

  return (
    <div className="glass-slab rounded-2xl p-5 sm:p-6 animate-fade-in-up">
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-3">
          <div
            className="p-2 rounded-lg flex-shrink-0"
            style={{ backgroundColor: 'color-mix(in srgb, var(--color-accent) 12%, transparent)' }}
          >
            <Waves className="w-5 h-5" style={{ color: 'var(--color-accent)' }} aria-hidden="true" />
          </div>
          <div>
            <h3 className="font-semibold text-[var(--color-text)]">Signal Contribution Waterfall</h3>
            <p className="text-sm text-[var(--color-text-muted)]">
              How each factor builds your net signal, ranked by impact
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Net Signal</p>
          <p
            className="mono tabular-nums text-lg font-bold"
            style={{ color: model.net >= 0 ? 'var(--color-positive)' : 'var(--color-negative)' }}
          >
            {model.net >= 0 ? '+' : ''}
            {model.net.toFixed(3)}
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-1.5" role="list" aria-label="Factor contribution waterfall">
        {geometry.bars.map(({ step, lo, hi, to }) => {
          const color = CATEGORY_BAR[step.category] ?? 'var(--color-text-muted)';
          const leftPct = geometry.x(lo);
          const widthPct = Math.max(geometry.x(hi) - geometry.x(lo), 0.8);
          const positive = step.contribution >= 0;
          return (
            <div
              key={step.factor}
              role="listitem"
              className="grid grid-cols-[9rem_1fr_4.5rem] sm:grid-cols-[11rem_1fr_5rem] items-center gap-3 group"
              title={`${prettyFactor(step.factor)} · contribution ${step.contribution >= 0 ? '+' : ''}${step.contribution.toFixed(
                3,
              )} · avg exposure ${step.exposure.toFixed(2)} · ${step.count} holding${step.count === 1 ? '' : 's'}`}
            >
              <span className="text-sm text-theme-secondary truncate">{prettyFactor(step.factor)}</span>
              <div className="relative h-5 rounded-sm bg-[var(--color-bg-tertiary)] overflow-hidden">
                {/* zero reference line */}
                <div
                  className="absolute top-0 bottom-0 w-px bg-[var(--color-border)]"
                  style={{ left: `${geometry.zeroPct}%` }}
                  aria-hidden="true"
                />
                <div
                  className="absolute top-0.5 bottom-0.5 rounded-sm transition-[filter] duration-200 group-hover:brightness-110"
                  style={{
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    backgroundColor: color,
                    opacity: positive ? 0.85 : 0.6,
                  }}
                />
              </div>
              <span
                className="mono tabular-nums text-xs text-right font-medium"
                style={{ color: positive ? 'var(--color-positive)' : 'var(--color-negative)' }}
              >
                {positive ? '+' : ''}
                {step.contribution.toFixed(3)}
                <span className="block text-[10px] text-theme-muted font-normal">
                  Σ {to.toFixed(2)}
                </span>
              </span>
            </div>
          );
        })}
      </div>

      <p className="flex items-start gap-1.5 mt-4 text-xs text-theme-muted leading-relaxed">
        <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" aria-hidden="true" />
        <span>
          Bars float from the running total (Σ): green steps push the net signal
          up, red steps pull it down. Contributions are summed across every
          holding that loads each factor.
        </span>
      </p>
    </div>
  );
}

export default ContributionWaterfall;
