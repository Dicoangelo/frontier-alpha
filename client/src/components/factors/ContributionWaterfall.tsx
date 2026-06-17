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

import { useMemo, useState } from 'react';
import { Waves, Info } from 'lucide-react';
import type { FactorExposureWithCategory } from '@/api/factors';

const TOP_N = 8;

/** Significance threshold — |t| > 1.96 ≈ 95% confidence. */
const SIGNIFICANCE_T = 1.96;

export interface WaterfallStep {
  /** Factor name, or the synthetic 'Other' bucket. */
  factor: string;
  category: string;
  /** Aggregate (summed-across-holdings) contribution. */
  contribution: number;
  /** Average exposure across holdings (for the explainer). */
  exposure: number;
  /** Average |t-stat| across holdings — drives the significance verdict. */
  tStat: number;
  /** Average confidence (0-1) across holdings. */
  confidence: number;
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
  const byName = new Map<
    string,
    { contribution: number; exposureSum: number; tStatSum: number; confidenceSum: number; count: number; category: string }
  >();

  for (const f of factors) {
    const existing = byName.get(f.factor) ?? {
      contribution: 0,
      exposureSum: 0,
      tStatSum: 0,
      confidenceSum: 0,
      count: 0,
      category: f.category,
    };
    existing.contribution += f.contribution ?? 0;
    existing.exposureSum += f.exposure ?? 0;
    existing.tStatSum += Math.abs(f.tStat ?? 0);
    existing.confidenceSum += f.confidence ?? 0;
    existing.count += 1;
    byName.set(f.factor, existing);
  }

  const all: WaterfallStep[] = [...byName.entries()].map(([factor, v]) => ({
    factor,
    category: v.category,
    contribution: v.contribution,
    exposure: v.count > 0 ? v.exposureSum / v.count : 0,
    tStat: v.count > 0 ? v.tStatSum / v.count : 0,
    confidence: v.count > 0 ? v.confidenceSum / v.count : 0,
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
        tStat: 0,
        confidence: 0,
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

/**
 * Plain-English explainer per factor. Keyed by exact factor name with a
 * keyword fallback so new factor variants still get a sensible description
 * rather than a blank panel.
 */
const FACTOR_DESCRIPTIONS: Record<string, string> = {
  momentum_12m: '12-month price momentum relative to the market.',
  momentum_6m: '6-month price momentum relative to the market.',
  momentum_3m: '3-month price momentum relative to the market.',
  value: 'Book-to-market tilt — value vs. growth positioning.',
  pe_ratio: 'Earnings yield — price relative to earnings.',
  pb_ratio: 'Price relative to book value.',
  roe: 'Return on equity — profitability vs. shareholder capital.',
  roa: 'Return on assets — profitability vs. total assets.',
  gross_margin: 'Gross profitability of revenue.',
  low_vol: 'Preference for low-volatility, stable names.',
  volatility: 'Exposure to historical price volatility.',
  size: 'Market-cap tilt — large vs. small cap.',
  interest_rate_sensitivity: 'Sensitivity to interest-rate moves.',
  inflation_beta: 'Response to inflation expectations.',
  vix_beta: 'Response to market-volatility (VIX) shocks.',
};

function describeFactor(name: string): string {
  if (name === 'Other') return 'The combined tail of lower-impact factors.';
  if (FACTOR_DESCRIPTIONS[name]) return FACTOR_DESCRIPTIONS[name];
  if (name.startsWith('momentum')) return 'Price momentum relative to the market.';
  if (name.startsWith('sector_')) return `Exposure to the ${name.replace('sector_', '')} sector.`;
  return 'Factor exposure derived from the institutional core set.';
}

function significanceLabel(tStat: number): { label: string; significant: boolean } {
  return tStat > SIGNIFICANCE_T
    ? { label: `Significant (|t| ${tStat.toFixed(1)})`, significant: true }
    : { label: `Not significant (|t| ${tStat.toFixed(1)})`, significant: false };
}

function Stat({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'positive' | 'muted' }) {
  const color =
    tone === 'positive' ? 'var(--color-positive)' : tone === 'muted' ? 'var(--color-text-muted)' : 'var(--color-text)';
  return (
    <div>
      <p className="mono text-[10px] tracking-[0.2em] uppercase text-theme-muted">{label}</p>
      <p className="mono tabular-nums text-sm font-semibold mt-0.5" style={{ color }}>
        {value}
      </p>
    </div>
  );
}

export function ContributionWaterfall({ factors }: { factors: FactorExposureWithCategory[] }) {
  const model = useMemo(() => aggregateContributions(factors), [factors]);
  const [expanded, setExpanded] = useState<string | null>(null);

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
          const isOpen = expanded === step.factor;
          const sig = significanceLabel(step.tStat);
          return (
            <div key={step.factor} role="listitem">
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : step.factor)}
                aria-expanded={isOpen}
                className="w-full grid grid-cols-[9rem_1fr_4.5rem] sm:grid-cols-[11rem_1fr_5rem] items-center gap-3 group text-left rounded-sm px-1 -mx-1 py-0.5 hover:bg-[var(--color-bg-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 transition-colors"
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
              </button>

              {isOpen && (
                <div className="mt-1 mb-2 ml-1 rounded-lg border border-[var(--color-border-light)] bg-[var(--color-bg-tertiary)] p-3 animate-fade-in-up">
                  <p className="text-sm text-theme-secondary leading-relaxed">{describeFactor(step.factor)}</p>
                  {step.factor !== 'Other' && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                      <Stat label="Contribution" value={`${positive ? '+' : ''}${step.contribution.toFixed(3)}`} />
                      <Stat label="Avg Exposure" value={step.exposure.toFixed(2)} />
                      <Stat
                        label="Significance"
                        value={sig.label}
                        tone={sig.significant ? 'positive' : 'muted'}
                      />
                      <Stat label="Holdings" value={String(step.count)} />
                    </div>
                  )}
                </div>
              )}
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
