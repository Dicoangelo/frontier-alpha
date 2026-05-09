/**
 * FactorDeltas — DASH3-005 (Cognitive Insight v2)
 *
 * Sibling to <CognitiveInsight>. Renders the top-3 factor changes vs the
 * trailing baseline as pills with a mini sparkline + one-line "because"
 * copy. Data flows through `useFactorDeltas` which wraps everything in the
 * `DataSource<T>` discriminated union, so each render branch (real / empty
 * / demo) is type-checked.
 *
 * Min-height stable across loading, empty, and data states (`min-h-[180px]`)
 * so the dashboard doesn't shift when factors finish computing.
 *
 * Tinted backdrop: when the largest |deltaPct| exceeds 1.0% (a 1-sigma
 * stand-in until we have real per-factor sigma from the server), apply a
 * subtle amethyst-to-cyan gradient overlay to signal "something moved".
 */

import { Card } from '@/components/shared/Card';
import { Sparkline } from '@/components/shared/Sparkline';
import { DegradedService } from '@/components/shared/DegradedService';
import {
  useFactorDeltas,
  type FactorDelta,
  type FactorDeltaWindow,
} from '@/hooks/useFactorDeltas';
import { isReal, isEmpty, isDemo } from '@/lib/dataSource';
import { TrendingUp, TrendingDown, Activity } from 'lucide-react';

export interface FactorDeltasProps {
  portfolioId: string;
  symbols: string[];
  window?: FactorDeltaWindow;
}

const SIGMA_STANDIN_PCT = 1.0;

/** Render a single factor-delta pill: name, magnitude, mini sparkline, and
 *  one-line explanation. */
function DeltaPill({ delta }: { delta: FactorDelta }) {
  const positive = delta.delta >= 0;
  const Icon = positive ? TrendingUp : TrendingDown;
  const color = positive ? 'var(--color-positive)' : 'var(--color-negative)';
  const sign = positive ? '+' : '';
  const human = delta.factor.replace(/_/g, ' ');
  // Three-point sparkline: previous, midpoint, current. Lightweight visual
  // that conveys direction without inventing intra-day points we don't have.
  const trendData = [
    delta.previous,
    (delta.previous + delta.current) / 2,
    delta.current,
  ];

  return (
    <div
      className="glass-slab-floating relative overflow-hidden rounded-xl pl-5 pr-4 py-3 animate-slide-in-left transition-[box-shadow] duration-200 hover:shadow-lg before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px]"
      style={{ backgroundColor: 'color-mix(in srgb, currentColor 4%, transparent)' }}
    >
      <span aria-hidden="true" className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ backgroundColor: color }} />
      <div className="flex items-start gap-3">
        <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color }} aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
            <h4 className="font-medium text-theme capitalize">{human}</h4>
            <div className="flex items-center gap-2">
              <Sparkline
                data={trendData}
                width={48}
                height={16}
                stroke={color}
                ariaLabel={`${human} trend`}
              />
              <span
                className="mono text-[11px] tracking-[0.15em] uppercase tabular-nums font-medium"
                style={{ color }}
              >
                {sign}{delta.deltaPct.toFixed(1)}%
              </span>
            </div>
          </div>
          <p className="text-sm leading-relaxed text-theme-secondary">
            {delta.explanation}
          </p>
        </div>
      </div>
    </div>
  );
}

/** "Building baseline" + demo-mode pill chrome the empty branch reuses. */
function FactorDeltasShell({
  children,
  tinted,
  banner,
}: {
  children: React.ReactNode;
  tinted: boolean;
  banner?: React.ReactNode;
}) {
  return (
    <Card title="Factor Deltas">
      <div
        className={`relative min-h-[180px] rounded-lg ${
          tinted ? 'bg-gradient-to-br from-amethyst-500/5 to-cyan-500/5' : ''
        }`}
        style={
          tinted
            ? {
                backgroundImage:
                  'linear-gradient(135deg, color-mix(in srgb, var(--color-accent) 5%, transparent) 0%, color-mix(in srgb, var(--color-info) 5%, transparent) 100%)',
              }
            : undefined
        }
      >
        {banner}
        {children}
      </div>
    </Card>
  );
}

export function FactorDeltas({ portfolioId, symbols, window = '1d' }: FactorDeltasProps) {
  const { data, isLoading } = useFactorDeltas(portfolioId, window, symbols);

  if (isLoading) {
    return (
      <FactorDeltasShell tinted={false}>
        <div className="flex items-center justify-center min-h-[180px] text-theme-muted">
          <Activity className="w-5 h-5 animate-pulse" aria-hidden="true" />
          <span className="ml-2 mono text-[11px] tracking-[0.2em] uppercase">
            Computing deltas
          </span>
        </div>
      </FactorDeltasShell>
    );
  }

  if (isEmpty(data)) {
    return (
      <FactorDeltasShell tinted={false}>
        <div className="min-h-[180px] flex items-center justify-center px-4 py-6">
          <DegradedService
            service="Factor deltas"
            reason="Building factor baseline. Return tomorrow for first delta read."
            severity="info"
            position="banner-top"
          />
        </div>
      </FactorDeltasShell>
    );
  }

  // Real or demo branch — both render the same UI; demo gets a corner banner.
  const deltas = isReal(data) || isDemo(data) ? data.value : [];
  const largest = deltas.reduce(
    (max, d) => (Math.abs(d.deltaPct) > Math.abs(max) ? d.deltaPct : max),
    0,
  );
  const tinted = Math.abs(largest) > SIGMA_STANDIN_PCT;

  const demoBanner = isDemo(data) ? (
    <div className="absolute top-2 right-2 z-10">
      <span className="mono text-[10px] tracking-[0.25em] uppercase font-medium px-2 py-1 rounded-sm bg-[var(--color-warning)]/10 text-[var(--color-warning)] border border-[var(--color-warning)]/30">
        Demo data
      </span>
    </div>
  ) : null;

  return (
    <FactorDeltasShell tinted={tinted} banner={demoBanner}>
      <div className="space-y-3 min-h-[180px]">
        {deltas.map((d, i) => (
          <div
            key={d.factor}
            style={{ animationDelay: `${i * 50}ms`, animationFillMode: 'both' }}
          >
            <DeltaPill delta={d} />
          </div>
        ))}
      </div>
    </FactorDeltasShell>
  );
}
