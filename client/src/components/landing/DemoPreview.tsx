import { useMemo, useState } from 'react';

const FACTORS = [
  { key: 'quality', label: 'Quality', tone: 'positive' },
  { key: 'momentum', label: 'Momentum', tone: 'accent' },
  { key: 'value', label: 'Value', tone: 'positive' },
  { key: 'low_vol', label: 'Low Vol', tone: 'positive' },
  { key: 'buyback', label: 'Buyback Yield', tone: 'accent' },
  { key: 'growth', label: 'Growth', tone: 'accent' },
  { key: 'profitability', label: 'Profitability', tone: 'positive' },
  { key: 'sentiment', label: 'Sentiment', tone: 'accent' },
] as const;

type FactorRow = { key: string; label: string; tone: 'positive' | 'accent' | 'negative'; score: number };
type SymbolReading = { symbol: string; conviction: number; regime: string; factors: FactorRow[]; because: string };

const REGIMES = ['Quality-Led', 'Macro Tightening', 'Momentum Decay', 'Sentiment-Driven', 'Mean-Reverting', 'AI-Capex Cycle'];

const BECAUSE_TEMPLATES: Array<(s: string, top: string) => string> = [
  (s, top) => `${top} is the strongest displayed factor for ${s} in this sample.`,
  (_, top) => `This sample highlights ${top.toLowerCase()} alongside the other displayed exposures.`,
  (_, top) => `Compare ${top.toLowerCase()} with the remaining sample factors to explore the breakdown.`,
  (_, top) => `${top} has the highest score in this illustrative factor breakdown.`,
  (s, top) => `The sample for ${s} places ${top.toLowerCase()} at the top of the displayed factors.`,
];

