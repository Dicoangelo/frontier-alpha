import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Inline hooks (self-contained — no new dependencies)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * useInView — fires once when the element enters the viewport.
 * Used to gate scroll-revealed reveals and keep visual demos quiet until seen.
 */
function useInView<T extends Element>(
  options: IntersectionObserverInit = { threshold: 0.18, rootMargin: '0px 0px -10% 0px' },
): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
          break;
        }
      }
    }, options);
    observer.observe(node);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return [ref, inView];
}

/**
 * usePrefersReducedMotion — listens to OS-level reduced-motion preference.
 */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mql.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mql.addEventListener?.('change', handler);
    return () => mql.removeEventListener?.('change', handler);
  }, []);
  return reduced;
}

/**
 * useIsTouch — detects touch-primary devices so we play demos automatically
 * (no hover affordance available).
 */
function useIsTouch(): boolean {
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(hover: none), (pointer: coarse)');
    setIsTouch(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsTouch(e.matches);
    mql.addEventListener?.('change', handler);
    return () => mql.removeEventListener?.('change', handler);
  }, []);
  return isTouch;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public component API
// ─────────────────────────────────────────────────────────────────────────────

export interface HowItWorksProps {
  onCTAClick: () => void;
}

const STEP_TICKERS = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'META'] as const;

const FACTOR_GROUPS: ReadonlyArray<{ name: string; weight: number }> = [
  { name: 'Momentum', weight: 0.86 },
  { name: 'Quality', weight: 0.74 },
  { name: 'Value', weight: 0.41 },
  { name: 'Macro', weight: 0.62 },
  { name: 'Sentiment', weight: 0.55 },
  { name: 'Volatility', weight: 0.38 },
  { name: 'Growth', weight: 0.79 },
  { name: 'Yield', weight: 0.46 },
  { name: 'Liquidity', weight: 0.52 },
  { name: 'AI Capex', weight: 0.91 },
  { name: 'Regime', weight: 0.67 },
  { name: 'Crowding', weight: 0.33 },
];

const BECAUSE_LINES: ReadonlyArray<string> = [
  'FCF margin + buyback yield dominate the sector',
  'Quality factor weakens as macro regime shifts',
  'Earnings beat probability rises with revision velocity',
];

