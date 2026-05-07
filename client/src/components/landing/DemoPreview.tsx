import { useEffect, useMemo, useState } from 'react';

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
  (s, top) => `${s}: ${top.toLowerCase()} dominates the read; cross-sectional rank is top decile.`,
  (_, top) => `Long screen: ${top.toLowerCase()} + buyback yield outweigh macro drag.`,
  (_, top) => `Conviction held: ${top.toLowerCase()} factor flags positive surprise risk into earnings.`,
  (_, top) => `${top} momentum compounds vs sector; regime-adjusted alpha intact.`,
  (s, top) => `Adaptive belief: ${top.toLowerCase()} weight ↑ as ${s} regime shifts to risk-on.`,
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
  const tplIdx = (seed >> 5) % BECAUSE_TEMPLATES.length;
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
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    setActive(0);
    setRevealed(false);
    const t = window.setTimeout(() => setRevealed(true), 80);
    return () => window.clearTimeout(t);
  }, [symbols]);

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
            <p className="mono text-[10px] sm:text-xs tracking-[0.3em] uppercase text-[var(--color-text-muted)] mb-2">
              Demo Read · {readings.length} {readings.length === 1 ? 'Position' : 'Positions'} · Cached Factor Cores
            </p>
            <h2
              id="demo-preview-heading"
              className="text-3xl sm:text-4xl font-black tracking-tight text-[var(--color-text)]"
            >
              Cognitive read on{' '}
              <span className="text-gradient-brand">{readings[0].symbol}</span>
              {readings.length > 1 && (
                <span className="text-[var(--color-text-muted)]"> + {readings.length - 1} more</span>
              )}
            </h2>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              Mock scoring with our factor cores. Sign up to wire live data, save portfolios, and unlock real-time risk.
            </p>
          </div>

          <button
            type="button"
            onClick={onClear}
            className="mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors animate-press"
          >
            ← Clear
          </button>
        </div>

        <div className={`grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-6 transition-opacity duration-500 ${revealed ? 'opacity-100' : 'opacity-0'}`}>
          {/* Left: position list */}
          <div className="glass-slab rounded-2xl p-4 sm:p-5">
            <p className="mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-text-muted)] mb-3 px-2">
              Portfolio · Click to inspect
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
                        <span className={`mono font-bold text-sm ${isActive ? 'text-[var(--color-accent)]' : 'text-[var(--color-text)]'}`}>
                          {r.symbol}
                        </span>
                        <span className="mono text-[9px] tracking-[0.25em] uppercase text-[var(--color-text-muted)] truncate">
                          {r.regime}
                        </span>
                      </span>
                      <span
                        className={`mono tabular-nums text-xs font-semibold ${
                          r.conviction >= 50 ? 'text-[var(--color-positive)]' : r.conviction < 25 ? 'text-[var(--color-negative)]' : 'text-[var(--color-text-secondary)]'
                        }`}
                      >
                        {r.conviction >= 50 ? '+' : ''}
                        {r.conviction}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="mt-4 pt-4 border-t border-[var(--color-border-light)] grid grid-cols-3 gap-2">
              <Stat label="Conv." value={meanConviction} positive />
              <Stat label="Long" value={longCount} positive />
              <Stat label="Tail" value={shortCount} negative={shortCount > 0} />
            </div>
          </div>

          {/* Right: factor reading */}
          <div className="glass-slab-floating rounded-2xl p-5 sm:p-7 relative overflow-hidden">
            <div className="sovereign-bar absolute top-0 left-0 right-0" />

            <div className="flex items-baseline justify-between mb-5">
              <div>
                <p className="mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-text-muted)] mb-1">
                  Live Factor Read
                </p>
                <h3 className="text-2xl sm:text-3xl font-black tabular-nums text-gradient-brand holo-pulse">
                  {current.symbol}
                </h3>
              </div>
              <div className="text-right">
                <p className="mono text-[9px] tracking-[0.3em] uppercase text-[var(--color-text-muted)]">Regime</p>
                <p className="mono text-[11px] sm:text-xs font-semibold text-[var(--color-accent-secondary)] uppercase tracking-[0.2em] mt-0.5">
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
                    <span className="mono text-[10px] tracking-[0.25em] uppercase text-[var(--color-text-muted)]">
                      {f.label}
                    </span>
                    <div className="h-1.5 rounded-full bg-[var(--color-bg-tertiary)] overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${w}%`,
                          background: color,
                          transition: `width 700ms cubic-bezier(0.2, 0.8, 0.2, 1) ${i * 60}ms`,
                          boxShadow: `0 0 12px ${color}`,
                        }}
                      />
                    </div>
                    <span
                      className={`mono tabular-nums text-xs text-right font-semibold ${
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

            <div className="rounded-xl glass-slab p-4 mb-5">
              <p className="mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-text-muted)] mb-2">
                Because
              </p>
              <p className="text-sm text-[var(--color-text)] leading-relaxed">{current.because}</p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <button
                type="button"
                onClick={onSignup}
                className="flex-1 px-6 py-3 bg-[image:var(--gradient-sovereign)] text-white rounded-sm mono text-[10px] font-black tracking-[0.3em] uppercase animate-press animate-lift shadow-[0_4px_30px_rgba(123,44,255,0.35)] hover:shadow-[0_6px_40px_rgba(123,44,255,0.5)] hover:brightness-110"
              >
                Save & Run Live →
              </button>
              <button
                type="button"
                onClick={onSignin}
                className="px-6 py-3 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-accent-secondary)] hover:text-[var(--color-accent-secondary)] rounded-sm mono text-[10px] font-bold tracking-[0.3em] uppercase animate-press animate-lift transition-[background-color,border-color,color] duration-200"
              >
                Sign In
              </button>
            </div>

            <p className="mt-4 mono text-[9px] tracking-[0.3em] uppercase text-[var(--color-text-muted)]">
              Demo · Cached factor scoring. Live mode adds: real-time quotes · CVRF beliefs · regime detection · alerts.
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
      <p className="mono text-[9px] tracking-[0.3em] uppercase text-[var(--color-text-muted)] mb-1">
        {label}
      </p>
      <p className={`mono tabular-nums text-base font-bold ${color}`}>{value}</p>
    </div>
  );
}

export default DemoPreview;