function hashSymbol(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededFloat(seed: number, min: number, max: number): number {
  const x = Math.sin(seed) * 10000;
  const t = x - Math.floor(x);
  return min + t * (max - min);
}

function buildReading(symbol: string): SymbolReading {
  const seed = hashSymbol(symbol);
  const factors: FactorRow[] = FACTORS.map((f, i) => {
    const raw = seededFloat(seed + i * 7919, -85, 95);
    const score = Math.round(raw);
    const tone: FactorRow['tone'] = score > 25 ? 'positive' : score < -15 ? 'negative' : 'accent';
    return { key: f.key, label: f.label, tone, score };
  });
  const conviction = Math.round(
    factors.reduce((sum, f) => sum + Math.max(0, f.score), 0) / (factors.length * 0.95),
  );
  const top = [...factors].sort((a, b) => b.score - a.score)[0];
  const regime = REGIMES[seed % REGIMES.length];
  // `seed` is unsigned 32-bit, but `>>` is *signed* — any seed >= 2^31
  // produces a negative shifted value, and `negative % 5` in JS returns a
  // negative index, which makes `BECAUSE_TEMPLATES[idx]` return undefined
  // and the next call crash with "y[p] is not a function". Use `>>>` to
  // keep the shift unsigned.
  const tplIdx = (seed >>> 5) % BECAUSE_TEMPLATES.length;
  const because = BECAUSE_TEMPLATES[tplIdx](symbol, top.label);
  return { symbol, conviction, regime, factors, because };
}

interface DemoPreviewProps {
  symbols: string[];
  onSignup: () => void;
  onSignin: () => void;
  onClear: () => void;
}

export function DemoPreview({ symbols, onSignup, onSignin, onClear }: DemoPreviewProps) {
  const readings = useMemo(() => symbols.slice(0, 12).map(buildReading), [symbols]);
  const [active, setActive] = useState(0);

  if (readings.length === 0) return null;

  const current = readings[Math.min(active, readings.length - 1)];

  const meanConviction = Math.round(
    readings.reduce((sum, r) => sum + r.conviction, 0) / readings.length,
  );
  const longCount = readings.filter((r) => r.conviction >= 50).length;
  const shortCount = readings.filter((r) => r.conviction < 25).length;

  return (
    <section
      className="relative px-4 sm:px-6 py-12 sm:py-16"
      aria-labelledby="demo-preview-heading"
    >
      <div className="max-w-6xl mx-auto">
        <div className="mb-8 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs text-[var(--color-text-muted)] mb-2">
              Sample portfolio · {readings.length} {readings.length === 1 ? 'Position' : 'Positions'} · Illustrative data
            </p>
            <h2
              id="demo-preview-heading"
              className="text-3xl sm:text-4xl font-semibold tracking-tight text-[var(--color-text)]"
            >
              Portfolio preview for{' '}
              <span className="text-[var(--color-text)]">{readings[0].symbol}</span>
              {readings.length > 1 && (
                <span className="text-[var(--color-text-muted)]"> + {readings.length - 1} more</span>
              )}
            </h2>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              Scores are generated for this preview and are not a live assessment. Create an account to set up your own portfolio.
            </p>
          </div>

          <button
            type="button"
            onClick={onClear}
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors animate-press"
          >
            Clear preview
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-6">
          {/* Left: position list */}
          <div className="border border-[var(--color-border)] bg-[var(--color-bg-secondary)] rounded-xl p-4 sm:p-5">
            <p className="text-xs text-[var(--color-text-muted)] mb-3 px-2">
              Holdings · Select to view
            </p>
            <ul className="space-y-1.5" role="listbox" aria-label="Portfolio positions">
              {readings.map((r, i) => {
                const isActive = i === Math.min(active, readings.length - 1);
                return (
                  <li key={r.symbol}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onClick={() => setActive(i)}
                      className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg animate-press transition-[background-color,border-color] duration-150 border ${
                        isActive
                          ? 'bg-[var(--color-accent-light)] border-[color:var(--color-accent)]/30'
                          : 'bg-transparent border-transparent hover:bg-[var(--color-bg-tertiary)]'
                      }`}
                    >
                      <span className="flex items-center gap-3 min-w-0">
                        <span className={`font-bold text-sm ${isActive ? 'text-[var(--color-accent-text)]' : 'text-[var(--color-text)]'}`}>
                          {r.symbol}
                        </span>
                        <span className="text-xs text-[var(--color-text-muted)] truncate">
                          {r.regime}
                        </span>
                      </span>
                      <span
                        className={`tabular-nums text-xs font-semibold ${
                          r.conviction >= 50 ? 'text-[var(--color-positive)]' : r.conviction < 25 ? 'text-[var(--color-negative)]' : 'text-[var(--color-text-secondary)]'
                        }`}
                      >
                        {r.conviction}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="mt-4 pt-4 border-t border-[var(--color-border-light)] grid grid-cols-3 gap-2">
              <Stat label="Avg. score" value={meanConviction} positive />
              <Stat label="High scores" value={longCount} positive />
              <Stat label="Low scores" value={shortCount} negative={shortCount > 0} />
            </div>
          </div>

          {/* Right: factor reading */}
          <div className="border border-[var(--color-border)] bg-[var(--color-bg-secondary)] rounded-xl p-5 sm:p-7 relative overflow-hidden">

            <div className="flex items-baseline justify-between mb-5">
              <div>
                <p className="text-xs text-[var(--color-text-muted)] mb-1">
                  Sample factor breakdown
                </p>
                <h3 className="text-2xl sm:text-3xl font-semibold tabular-nums text-[var(--color-text)]">
                  {current.symbol}
                </h3>
              </div>
              <div className="text-right">
                <p className="text-xs text-[var(--color-text-muted)]">Regime</p>
                <p className="text-xs font-semibold text-[var(--color-accent-secondary-text)] mt-0.5">
                  {current.regime}
                </p>
              </div>
            </div>

            <ul className="space-y-3 mb-6" key={current.symbol}>
              {current.factors.map((f, i) => {
                const w = Math.min(100, Math.abs(f.score));
                const color =
                  f.score >= 0
                    ? 'var(--color-accent)'
                    : 'var(--color-negative)';
                return (
                  <li key={f.key} className="grid grid-cols-[110px_1fr_56px] items-center gap-3">
                    <span className="text-xs text-[var(--color-text-muted)]">
                      {f.label}
                    </span>
                    <div className="h-1.5 rounded-full bg-[var(--color-bg-tertiary)] overflow-hidden">
                      <div
                        className="h-full w-full rounded-full origin-left"
                        style={{
                          transform: `scaleX(${w / 100})`,
                          background: color,
                          transition: `transform 700ms cubic-bezier(0.2, 0.8, 0.2, 1) ${i * 60}ms`,
                        }}
                      />
                    </div>
                    <span
                      className={`tabular-nums text-xs text-right font-semibold ${
                        f.score >= 25
                          ? 'text-[var(--color-positive)]'
                          : f.score < -15
                            ? 'text-[var(--color-negative)]'
                            : 'text-[var(--color-text-secondary)]'
                      }`}
                    >
                      {f.score >= 0 ? '+' : ''}
                      {f.score}
                    </span>
                  </li>
                );
              })}
            </ul>

            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 mb-5">
              <p className="text-xs text-[var(--color-text-muted)] mb-2">
                Sample interpretation
              </p>
              <p className="text-sm text-[var(--color-text)] leading-relaxed">{current.because}</p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <button
                type="button"
                onClick={onSignup}
                className="flex-1 px-6 py-3 bg-[var(--color-accent)] text-white rounded-lg text-sm font-semibold hover:bg-[var(--color-accent-hover)] transition-colors"
              >
                Create your portfolio
              </button>
              <button
                type="button"
                onClick={onSignin}
                className="px-6 py-3 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] rounded-lg text-sm font-medium transition-colors"
              >
                Sign in
              </button>
            </div>

            <p className="mt-4 text-xs text-[var(--color-text-muted)]">
              Illustrative demo only. Sample scores and interpretations are not investment recommendations.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, positive, negative }: { label: string; value: number; positive?: boolean; negative?: boolean }) {
  const color = negative
    ? 'text-[var(--color-negative)]'
    : positive
      ? 'text-[var(--color-positive)]'
      : 'text-[var(--color-text)]';
  return (
    <div className="text-center">
      <p className="text-xs text-[var(--color-text-muted)] mb-1">
        {label}
      </p>
      <p className={`tabular-nums text-base font-bold ${color}`}>{value}</p>
    </div>
  );
}

export default DemoPreview;
