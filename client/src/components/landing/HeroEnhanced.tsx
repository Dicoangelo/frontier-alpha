import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { Sparkles, Zap, LineChart } from 'lucide-react';
import { FactorBackdrop } from './FactorBackdrop';
import { TypingTickerDemo } from './TypingTickerDemo';

/* ─────────────────────────────────────────────────────────────────────────
 * Inline hooks — keep this component self-contained and dependency-free.
 * ──────────────────────────────────────────────────────────────────────── */

/** Detects OS-level prefers-reduced-motion. */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener?.('change', handler);
    return () => mq.removeEventListener?.('change', handler);
  }, []);
  return reduced;
}

/** Detects whether the device supports a hover-capable pointer. */
function useHoverCapable(): boolean {
  const [canHover, setCanHover] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(hover: hover)').matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(hover: hover)');
    const handler = (e: MediaQueryListEvent) => setCanHover(e.matches);
    mq.addEventListener?.('change', handler);
    return () => mq.removeEventListener?.('change', handler);
  }, []);
  return canHover;
}

/** Tracks normalized cursor position over a target ref (0..1 on each axis). */
function useMousePosition<T extends HTMLElement>(
  targetRef: React.RefObject<T | null>,
  enabled: boolean,
) {
  const [pos, setPos] = useState<{ x: number; y: number; active: boolean }>({
    x: 0.5,
    y: 0.5,
    active: false,
  });
  useEffect(() => {
    if (!enabled) return;
    const el = targetRef.current;
    if (!el) return;

    const handleMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / Math.max(rect.width, 1);
      const y = (e.clientY - rect.top) / Math.max(rect.height, 1);
      setPos({
        x: Math.max(0, Math.min(1, x)),
        y: Math.max(0, Math.min(1, y)),
        active: true,
      });
    };
    const handleLeave = () => setPos((p) => ({ ...p, active: false }));

    el.addEventListener('mousemove', handleMove);
    el.addEventListener('mouseleave', handleLeave);
    return () => {
      el.removeEventListener('mousemove', handleMove);
      el.removeEventListener('mouseleave', handleLeave);
    };
  }, [enabled, targetRef]);
  return pos;
}

/** Fires once when the target enters the viewport (rootMargin-aware). */
function useInView<T extends HTMLElement>(
  targetRef: React.RefObject<T | null>,
  options: IntersectionObserverInit = { threshold: 0.2, rootMargin: '0px 0px -10% 0px' },
): boolean {
  const [inView, setInView] = useState(false);
  const onceRef = useRef(false);
  useEffect(() => {
    const el = targetRef.current;
    if (!el || onceRef.current) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      onceRef.current = true;
      return;
    }
    const obs = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          setInView(true);
          onceRef.current = true;
          obs.disconnect();
          break;
        }
      }
    }, options);
    obs.observe(el);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetRef]);
  return inView;
}

/** rAF-based count-up; runs once `start` flips true. */
function useCountUp(target: number, durationMs: number, start: boolean): number {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!start || startedRef.current) return;
    startedRef.current = true;
    const begin = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - begin) / Math.max(1, durationMs));
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(target * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setValue(target);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, durationMs, start]);

  return value;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Static content
 * ──────────────────────────────────────────────────────────────────────── */

const VALUE_PROPS: readonly string[] = [
  'Self-improving beliefs in real time',
  'Explainable AI on every position',
  '140K+ data points scored per cycle',
  'Cognitive variance reduction framework',
  '76 factors, 12 groups, one signal',
] as const;

interface TickerSymbol {
  symbol: string;
  delta: number; // percentage points
}

const TICKER_FEED: readonly TickerSymbol[] = [
  { symbol: 'AAPL', delta: 1.2 },
  { symbol: 'MSFT', delta: 0.8 },
  { symbol: 'NVDA', delta: 3.4 },
  { symbol: 'GOOGL', delta: -0.2 },
  { symbol: 'META', delta: 2.1 },
  { symbol: 'TSLA', delta: -1.8 },
  { symbol: 'AMZN', delta: 0.6 },
  { symbol: 'AVGO', delta: 1.5 },
  { symbol: 'AMD', delta: -0.7 },
  { symbol: 'JPM', delta: 0.4 },
  { symbol: 'V', delta: 0.9 },
  { symbol: 'UNH', delta: -0.3 },
  { symbol: 'LLY', delta: 2.6 },
  { symbol: 'XOM', delta: 0.2 },
  { symbol: 'BRK.B', delta: 0.5 },
  { symbol: 'NFLX', delta: 1.7 },
] as const;