export function HowItWorks({ onCTAClick }: HowItWorksProps): React.JSX.Element {
  const [sectionRef, sectionInView] = useInView<HTMLElement>();
  const reducedMotion = usePrefersReducedMotion();
  const isTouch = useIsTouch();

  const headingId = 'how-it-works-heading';

  return (
    <section
      ref={sectionRef}
      id="how-it-works"
      aria-labelledby={headingId}
      className="relative isolate overflow-hidden py-20 sm:py-24 lg:py-32 px-4 sm:px-6"
    >
      {/* Inline scoped keyframes — defined here so this component is self-contained */}
      <style>{`
        @keyframes ho-float {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); opacity: 0.55; }
          50%      { transform: translate3d(0, -14px, 0) scale(1.04); opacity: 0.85; }
        }
        @keyframes ho-blink {
          0%, 60% { opacity: 1; }
          80%, 100% { opacity: 0; }
        }
        @keyframes ho-stream {
          0%   { transform: translateX(-30%); }
          100% { transform: translateX(130%); }
        }
        @keyframes ho-bar-rise {
          0%   { transform: scaleY(0.15); opacity: 0.35; }
          100% { transform: scaleY(1);    opacity: 1;    }
        }
        @media (prefers-reduced-motion: reduce) {
          .ho-float-blob,
          .ho-stream-line,
          .ho-bar,
          .ho-blink {
            animation: none !important;
            transform: none !important;
            opacity: 1 !important;
          }
        }
      `}</style>

      {/* Floating gradient accents (decorative) */}
      <div
        aria-hidden="true"
        className="ho-float-blob pointer-events-none absolute -top-24 -left-16 w-72 h-72 rounded-full gradient-brand-subtle blur-3xl"
        style={{ animation: reducedMotion ? 'none' : 'ho-float 9s ease-in-out infinite' }}
      />
      <div
        aria-hidden="true"
        className="ho-float-blob pointer-events-none absolute bottom-0 -right-20 w-80 h-80 rounded-full gradient-brand-subtle blur-3xl"
        style={{
          animation: reducedMotion ? 'none' : 'ho-float 11s ease-in-out infinite',
          animationDelay: '-3.5s',
        }}
      />

      <div className="relative max-w-6xl mx-auto">
        {/* ── Header ─────────────────────────────────────────────────── */}
        <header className={sectionInView ? 'animate-fade-in-up' : 'opacity-0'}>
          <div className="text-[10px] sm:text-xs mono tracking-[0.4em] uppercase text-theme-muted">
            <span className="text-gradient-halo">How it works</span>
            <span className="mx-2 text-theme-muted">·</span>
            <span>Three steps to model-driven investing</span>
          </div>
          <h2
            id={headingId}
            className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-black leading-[1.05] tracking-tight text-[var(--color-text)]"
          >
            From your tickers to{' '}
            <span className="text-gradient-halo">your edge</span>
          </h2>
          <p className="mt-4 max-w-2xl text-base sm:text-lg text-[var(--color-text-secondary)]">
            Paste a portfolio. Watch the cognitive factor model decompose every
            holding into 76 factors and ship the reasoning trail with the read.
          </p>
        </header>

        {/* ── Step cards row ─────────────────────────────────────────── */}
        <div className="relative mt-12 sm:mt-16">
          {/* Connecting line — visible on lg+, runs through the cards' midline */}
          <ConnectingLine visible={sectionInView} />

          <ol
            className={
              'relative grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 list-none p-0 ' +
              (sectionInView ? 'animate-stagger' : '')
            }
          >
            <StepCard
              index={0}
              kicker="01 · INGEST"
              title="Paste your portfolio"
              body="Up to 20 symbols. We pull live quotes, fundamentals, and news in real time."
              accent="var(--color-accent)"
              sectionInView={sectionInView}
              reducedMotion={reducedMotion}
              isTouch={isTouch}
              renderVisual={(active) => (
                <IngestVisual active={active} reducedMotion={reducedMotion} />
              )}
            />
            <StepCard
              index={1}
              kicker="02 · DECOMPOSE"
              title="76 factors per holding"
              body="Momentum, quality, value, macro, sentiment — every position scored across 12 factor groups."
              accent="var(--chart-primary)"
              sectionInView={sectionInView}
              reducedMotion={reducedMotion}
              isTouch={isTouch}
              renderVisual={(active) => (
                <DecomposeVisual active={active} reducedMotion={reducedMotion} />
              )}
            />
            <StepCard
              index={2}
              kicker="03 · EXPLAIN"
              title="Why, not just what"
              body="Every recommendation ships with the cognitive trail that produced it — citations, regime, conviction."
              accent="var(--color-accent-secondary)"
              sectionInView={sectionInView}
              reducedMotion={reducedMotion}
              isTouch={isTouch}
              renderVisual={(active) => (
                <ExplainVisual active={active} reducedMotion={reducedMotion} />
              )}
            />
          </ol>
        </div>

        {/* ── Bottom CTA strip ───────────────────────────────────────── */}
        <div
          className={
            'mt-12 sm:mt-16 glass-slab-floating rounded-2xl p-6 sm:p-8 ' +
            'flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 sm:gap-8 ' +
            (sectionInView ? 'animate-fade-in-up' : 'opacity-0')
          }
        >
          <div>
            <div className="text-[10px] sm:text-xs mono tracking-[0.4em] uppercase text-theme-muted">
              Ready when you are
            </div>
            <p className="mt-2 text-xl sm:text-2xl font-bold text-[var(--color-text)] leading-snug">
              Ready to see your portfolio's{' '}
              <span className="text-gradient-halo">cognitive read</span>?
            </p>
          </div>
          <button
            type="button"
            onClick={onCTAClick}
            className={
              'shrink-0 px-8 py-3 bg-[image:var(--gradient-sovereign)] text-white rounded-sm ' +
              'mono text-[10px] sm:text-xs font-black tracking-[0.3em] uppercase ' +
              'animate-press animate-lift ' +
              'shadow-[0_4px_30px_rgba(123,44,255,0.35)] hover:shadow-[0_6px_40px_rgba(123,44,255,0.5)] hover:brightness-110 ' +
              'min-w-[220px]'
            }
          >
            Run my analysis →
          </button>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StepCard
// ─────────────────────────────────────────────────────────────────────────────

interface StepCardProps {
  index: number;
  kicker: string;
  title: string;
  body: string;
  accent: string;
  sectionInView: boolean;
  reducedMotion: boolean;
  isTouch: boolean;
  renderVisual: (active: boolean) => React.ReactNode;
}

function StepCard({
  index,
  kicker,
  title,
  body,
  accent,
  sectionInView,
  reducedMotion,
  isTouch,
  renderVisual,
}: StepCardProps): React.JSX.Element {
  const [hovered, setHovered] = useState(false);
  // Visual demo plays when:
  //   - section in view AND user is hovering, OR
  //   - section in view AND device is touch-primary, OR
  //   - reduced-motion (we just show the rest state instantly)
  const active = sectionInView && (hovered || isTouch || reducedMotion);

  const headingId = `how-it-works-step-${index}-title`;

  return (
    <li
      className={
        'relative glass-slab rounded-2xl p-6 sm:p-8 group ' +
        'animate-enter animate-lift ' +
        'transition-[border-color] duration-300'
      }
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      aria-labelledby={headingId}
    >
      {/* Sovereign hairline that runs underneath on hover */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-6 right-6 -bottom-px h-px bg-[image:var(--gradient-sovereign)] origin-left transition-transform duration-500 ease-out"
        style={{ transform: hovered ? 'scaleX(1)' : 'scaleX(0)' }}
      />

      <div className="flex items-center justify-between">
        <span
          className="text-[10px] sm:text-xs mono tracking-[0.4em] uppercase text-theme-muted"
          style={{ color: hovered ? accent : undefined, transition: 'color 240ms ease' }}
        >
          {kicker}
        </span>
        <span
          aria-hidden="true"
          className="w-2 h-2 rounded-full"
          style={{
            background: accent,
            boxShadow: hovered ? `0 0 14px ${accent}` : 'none',
            transition: 'box-shadow 240ms ease',
          }}
        />
      </div>

      <h3
        id={headingId}
        className="mt-4 text-xl sm:text-2xl font-bold text-[var(--color-text)] tracking-tight"
      >
        {title}
      </h3>
      <p className="mt-2 text-sm sm:text-[15px] text-[var(--color-text-secondary)] leading-relaxed">
        {body}
      </p>

      {/* Demo surface */}
      <div
        className="mt-6 rounded-sm border border-[var(--color-border-light)] bg-[var(--color-bg-tertiary)] p-4 min-h-[180px]"
        aria-hidden="true"
      >
        {renderVisual(active)}
      </div>
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 01 visual — Mock terminal cascading tickers
// ─────────────────────────────────────────────────────────────────────────────

function IngestVisual({
  active,
  reducedMotion,
}: {
  active: boolean;
  reducedMotion: boolean;
}): React.JSX.Element {
  const [revealed, setRevealed] = useState<number>(reducedMotion ? STEP_TICKERS.length : 0);

  useEffect(() => {
    if (reducedMotion) {
      setRevealed(STEP_TICKERS.length);
      return;
    }
    if (!active) {
      setRevealed(0);
      return;
    }
    let cancelled = false;
    let i = 0;
    const tick = () => {
      if (cancelled) return;
      i = (i + 1) % (STEP_TICKERS.length + 2);
      setRevealed(Math.min(i, STEP_TICKERS.length));
      if (i >= STEP_TICKERS.length + 1) {
        // brief hold, then loop
        window.setTimeout(() => {
          if (!cancelled) {
            i = 0;
            setRevealed(0);
          }
        }, 600);
      }
    };
    setRevealed(0);
    const id = window.setInterval(tick, 360);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [active, reducedMotion]);

  return (
    <div className="font-[family-name:var(--font-mono)] text-[11px] sm:text-xs leading-relaxed">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-positive)]" />
        <span className="text-[9px] tracking-[0.3em] uppercase text-theme-muted">
          parsing tickers
        </span>
      </div>
      <div className="space-y-1">
        {STEP_TICKERS.map((sym, i) => {
          const shown = i < revealed;
          return (
            <div
              key={sym}
              className="flex items-center gap-2"
              style={{
                opacity: shown ? 1 : 0,
                transform: shown ? 'translateX(0)' : 'translateX(-6px)',
                transition: `opacity 280ms ease ${i * 40}ms, transform 280ms ease ${i * 40}ms`,
              }}
            >
              <span className="text-[var(--color-accent-secondary)]">›</span>
              <span className="text-[var(--color-text)] tracking-[0.15em]">{sym}</span>
              <span className="ml-auto text-[var(--color-positive)]">✓</span>
            </div>
          );
        })}
        {/* Cursor line */}
        <div className="flex items-center gap-2 pt-1">
          <span className="text-[var(--color-accent-secondary)]">›</span>
          <span
            aria-hidden="true"
            className="ho-blink inline-block w-1.5 h-3 bg-[var(--color-accent-secondary)]"
            style={{ animation: reducedMotion ? 'none' : 'ho-blink 1.1s steps(1) infinite' }}
          />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 02 visual — 4×3 factor grid with cycling highlight + tooltip on hover
// ─────────────────────────────────────────────────────────────────────────────

function DecomposeVisual({
  active,
  reducedMotion,
}: {
  active: boolean;
  reducedMotion: boolean;
}): React.JSX.Element {
  const [highlight, setHighlight] = useState<number>(-1);
  const [hovered, setHovered] = useState<number>(-1);

  useEffect(() => {
    if (reducedMotion || !active) {
      setHighlight(-1);
      return;
    }
    let i = 0;
    setHighlight(0);
    const id = window.setInterval(() => {
      i = (i + 1) % FACTOR_GROUPS.length;
      setHighlight(i);
    }, 900);
    return () => window.clearInterval(id);
  }, [active, reducedMotion]);

  const focusIndex = hovered >= 0 ? hovered : highlight;
  const focusFactor = focusIndex >= 0 ? FACTOR_GROUPS[focusIndex] : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[9px] mono tracking-[0.3em] uppercase text-theme-muted">
          12 factor groups
        </span>
        <span
          className="text-[10px] mono tabular-nums text-[var(--color-text-secondary)]"
          aria-live="polite"
        >
          {focusFactor ? (
            <>
              <span className="text-[var(--color-accent-secondary)]">{focusFactor.name}</span>
              <span className="mx-1.5 text-theme-muted">·</span>
              <span className="text-[var(--color-positive)]">
                +{Math.round(focusFactor.weight * 100)}
              </span>
            </>
          ) : (
            <span className="text-theme-muted">—</span>
          )}
        </span>
      </div>
      <div className="grid grid-cols-4 grid-rows-3 gap-1.5 h-[120px]">
        {FACTOR_GROUPS.map((f, i) => {
          const isFocus = i === focusIndex;
          const heightPct = Math.round(f.weight * 100);
          return (
            <div
              key={f.name}
              role="img"
              aria-label={`${f.name}: ${heightPct}`}
              className="relative flex items-end rounded-sm bg-[var(--color-bg-tertiary)] border border-[var(--color-border-light)] overflow-hidden cursor-default"
              style={{
                transform: isFocus ? 'translateY(-2px)' : 'translateY(0)',
                transition: 'transform 240ms cubic-bezier(0.2, 0.8, 0.2, 1)',
                borderColor: isFocus ? 'var(--color-accent-secondary)' : undefined,
              }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(-1)}
              onFocus={() => setHovered(i)}
              onBlur={() => setHovered(-1)}
              tabIndex={0}
            >
              <span
                className="ho-bar block w-full"
                style={{
                  height: `${heightPct}%`,
                  background: isFocus
                    ? 'linear-gradient(to top, #FF3DF2, #7B2CFF, #18E6FF)'
                    : 'linear-gradient(to top, color-mix(in srgb, var(--color-accent) 60%, transparent), color-mix(in srgb, var(--color-accent-secondary) 30%, transparent))',
                  transformOrigin: 'bottom',
                  animation: reducedMotion
                    ? 'none'
                    : `ho-bar-rise 620ms cubic-bezier(0.2, 0.8, 0.2, 1) ${i * 40}ms both`,
                  transition: 'background 320ms ease',
                }}
              />
              {isFocus && (
                <span
                  aria-hidden="true"
                  className="absolute inset-0 ring-1 ring-inset"
                  style={{
                    boxShadow:
                      '0 0 12px color-mix(in srgb, var(--color-accent-secondary) 40%, transparent)',
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 03 visual — BECAUSE caption that cycles
// ─────────────────────────────────────────────────────────────────────────────

function ExplainVisual({
  active,
  reducedMotion,
}: {
  active: boolean;
  reducedMotion: boolean;
}): React.JSX.Element {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (reducedMotion || !active) return;
    const id = window.setInterval(() => {
      setIdx((n) => (n + 1) % BECAUSE_LINES.length);
    }, 2600);
    return () => window.clearInterval(id);
  }, [active, reducedMotion]);

  const current = useMemo(() => BECAUSE_LINES[idx], [idx]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent-secondary)]" />
        <span className="text-[9px] mono tracking-[0.3em] uppercase text-theme-muted">
          cognitive trail
        </span>
      </div>
      <div className="rounded-sm border border-[var(--color-border-light)] bg-[var(--color-bg-secondary)] p-3 min-h-[88px] flex items-start">
        <p
          key={`because-${idx}`}
          className="text-xs sm:text-sm text-[var(--color-text-secondary)] leading-relaxed caption-cycle"
        >
          <span className="text-[var(--color-accent-secondary)] mono text-[10px] tracking-[0.3em] uppercase mr-2">
            Because
          </span>
          {current}
        </p>
      </div>
      <div className="mt-3 flex items-center gap-1.5">
        {BECAUSE_LINES.map((_, i) => (
          <span
            key={i}
            aria-hidden="true"
            className="h-1 rounded-full transition-all duration-300"
            style={{
              width: i === idx ? 22 : 8,
              background:
                i === idx
                  ? 'linear-gradient(to right, #FF3DF2, #7B2CFF, #18E6FF)'
                  : 'var(--color-border)',
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Connecting line between cards (lg+ only) — gradient with three boundary dots
// ─────────────────────────────────────────────────────────────────────────────

function ConnectingLine({ visible }: { visible: boolean }): React.JSX.Element {
  return (
    <div
      aria-hidden="true"
      className="hidden lg:block pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 z-0"
    >
      <div className="relative max-w-6xl mx-auto px-8">
        {/* Hairline */}
        <div
          className="h-px bg-[image:var(--gradient-sovereign)] origin-left"
          style={{
            transform: visible ? 'scaleX(1)' : 'scaleX(0)',
            transition: 'transform 900ms cubic-bezier(0.2, 0.8, 0.2, 1) 200ms',
            opacity: 0.55,
          }}
        />
        {/* Three boundary dots */}
        <div className="absolute inset-0 flex items-center justify-between px-8">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-2.5 h-2.5 rounded-full"
              style={{
                background:
                  i === 0
                    ? 'var(--brand-magenta)'
                    : i === 1
                      ? 'var(--brand-amethyst)'
                      : 'var(--brand-cyan)',
                boxShadow: '0 0 12px currentColor',
                opacity: visible ? 1 : 0,
                transition: `opacity 400ms ease ${400 + i * 150}ms`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default HowItWorks;
