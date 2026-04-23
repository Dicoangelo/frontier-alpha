import { useMemo } from 'react';

export interface StaggerOptions {
  /** per-item delay in ms, default 60 */
  step?: number;
  /** initial delay for the first item in ms, default 0 */
  initial?: number;
  /** cap the total stagger cascade — items past this snap in with no delay */
  maxTotalMs?: number;
  /** mode — 'enter' adds animation-delay; 'reorder' adds transitionDelay */
  mode?: 'enter' | 'reorder';
}

export interface StaggerStyle {
  animationDelay?: string;
  transitionDelay?: string;
}

/**
 * Return an array of style objects for staggered entry of N items.
 *
 * @example
 * const styles = useStagger(positions.length);
 * positions.map((p, i) => <Card style={styles[i]} className="animate-enter" />)
 */
export function useStagger(count: number, opts: StaggerOptions = {}): StaggerStyle[] {
  const { step = 60, initial = 0, maxTotalMs = 600, mode = 'enter' } = opts;

  return useMemo(() => {
    if (count <= 0) return [];
    const styles: StaggerStyle[] = [];
    for (let i = 0; i < count; i++) {
      const rawDelay = initial + i * step;
      const clamped = Math.min(rawDelay, maxTotalMs);
      const delay = `${clamped}ms`;
      styles.push(mode === 'enter' ? { animationDelay: delay } : { transitionDelay: delay });
    }
    return styles;
  }, [count, step, initial, maxTotalMs, mode]);
}

export default useStagger;
