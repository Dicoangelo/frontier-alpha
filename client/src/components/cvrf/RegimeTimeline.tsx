/**
 * Regime Timeline Component
 *
 * Horizontal colored timeline showing regime transitions.
 * Bull=positive, Bear=negative, Sideways=warning, Volatile=warning, Recovery=info
 */

import { Clock } from 'lucide-react';
import { useCVRFHistory } from '@/hooks/useCVRF';

interface RegimeSegment {
  regime: string;
  startCycle: number;
  endCycle: number;
  duration: number;
}

const REGIME_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  bull: { bg: 'bg-[var(--color-positive)]', border: 'border-[var(--color-positive)]', text: 'text-[var(--color-positive)]' },
  bear: { bg: 'bg-[var(--color-negative)]', border: 'border-[var(--color-negative)]', text: 'text-[var(--color-negative)]' },
  sideways: { bg: 'bg-[var(--color-warning)]', border: 'border-[var(--color-warning)]', text: 'text-[var(--color-warning)]' },
  volatile: { bg: 'bg-[var(--color-warning)]', border: 'border-[var(--color-warning)]', text: 'text-[var(--color-warning)]' },
  recovery: { bg: 'bg-[var(--color-info)]', border: 'border-[var(--color-info)]', text: 'text-[var(--color-info)]' },
};

const REGIME_ICONS: Record<string, string> = {
  bull: '📈',
  bear: '📉',
  sideways: '➡️',
  volatile: '🌊',
  recovery: '🔄',
};

function getRegimeStyle(regime: string) {
  return REGIME_COLORS[regime] || REGIME_COLORS.sideways;
}

export function RegimeTimeline() {
  const { data: history, isLoading } = useCVRFHistory();

  if (isLoading) {
    return (
      <div className="glass-slab rounded-2xl p-6 sm:p-8">
        <div className="h-6 bg-[var(--color-border)] rounded w-1/3 mb-4 animate-shimmer" />
        <div className="h-16 bg-[var(--color-bg-secondary)] rounded animate-shimmer" />
      </div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <div className="glass-slab rounded-2xl p-6 sm:p-8">
        <div className="mb-4">
          <p className="mono text-[10px] sm:text-xs tracking-[0.3em] uppercase text-theme-muted mb-2">
            Regime Stream
          </p>
          <h3 className="text-lg font-semibold text-theme flex items-center gap-2">
            <Clock className="w-5 h-5 text-[var(--color-accent)]" aria-hidden="true" />
            Regime Timeline
          </h3>
        </div>
        <div className="flex items-center justify-center h-16 text-theme-muted text-sm">
          Run CVRF cycles to track regime transitions
        </div>
      </div>
    );
  }

  // Build regime segments from cycle history
  const segments: RegimeSegment[] = [];
  let currentRegime = history[0]?.newRegime || 'sideways';
  let segmentStart = 1;

  history.forEach((cycle, idx) => {
    const cycleNum = idx + 1;
    const regime = cycle.newRegime || currentRegime;

    if (regime !== currentRegime) {
      segments.push({
        regime: currentRegime,
        startCycle: segmentStart,
        endCycle: cycleNum - 1,
        duration: cycleNum - segmentStart,
      });
      currentRegime = regime;
      segmentStart = cycleNum;
    }
  });

  // Push final segment
  segments.push({
    regime: currentRegime,
    startCycle: segmentStart,
    endCycle: history.length,
    duration: history.length - segmentStart + 1,
  });

  const totalCycles = history.length;

  // Count transitions
  const transitions = segments.length - 1;
  const longestRegime = segments.reduce((max, s) => (s.duration > max.duration ? s : max), segments[0]);

  return (
    <div className="glass-slab rounded-2xl p-6 sm:p-8 animate-enter">
      {/* Header */}
      <div className="flex items-end justify-between gap-3 mb-4">
        <div>
          <p className="mono text-[10px] sm:text-xs tracking-[0.3em] uppercase text-theme-muted mb-2">
            Regime Stream
          </p>
          <h3 className="text-lg font-semibold text-theme flex items-center gap-2">
            <Clock className="w-5 h-5 text-[var(--color-accent)]" aria-hidden="true" />
            Regime Timeline
          </h3>
        </div>
        <span className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted tabular-nums">
          {transitions} transition{transitions !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Visual Timeline Bar */}
      <div className="flex rounded-lg overflow-hidden h-10 mb-4">
        {segments.map((segment, idx) => {
          const widthPct = (segment.duration / totalCycles) * 100;
          const style = getRegimeStyle(segment.regime);

          return (
            <div
              key={idx}
              className={`${style.bg} border-r ${style.border} last:border-r-0 flex items-center justify-center transition-[width] duration-300 relative group cursor-default`}
              style={{ width: `${Math.max(widthPct, 8)}%` }}
              title={`${segment.regime} (Cycles ${segment.startCycle}-${segment.endCycle})`}
            >
              <span className="text-sm" aria-hidden="true">
                {REGIME_ICONS[segment.regime] || '❓'}
              </span>

              {/* Tooltip on hover — backdrop-blurred */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                <div className="backdrop-blur-md bg-[var(--color-bg-tooltip)] text-[var(--color-text-inverse)] border border-theme-light rounded-lg shadow-lg p-2 text-xs whitespace-nowrap">
                  <div className={`font-semibold capitalize ${style.text}`}>{segment.regime}</div>
                  <div className="opacity-70 tabular-nums">
                    Cycles {segment.startCycle}–{segment.endCycle} ({segment.duration} cycle{segment.duration !== 1 ? 's' : ''})
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Segment Details */}
      <div className="space-y-2">
        {segments.map((segment, idx) => {
          const style = getRegimeStyle(segment.regime);
          return (
            <div key={idx} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded ${style.bg} border ${style.border}`} aria-hidden="true" />
                <span className={`capitalize font-medium ${style.text}`}>{segment.regime}</span>
              </div>
              <div className="flex items-center gap-3 mono text-[10px] tracking-[0.2em] uppercase text-theme-muted tabular-nums">
                <span>
                  Cycles {segment.startCycle}–{segment.endCycle}
                </span>
                <span>
                  {segment.duration} cycle{segment.duration !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <p className="mt-4 pt-3 border-t border-[var(--color-border-light)] mono text-[10px] tracking-[0.2em] uppercase text-theme-muted tabular-nums">
        Current:{' '}
        <span className={`font-semibold capitalize ${getRegimeStyle(currentRegime).text}`}>
          {currentRegime}
        </span>
        {longestRegime && (
          <>
            {' · Longest: '}
            <span className="font-medium capitalize">{longestRegime.regime}</span>{' '}
            ({longestRegime.duration} cycle{longestRegime.duration !== 1 ? 's' : ''})
          </>
        )}
      </p>
    </div>
  );
}
