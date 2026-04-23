import { useSyncExternalStore } from 'react';

export type FreshnessTier = 'fresh' | 'stale' | 'frozen' | 'unknown';

export interface FreshnessReading {
  ageSeconds: number;
  tier: FreshnessTier;
}

/**
 * Thresholds (inclusive lower bound):
 *   0..15s  → fresh
 *   15..60s → stale
 *   >60s    → frozen
 */
export const FRESHNESS_THRESHOLDS = { staleSeconds: 15, frozenSeconds: 60 };

export function tierFor(ageSeconds: number): FreshnessTier {
  if (!Number.isFinite(ageSeconds) || ageSeconds < 0) return 'unknown';
  if (ageSeconds < FRESHNESS_THRESHOLDS.staleSeconds) return 'fresh';
  if (ageSeconds < FRESHNESS_THRESHOLDS.frozenSeconds) return 'stale';
  return 'frozen';
}

// ── Shared 1Hz clock (module-scoped) ─────────────────────────────────
type Listener = () => void;
const listeners = new Set<Listener>();
let intervalId: ReturnType<typeof setInterval> | null = null;
let sharedNow = Date.now();

function startClock() {
  if (intervalId !== null) return;
  intervalId = setInterval(() => {
    sharedNow = Date.now();
    listeners.forEach((l) => l());
  }, 1000);
}

function stopClockIfIdle() {
  if (listeners.size === 0 && intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  startClock();
  return () => {
    listeners.delete(listener);
    stopClockIfIdle();
  };
}

function getSnapshot(): number {
  return sharedNow;
}

function getServerSnapshot(): number {
  return 0;
}

// ── Stale event bus (window-wide) ────────────────────────────────────
interface StaleDetail {
  source: string;
  ageSeconds: number;
  tier: FreshnessTier;
}

const STALE_EVENT = 'frontier-alpha:data-stale';

export function emitStale(detail: StaleDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<StaleDetail>(STALE_EVENT, { detail }));
}

export function onStale(handler: (detail: StaleDetail) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const wrapped = (e: Event) => handler((e as CustomEvent<StaleDetail>).detail);
  window.addEventListener(STALE_EVENT, wrapped);
  return () => window.removeEventListener(STALE_EVENT, wrapped);
}

// ── Hook ─────────────────────────────────────────────────────────────
export function useDataFreshness(
  timestamp: number | null | undefined,
  source?: string,
): FreshnessReading {
  const now = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (timestamp == null) return { ageSeconds: -1, tier: 'unknown' };
  const ageSeconds = Math.floor((now - timestamp) / 1000);
  const tier = tierFor(ageSeconds);
  // Fire a stale event when tier is frozen — allows cards to dim themselves.
  if (tier === 'frozen' && source && typeof window !== 'undefined') {
    // Guard: only emit once per tick via a WeakMap isn't worth it — consumers
    // are expected to throttle. Keep it simple.
    emitStale({ source, ageSeconds, tier });
  }
  return { ageSeconds, tier };
}

export default useDataFreshness;
