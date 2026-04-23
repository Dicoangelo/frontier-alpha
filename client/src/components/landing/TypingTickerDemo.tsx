import { useEffect, useMemo, useState } from 'react';

interface FactorReading {
  name: string;
  weight: number; // -1 .. 1
}

interface TickerScene {
  symbol: string;
  factors: FactorReading[];
  because: string;
}

const SCENES: TickerScene[] = [
  {
    symbol: 'NVDA',
    factors: [
      { name: 'Momentum', weight: 0.91 },
      { name: 'Quality', weight: 0.72 },
      { name: 'AI Capex', weight: 0.88 },
      { name: 'Valuation', weight: -0.54 },
    ],
    because: 'because earnings revisions are still outrunning forward multiples',
  },
  {
    symbol: 'AAPL',
    factors: [
      { name: 'Quality', weight: 0.82 },
      { name: 'Low Vol', weight: 0.58 },
      { name: 'Buyback Yield', weight: 0.61 },
      { name: 'Growth', weight: -0.18 },
    ],
    because: 'because FCF margin + buyback yield dominate the sector',
  },
  {
    symbol: 'TSLA',
    factors: [
      { name: 'Momentum', weight: 0.44 },
      { name: 'Volatility', weight: 0.77 },
      { name: 'Sentiment', weight: 0.63 },
      { name: 'Quality', weight: -0.22 },
    ],
    because: 'because reflexive sentiment dwarfs the quality drag',
  },
  {
    symbol: 'GOOGL',
    factors: [
      { name: 'Quality', weight: 0.79 },
      { name: 'AI Moat', weight: 0.55 },
      { name: 'Valuation', weight: 0.31 },
      { name: 'Regulatory', weight: -0.42 },
    ],
    because: 'because the valuation gap more than prices regulatory risk',
  },
];

const TYPE_SPEED = 90;
const HOLD_MS = 2800;

export function TypingTickerDemo() {
  const [sceneIdx, setSceneIdx] = useState(0);
  const [typed, setTyped] = useState('');
  const [phase, setPhase] = useState<'typing' | 'holding' | 'clearing'>('typing');

  const scene = SCENES[sceneIdx];

  useEffect(() => {
    if (phase === 'typing') {
      if (typed.length < scene.symbol.length) {
        const id = window.setTimeout(() => {
          setTyped(scene.symbol.slice(0, typed.length + 1));
        }, TYPE_SPEED);
        return () => window.clearTimeout(id);
      }
      const id = window.setTimeout(() => setPhase('holding'), 120);
      return () => window.clearTimeout(id);
    }
    if (phase === 'holding') {
      const id = window.setTimeout(() => setPhase('clearing'), HOLD_MS);
      return () => window.clearTimeout(id);
    }
    // clearing
    if (typed.length > 0) {
      const id = window.setTimeout(() => {
        setTyped(typed.slice(0, -1));
      }, TYPE_SPEED / 2);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(() => {
      setSceneIdx((sceneIdx + 1) % SCENES.length);
      setPhase('typing');
    }, 220);
    return () => window.clearTimeout(id);
  }, [phase, typed, scene.symbol, sceneIdx]);

  const showFactors = phase === 'holding' || (phase === 'typing' && typed.length === scene.symbol.length);

  return (
    <div className="glass-slab rounded-sm p-5 sm:p-6 max-w-md w-full relative z-10 animate-fade-in-up">
      <div className="flex items-center justify-between mb-4">
        <span className="text-[9px] mono tracking-[0.4em] uppercase text-[var(--color-text-muted)]">
          Live Factor Read
        </span>
        <span className="flex items-center gap-2 text-[9px] mono tracking-[0.3em] uppercase text-[var(--color-text-muted)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-positive)]" />
          synthesizing
        </span>
      </div>

      <div className="flex items-baseline gap-2 mb-5 min-h-[44px]">
        <span
          className="text-3xl sm:text-4xl font-black tracking-tight text-gradient-brand holo-pulse"
          style={{ letterSpacing: '-0.02em' }}
        >
          {typed || ' '}
        </span>
        <span className="typing-cursor" />
      </div>

      <div className="space-y-2">
        {scene.factors.map((f, i) => (
          <FactorRow key={`${scene.symbol}-${f.name}`} factor={f} visible={showFactors} delayMs={i * 60} />
        ))}
      </div>

      <div className="mt-5 pt-4 border-t border-[var(--color-border-light)] min-h-[42px]">
        <p
          key={`${scene.symbol}-because`}
          className="text-xs sm:text-sm text-[var(--color-text-secondary)] caption-cycle"
        >
          <span className="text-[var(--color-accent-secondary)] mono text-[10px] tracking-[0.3em] uppercase mr-2">
            Because
          </span>
          {scene.because.replace(/^because\s/i, '')}
        </p>
      </div>
    </div>
  );
}

function FactorRow({ factor, visible, delayMs }: { factor: FactorReading; visible: boolean; delayMs: number }) {
  const pct = useMemo(() => Math.min(1, Math.abs(factor.weight)), [factor.weight]);
  const positive = factor.weight >= 0;
  const fill = positive ? 'var(--color-accent-secondary)' : 'var(--color-accent)';

  return (
    <div className="flex items-center gap-3">
      <span className="w-24 sm:w-28 text-[10px] mono tracking-[0.2em] uppercase text-[var(--color-text-muted)]">
        {factor.name}
      </span>
      <span className="flex-1 h-1.5 rounded-sm bg-[var(--color-bg-tertiary)] overflow-hidden">
        <span
          className="block h-full"
          style={{
            width: visible ? `${Math.round(pct * 100)}%` : '0%',
            background: `linear-gradient(to right, ${fill}, color-mix(in srgb, ${fill} 40%, transparent))`,
            transition: `width 620ms cubic-bezier(0.2, 0.8, 0.2, 1) ${delayMs}ms`,
          }}
        />
      </span>
      <span
        className="w-12 text-right text-[10px] mono tracking-[0.2em]"
        style={{ color: positive ? 'var(--color-positive)' : 'var(--color-negative)' }}
      >
        {factor.weight >= 0 ? '+' : ''}
        {(factor.weight * 100).toFixed(0)}
      </span>
    </div>
  );
}

export default TypingTickerDemo;