interface MetricTile {
  label: string;
  target: number;
  suffix: string;
  prefix?: string;
  format?: 'compact' | 'plain';
  durationMs: number;
  Icon: typeof Sparkles;
}

const METRICS: readonly MetricTile[] = [
  { label: 'Factors', target: 80, suffix: '+', durationMs: 1400, Icon: Sparkles },
  { label: 'Data Points', target: 140000, suffix: '+', format: 'compact', durationMs: 1800, Icon: LineChart },
  { label: 'Inference', target: 2, prefix: '<', suffix: 's', durationMs: 1100, Icon: Zap },
] as const;

/* ─────────────────────────────────────────────────────────────────────────
 * Public API
 * ──────────────────────────────────────────────────────────────────────── */

export interface HeroEnhancedProps {
  onAnalyze: () => void;
  onLoadDemo: () => void;
  isAnalyzing: boolean;
}

export function HeroEnhanced({ onAnalyze, onLoadDemo, isAnalyzing }: HeroEnhancedProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotion();
  const hoverCapable = useHoverCapable();
  const inView = useInView(sectionRef);
  const headlineId = useId();
  const cycleId = useId();

  // Mouse-aware ambient glow (only on hover-capable, motion-allowed devices).
  const trackMouse = hoverCapable && !reducedMotion;
  const mouse = useMousePosition(sectionRef, trackMouse);

  // Cycling value-prop kicker.
  const [propIdx, setPropIdx] = useState(0);
  useEffect(() => {
    if (reducedMotion) return;
    const id = window.setInterval(() => {
      setPropIdx((i) => (i + 1) % VALUE_PROPS.length);
    }, 3200);
    return () => window.clearInterval(id);
  }, [reducedMotion]);

  // Trigger count-ups when count-up tiles appear in view.
  const startCounts = inView || reducedMotion;

  // Ambient glow style (radial gradient that follows the cursor, low alpha).
  const glowStyle: CSSProperties = trackMouse && mouse.active
    ? {
        background: `radial-gradient(520px circle at ${mouse.x * 100}% ${mouse.y * 100}%,
          color-mix(in srgb, var(--color-accent) 18%, transparent) 0%,
          color-mix(in srgb, var(--color-accent-secondary) 10%, transparent) 35%,
          transparent 65%)`,
        opacity: 1,
        transition: 'opacity 320ms var(--motion-ease-out, ease-out)',
      }
    : {
        background: 'transparent',
        opacity: 0,
        transition: 'opacity 320ms var(--motion-ease-out, ease-out)',
      };

  const handleKeyboardHint = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !isAnalyzing) {
        onAnalyze();
      }
    },
    [onAnalyze, isAnalyzing],
  );

  return (
    <section
      ref={sectionRef}
      onKeyDown={handleKeyboardHint}
      aria-labelledby={headlineId}
      aria-label="FrontierAlpha hero"
      className="relative isolate overflow-hidden grid-bg"
    >
      {/* Local keyframes for animations not yet defined globally. Scoped to
          this section so it doesn't leak. Reduced-motion-aware via media. */}
      <style>{`
        @keyframes fa-loop-scroll-rtl {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        @keyframes fa-subtle-float {
          0%, 100% { transform: translate3d(0, 0, 0); }
          50%      { transform: translate3d(0, -14px, 0); }
        }
        .fa-loop-scroll-rtl {
          animation: fa-loop-scroll-rtl 30s linear infinite;
          will-change: transform;
        }
        .fa-subtle-float {
          animation: fa-subtle-float 9s ease-in-out infinite;
          will-change: transform;
        }
        @media (prefers-reduced-motion: reduce) {
          .fa-loop-scroll-rtl, .fa-subtle-float { animation: none !important; }
        }
      `}</style>

      {/* Subtle floating accents — sit behind the bar grid. */}
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none -z-10 overflow-hidden">
        <div
          className="fa-subtle-float gradient-brand-subtle absolute rounded-full blur-3xl"
          style={{
            top: '-8%',
            left: '-6%',
            width: '38vw',
            height: '38vw',
            opacity: 0.55,
          }}
        />
        <div
          className="fa-subtle-float gradient-brand-subtle absolute rounded-full blur-3xl"
          style={{
            bottom: '-12%',
            right: '-10%',
            width: '42vw',
            height: '42vw',
            opacity: 0.45,
            animationDelay: '2.4s',
          }}
        />
        <div
          className="fa-subtle-float gradient-brand-subtle absolute rounded-full blur-3xl"
          style={{
            top: '20%',
            right: '20%',
            width: '22vw',
            height: '22vw',
            opacity: 0.35,
            animationDelay: '4.8s',
          }}
        />
      </div>

      {/* Animated bar grid backdrop. */}
      <FactorBackdrop />

      {/* Mouse-aware ambient glow — between backdrop and content. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 mix-blend-screen dark:mix-blend-plus-lighter"
        style={glowStyle}
      />

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 pt-20 pb-8 sm:pt-24 sm:pb-10">
        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-10 lg:gap-14 items-center">
          {/* ─── LEFT: brand + headline + CTA ───────────────────────── */}
          <div className="animate-fade-in-up">
            <div className="flex items-center gap-3 mb-6">
              <img
                src="/metaventions-logo.png"
                alt="Metaventions AI"
                width={40}
                height={40}
                className="w-10 h-10 rounded-sm"
                loading="eager"
              />
              <span className="text-[10px] mono tracking-[0.5em] uppercase text-[var(--color-text-muted)]">
                Metaventions{' '}
                <span className="text-[var(--color-accent-secondary)]">AI</span>
              </span>
            </div>

            <h1
              id={headlineId}
              className="text-5xl sm:text-6xl lg:text-7xl font-black leading-[0.95] tracking-tight text-[var(--color-text)]"
            >
              Frontier
              <span className="text-gradient-halo holo-pulse">Alpha</span>
            </h1>

            <p className="mt-5 text-xl sm:text-2xl text-[var(--color-text-secondary)] max-w-xl leading-snug">
              An 80-factor cognitive model that tells you{' '}
              <em className="not-italic text-[var(--color-text)]">why</em>, not just what.
            </p>

            {/* Cycling value-prop kicker. */}
            <p
              id={cycleId}
              aria-live="polite"
              className="mt-3 text-sm text-[var(--color-text-muted)] mono tracking-[0.2em] uppercase min-h-[1.4em]"
            >
              <span
                key={propIdx}
                className="caption-cycle inline-block"
              >
                {VALUE_PROPS[propIdx]}
              </span>
            </p>

            {/* CTAs */}
            <div className="mt-8 flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <button
                onClick={onAnalyze}
                disabled={isAnalyzing}
                className="px-8 py-3 bg-[image:var(--gradient-sovereign)] text-white rounded-sm mono text-[10px] font-black tracking-[0.3em] uppercase animate-press animate-lift disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none shadow-[0_4px_30px_rgba(123,44,255,0.35)] hover:shadow-[0_6px_40px_rgba(123,44,255,0.5)] hover:brightness-110 min-w-[200px]"
              >
                {isAnalyzing ? 'Analyzing…' : 'Analyze Your Portfolio'}
              </button>
              <button
                onClick={onLoadDemo}
                className="px-8 py-3 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)] hover:border-[var(--color-accent-secondary)] hover:text-[var(--color-accent-secondary)] rounded-sm mono text-[10px] font-bold tracking-[0.3em] uppercase animate-press animate-lift transition-[background-color,border-color,color] duration-200 min-w-[140px]"
              >
                Load Mag 7 Demo
              </button>
            </div>

            {/* Keyboard hint pill */}
            <div className="mt-3">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-sm border border-[var(--color-border-light)] mono text-[10px] text-theme-muted tracking-[0.2em] uppercase">
                <kbd className="px-1 text-[var(--color-text-secondary)]">↵</kbd>
                <span>to analyze</span>
                <span aria-hidden="true" className="opacity-40">·</span>
                <kbd className="px-1 text-[var(--color-text-secondary)]">⌘K</kbd>
                <span>command palette</span>
              </span>
            </div>

            {/* Animated metric tiles */}
            <div className="mt-8 grid grid-cols-3 gap-3 max-w-xl">
              {METRICS.map((m) => (
                <MetricChip key={m.label} metric={m} start={startCounts} />
              ))}
            </div>
          </div>

          {/* ─── RIGHT: live demo card with sovereign halo ──────────── */}
          <div className="flex justify-center lg:justify-end">
            <div className="group relative">
              {/* Soft sovereign halo — fades in on hover. */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -inset-8 rounded-sm blur-3xl bg-[image:var(--gradient-sovereign)] opacity-0 group-hover:opacity-30 transition-opacity duration-500"
              />
              <div className="relative">
                <TypingTickerDemo />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Scrolling ticker tape ─────────────────────────────────── */}
      <div className="relative z-10">
        <div className="sovereign-bar" aria-hidden="true" />
        <div
          className="glass-slab-floating overflow-hidden"
          aria-label="Live market ticker"
        >
          <div className="relative">
            <div
              className="fa-loop-scroll-rtl flex items-center gap-8 whitespace-nowrap py-3 px-4"
              style={{ width: 'max-content' }}
            >
              {/* Render the feed twice for a seamless RTL loop. */}
              {[...TICKER_FEED, ...TICKER_FEED].map((t, i) => (
                <TickerCell key={`${t.symbol}-${i}`} symbol={t.symbol} delta={t.delta} />
              ))}
            </div>
            {/* Edge fades */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 w-16"
              style={{
                background:
                  'linear-gradient(to right, var(--color-bg) 0%, color-mix(in srgb, var(--color-bg) 60%, transparent) 60%, transparent 100%)',
              }}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-0 w-16"
              style={{
                background:
                  'linear-gradient(to left, var(--color-bg) 0%, color-mix(in srgb, var(--color-bg) 60%, transparent) 60%, transparent 100%)',
              }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Sub-components
 * ──────────────────────────────────────────────────────────────────────── */

function MetricChip({ metric, start }: { metric: MetricTile; start: boolean }) {
  const value = useCountUp(metric.target, metric.durationMs, start);
  const display = formatMetric(value, metric);
  const Icon = metric.Icon;
  return (
    <div className="glass-slab-floating rounded-sm p-3 sm:p-4 animate-fade-in-up flex flex-col gap-1">
      <span className="flex items-center gap-2 text-[9px] mono tracking-[0.3em] uppercase text-[var(--color-text-muted)]">
        <Icon className="w-3 h-3 text-[var(--color-accent-secondary)]" aria-hidden="true" />
        {metric.label}
      </span>
      <span className="text-2xl sm:text-3xl font-black text-[var(--color-text)] tabular-nums leading-none">
        {metric.prefix}
        {display}
        <span className="text-gradient-halo">{metric.suffix}</span>
      </span>
    </div>
  );
}

function formatMetric(value: number, metric: MetricTile): string {
  const v = Math.round(value);
  if (metric.format === 'compact') {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${Math.round(v / 1000)}K`;
    return `${v}`;
  }
  return `${v}`;
}

function TickerCell({ symbol, delta }: { symbol: string; delta: number }) {
  const positive = delta >= 0;
  const color = positive ? 'var(--color-positive)' : 'var(--color-negative)';
  const sign = positive ? '+' : '';
  return (
    <span className="flex items-center gap-2 mono text-[11px] tracking-[0.2em] uppercase text-[var(--color-text-secondary)]">
      <span className="font-bold text-[var(--color-text)]">{symbol}</span>
      <span className="tabular-nums" style={{ color }}>
        {sign}
        {delta.toFixed(1)}%
      </span>
      <span className="opacity-30 mx-2" aria-hidden="true">
        ·
      </span>
    </span>
  );
}

export default HeroEnhanced;
