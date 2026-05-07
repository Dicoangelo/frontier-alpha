import { useEffect, useRef, useState } from 'react';

/* ────────────────────────────────────────────────────────────────────────
   TrustComparison
   ────────────────────────────────────────────────────────────────────────
   Premium "Why FrontierAlpha" trust + comparison section.

   Composition:
     - Animated 4-pillar metric strip (count-up on viewport entry)
     - vs-Traditional comparison row (left/right cards + VS divider)
     - Two-row data-source marquee band (RTL + LTR)
     - Mono kicker / sovereign-gradient headline / subtitle header
     - Bottom institutional-grade gold trust pill
     - Floating breathing brand-subtle accent blobs

   All hooks (useInView + useCountUp) and the marquee keyframe are inlined
   so the component is fully self-contained. Respects prefers-reduced-motion.
   ──────────────────────────────────────────────────────────────────────── */

/* ───── Hooks (inlined) ──────────────────────────────────────────────── */

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mql.matches);
    update();
    mql.addEventListener?.('change', update);
    return () => mql.removeEventListener?.('change', update);
  }, []);

  return reduced;
}

function useInView<T extends Element>(
  options: IntersectionObserverInit = { threshold: 0.25, rootMargin: '0px 0px -10% 0px' }
): { ref: React.RefObject<T | null>; inView: boolean } {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            observer.disconnect();
            break;
          }
        }
      },
      options
    );
    observer.observe(node);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ref, inView };
}

function useCountUp(
  target: number,
  options: { active: boolean; durationMs?: number; instant?: boolean } = { active: false }
): number {
  const { active, durationMs = 1600, instant = false } = options;
  const [value, setValue] = useState(active && instant ? target : 0);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!active || startedRef.current) return;
    startedRef.current = true;

    if (instant) {
      setValue(target);
      return;
    }

    let raf = 0;
    const start = performance.now();
    // ease-out cubic — matches sovereign motion language
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / durationMs);
      setValue(target * ease(progress));
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setValue(target);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, target, durationMs, instant]);

  return value;
}

/* ───── Data ─────────────────────────────────────────────────────────── */

interface MetricPillar {
  kicker: string;
  target: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  description: string;
  tone: 'brand' | 'halo' | 'gold' | 'theme';
}

const METRIC_PILLARS: MetricPillar[] = [
  {
    kicker: 'Factors',
    target: 80,
    suffix: '+',
    description: 'Across 12 factor groups',
    tone: 'brand',
  },
  {
    kicker: 'Data Points',
    target: 140,
    suffix: 'K+',
    description: 'Live ingestion · 7 sources',
    tone: 'halo',
  },
  {
    kicker: 'Inference',
    target: 2,
    prefix: '<',
    suffix: 's',
    description: 'GPT-4o + cached factor cores',
    tone: 'theme',
  },
  {
    kicker: 'Episodic Beliefs',
    target: 76,
    description: 'CVRF self-improving cycle',
    tone: 'gold',
  },
];

const TRADITIONAL_POINTS = [
  'Quarterly factor refits',
  'Black-box recommendations',
  'Single-regime assumption',
  'No belief evolution',
  'Manual interpretation required',
];

const FRONTIER_POINTS = [
  'Real-time factor updates per tick',
  'Every output ships with citations',
  'Multi-regime detection + adaptation',
  'Episodic belief learning (CVRF)',
  'Plain-English "because…" trails',
];

const DATA_SOURCES_PRIMARY = [
  'POLYGON.IO',
  'ALPHA VANTAGE',
  'OPENAI GPT-4o',
  'SUPABASE',
  'SEC EDGAR',
  'OPTIONS CHAINS',
  'POLYGON WEBSOCKET',
  'ALPACA',
  'STRIPE',
  'CVRF KERNEL',
  'EARNINGS ORACLE',
  'FACTOR ENGINE',
];

