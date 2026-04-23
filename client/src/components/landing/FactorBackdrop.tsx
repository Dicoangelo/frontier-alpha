import { useMemo } from 'react';

const FACTOR_COUNT = 84;
const COLS = 42;

// Deterministic pseudo-random — same bar silhouette on every mount.
function seededHeights(n: number): number[] {
  const heights: number[] = [];
  let seed = 17;
  for (let i = 0; i < n; i++) {
    seed = (seed * 9301 + 49297) % 233280;
    const r = seed / 233280;
    heights.push(0.18 + r * 0.82);
  }
  return heights;
}

function tintFor(h: number): string {
  if (h > 0.72) return 'var(--color-accent-secondary)';
  if (h < 0.32) return 'var(--color-accent)';
  return 'color-mix(in srgb, var(--color-accent) 60%, var(--color-accent-secondary) 40%)';
}

interface Props {
  className?: string;
}

export function FactorBackdrop({ className = '' }: Props) {
  const heights = useMemo(() => seededHeights(FACTOR_COUNT), []);

  return (
    <div
      className={`absolute inset-0 pointer-events-none overflow-hidden ${className}`}
      aria-hidden="true"
    >
      <div
        className="absolute inset-x-0 bottom-0 flex items-end gap-[6px] px-4 sm:px-8"
        style={{ height: '62%' }}
      >
        {heights.map((h, i) => (
          <span
            key={i}
            className="factor-bar flex-1 rounded-sm"
            style={{
              height: `${Math.round(h * 100)}%`,
              background: `linear-gradient(to top, ${tintFor(h)}, color-mix(in srgb, ${tintFor(h)} 40%, transparent))`,
              animationDelay: `${(i % COLS) * 22}ms, ${1100 + (i * 37) % 2400}ms`,
              opacity: 0.22,
            }}
          />
        ))}
      </div>
      {/* Top-to-bottom fade so the bars read as atmosphere, not content */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(to bottom, var(--color-bg) 0%, color-mix(in srgb, var(--color-bg) 55%, transparent) 45%, color-mix(in srgb, var(--color-bg) 20%, transparent) 100%)',
        }}
      />
    </div>
  );
}

export default FactorBackdrop;