const DATA_SOURCES_SECONDARY = [
  'WEB PUSH (VAPID)',
  'SSE STREAM',
  'REGIME DETECTOR',
  'NEURAL FACTOR MODEL',
  'BACKTEST ENGINE',
  'RISK ALERT SYSTEM',
  'PORTFOLIO OPTIMIZER',
  'MONTE CARLO',
  'SHARPE / SORTINO',
  'DRAWDOWN MONITOR',
  'BELIEF UPDATER',
  'EPISODE STORE',
];

/* ───── Component ────────────────────────────────────────────────────── */

export interface TrustComparisonProps {
  /* Section is content-only; no props at this time. */
  className?: string;
}

export function TrustComparison({ className = '' }: TrustComparisonProps) {
  const reducedMotion = usePrefersReducedMotion();
  const { ref: pillarsRef, inView: pillarsInView } = useInView<HTMLDivElement>();
  const { ref: headerRef, inView: headerInView } = useInView<HTMLDivElement>({
    threshold: 0.3,
    rootMargin: '0px 0px -10% 0px',
  });

  return (
    <section
      aria-labelledby="why-frontier-alpha-heading"
      className={`relative isolate overflow-hidden py-20 sm:py-24 lg:py-32 px-4 sm:px-6 ${className}`}
    >
      {/* Inlined marquee keyframes — frontier-alpha index.css does not declare these */}
      <style>{`
        @keyframes fa-loop-scroll-rtl {
          0%   { transform: translate3d(0, 0, 0); }
          100% { transform: translate3d(-50%, 0, 0); }
        }
        @keyframes fa-loop-scroll-ltr {
          0%   { transform: translate3d(-50%, 0, 0); }
          100% { transform: translate3d(0, 0, 0); }
        }
        @keyframes fa-subtle-float {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); opacity: 0.55; }
          50%      { transform: translate3d(0, -18px, 0) scale(1.04); opacity: 0.75; }
        }
        .fa-marquee-track {
          display: flex;
          width: max-content;
          will-change: transform;
        }
        .fa-marquee-track--rtl {
          animation: fa-loop-scroll-rtl 32s linear infinite;
        }
        .fa-marquee-track--ltr {
          animation: fa-loop-scroll-ltr 28s linear infinite;
        }
        .fa-marquee-mask {
          mask-image: linear-gradient(
            to right,
            transparent 0%,
            #000 8%,
            #000 92%,
            transparent 100%
          );
          -webkit-mask-image: linear-gradient(
            to right,
            transparent 0%,
            #000 8%,
            #000 92%,
            transparent 100%
          );
        }
        .fa-blob-float {
          animation: fa-subtle-float 11s ease-in-out infinite;
        }
        .fa-blob-float--delayed {
          animation: fa-subtle-float 13s ease-in-out infinite;
          animation-delay: -4s;
        }
        @media (prefers-reduced-motion: reduce) {
          .fa-marquee-track--rtl,
          .fa-marquee-track--ltr,
          .fa-blob-float,
          .fa-blob-float--delayed {
            animation: none !important;
          }
        }
      `}</style>

      {/* Floating brand-subtle accent blobs */}
      <div
        aria-hidden="true"
        className="fa-blob-float gradient-brand-subtle pointer-events-none absolute -top-32 -left-24 h-[28rem] w-[28rem] rounded-full blur-3xl opacity-60"
      />
      <div
        aria-hidden="true"
        className="fa-blob-float--delayed gradient-brand-subtle pointer-events-none absolute -bottom-32 -right-24 h-[32rem] w-[32rem] rounded-full blur-3xl opacity-50"
      />

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div
        ref={headerRef}
        className={`relative max-w-6xl mx-auto text-center ${
          headerInView || reducedMotion ? 'animate-fade-in-up' : 'opacity-0'
        }`}
      >
        <span className="mono text-[10px] sm:text-xs tracking-[0.4em] uppercase text-theme-muted">
          Why Frontier Alpha · Trust
        </span>
        <h2
          id="why-frontier-alpha-heading"
          className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-[1.05]"
        >
          <span className="text-gradient-brand">Built for cognition,</span>{' '}
          <span className="text-theme">not just compute</span>
        </h2>
        <p className="mt-4 text-base sm:text-lg text-theme-secondary max-w-2xl mx-auto">
          Five differentiators that compound across every cycle.
        </p>
      </div>

      {/* ── Animated metric pillars ─────────────────────────────────── */}
      <div
        ref={pillarsRef}
        className="relative max-w-6xl mx-auto mt-14 sm:mt-16 grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 animate-stagger"
      >
        {METRIC_PILLARS.map((pillar) => (
          <MetricPillarTile
            key={pillar.kicker}
            pillar={pillar}
            active={pillarsInView}
            instant={reducedMotion}
          />
        ))}
      </div>

      {/* ── vs-Traditional comparison row ───────────────────────────── */}
      <div className="relative max-w-6xl mx-auto mt-16 sm:mt-20">
        <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Traditional (left) */}
          <article
            className="glass-slab rounded-2xl p-6 sm:p-8 border border-theme animate-lift"
            aria-labelledby="trust-traditional-title"
          >
            <span className="mono text-[10px] sm:text-xs tracking-[0.4em] uppercase text-theme-muted">
              Traditional · Blind
            </span>
            <h3
              id="trust-traditional-title"
              className="mt-3 text-xl sm:text-2xl font-bold text-theme"
            >
              Static factor models
            </h3>
            <ul className="mt-6 space-y-3">
              {TRADITIONAL_POINTS.map((point) => (
                <li
                  key={point}
                  className="flex items-start gap-3 text-sm sm:text-[15px] text-theme-secondary"
                >
                  <XGlyph />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </article>

          {/* VS divider — lg+ only */}
          <div
            aria-hidden="true"
            className="hidden lg:flex absolute inset-y-6 left-1/2 -translate-x-1/2 flex-col items-center pointer-events-none"
          >
            <span className="flex-1 w-px bg-[image:var(--gradient-sovereign)] opacity-50" />
            <span className="my-3 px-2 py-1 rounded-sm glass-slab-floating mono text-[9px] tracking-[0.4em] uppercase text-theme-muted">
              vs
            </span>
            <span className="flex-1 w-px bg-[image:var(--gradient-sovereign)] opacity-50" />
          </div>

          {/* FrontierAlpha (right) */}
          <article
            className="relative glass-slab-floating border-sovereign rounded-2xl p-6 sm:p-8 animate-lift holo-pulse shadow-[0_10px_60px_color-mix(in_srgb,var(--color-accent)_18%,transparent)]"
            aria-labelledby="trust-frontier-title"
          >
            <span className="mono text-[10px] sm:text-xs tracking-[0.4em] uppercase text-theme-muted">
              Frontier Alpha · Cognitive
            </span>
            <h3
              id="trust-frontier-title"
              className="mt-3 text-xl sm:text-2xl font-bold text-gradient-brand"
            >
              Self-improving cognition
            </h3>
            <ul className="mt-6 space-y-3">
              {FRONTIER_POINTS.map((point) => (
                <li
                  key={point}
                  className="flex items-start gap-3 text-sm sm:text-[15px] text-theme"
                >
                  <CheckGlyph />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </article>
        </div>
      </div>

      {/* ── Data-source marquee ─────────────────────────────────────── */}
      <div
        className="relative mt-16 sm:mt-20"
        aria-label="Live data sources powering Frontier Alpha"
      >
        <div className="sovereign-bar w-full opacity-70" aria-hidden="true" />
        <div className="glass-slab-floating relative py-4 sm:py-5 fa-marquee-mask overflow-hidden">
          <MarqueeRow direction="rtl" items={DATA_SOURCES_PRIMARY} />
          <div className="h-2" aria-hidden="true" />
          <MarqueeRow direction="ltr" items={DATA_SOURCES_SECONDARY} muted />
        </div>
        <div className="sovereign-bar w-full opacity-70" aria-hidden="true" />
      </div>

      {/* ── Institutional-grade trust pill ──────────────────────────── */}
      <div className="relative max-w-6xl mx-auto mt-12 sm:mt-14 flex justify-center">
        <span
          className="glass-gold inline-flex items-center gap-3 px-5 py-3 rounded-full mono text-[10px] sm:text-[11px] tracking-[0.4em] uppercase"
          style={{ color: 'var(--brand-gold)' }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background: 'var(--brand-gold)',
              boxShadow: '0 0 12px var(--brand-gold)',
            }}
            aria-hidden="true"
          />
          <span className="text-gradient-gold">Institutional-Grade</span>
          <span className="text-theme-muted">·</span>
          <span className="text-gradient-gold">Cognitive Factor Models</span>
          <span className="text-theme-muted">·</span>
          <span className="text-gradient-gold">Built by Metaventions AI</span>
        </span>
      </div>
    </section>
  );
}

/* ───── Subcomponents ────────────────────────────────────────────────── */

function MetricPillarTile({
  pillar,
  active,
  instant,
}: {
  pillar: MetricPillar;
  active: boolean;
  instant: boolean;
}) {
  const value = useCountUp(pillar.target, { active, instant });
  const decimals = pillar.decimals ?? 0;
  const display = decimals > 0 ? value.toFixed(decimals) : Math.round(value).toString();

  const numberClass =
    pillar.tone === 'brand'
      ? 'text-gradient-brand'
      : pillar.tone === 'halo'
        ? 'text-gradient-halo'
        : pillar.tone === 'gold'
          ? 'text-gradient-gold'
          : 'text-theme';

  return (
    <div className="glass-slab-floating animate-enter rounded-2xl p-5 sm:p-6 animate-lift relative overflow-hidden">
      <span
        className="sovereign-bar absolute top-0 left-0 right-0 opacity-40"
        aria-hidden="true"
      />
      <span className="mono text-[10px] tracking-[0.4em] uppercase text-theme-muted">
        {pillar.kicker}
      </span>
      <div
        className={`mt-3 text-4xl sm:text-5xl font-black tracking-tight tabular-nums leading-none ${numberClass}`}
      >
        {pillar.prefix ?? ''}
        {display}
        {pillar.suffix ?? ''}
      </div>
      <p className="mt-3 text-xs sm:text-sm text-theme-secondary leading-snug">
        {pillar.description}
      </p>
    </div>
  );
}

function MarqueeRow({
  direction,
  items,
  muted = false,
}: {
  direction: 'rtl' | 'ltr';
  items: readonly string[];
  muted?: boolean;
}) {
  // Duplicate the list so the -50% translate keeps the strip seamless.
  const sequence = [...items, ...items];
  const trackClass =
    direction === 'rtl' ? 'fa-marquee-track fa-marquee-track--rtl' : 'fa-marquee-track fa-marquee-track--ltr';

  return (
    <div className="overflow-hidden">
      <ul
        className={trackClass}
        role="list"
        aria-hidden="true"
      >
        {sequence.map((item, idx) => (
          <li
            key={`${item}-${idx}`}
            className={`flex items-center gap-6 px-6 mono text-[10px] sm:text-[11px] tracking-[0.4em] uppercase whitespace-nowrap ${
              muted ? 'text-theme-muted' : 'text-theme-secondary'
            }`}
          >
            <span>{item}</span>
            <span className="text-theme-muted opacity-60" aria-hidden="true">
              ·
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CheckGlyph() {
  return (
    <svg
      className="mt-0.5 h-5 w-5 flex-shrink-0"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="10"
        cy="10"
        r="9"
        fill="color-mix(in srgb, var(--color-positive) 14%, transparent)"
        stroke="var(--color-positive)"
        strokeOpacity="0.55"
        strokeWidth="1"
      />
      <path
        d="M6 10.4l2.6 2.6L14 7.6"
        stroke="var(--color-positive)"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function XGlyph() {
  return (
    <svg
      className="mt-0.5 h-5 w-5 flex-shrink-0"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="10"
        cy="10"
        r="9"
        fill="var(--color-bg-tertiary)"
        stroke="var(--color-border)"
        strokeWidth="1"
      />
      <path
        d="M7 7l6 6M13 7l-6 6"
        stroke="var(--color-text-muted)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default TrustComparison;
