/**
 * MemoryCache<T> — generic in-process key/value cache with TTL.
 *
 * One half of US-006's extracted cache module. The other halves are
 * `SupabaseCache` (durable) and `CompositeCache<T>` (composes the two).
 *
 * Design contract:
 *   - Generic over the value type so the same class can hold price arrays,
 *     factor exposures, or any future cacheable shape.
 *   - TTL is per-entry (`set(key, value, ttlMs?)`); a default TTL is set at
 *     construction time and used when callers don't specify one.
 *   - `get(key)` returns the raw value if fresh; if the entry exists but is
 *     past TTL, it returns `null` AND increments the `staleCount` counter.
 *     Callers that want stale-while-revalidate semantics should use
 *     `getStale(key)` which always returns the value and a flag.
 *   - Counter telemetry (`hitCount`, `missCount`, `staleCount`) is exposed so
 *     US-008's `/health/errors` (and the weekly digest) can roll it up via
 *     `getCacheTelemetry()` in `cache/index.ts`.
 *
 * Eviction:
 *   - LRU-light: `set()` checks `size` against `maxEntries` and drops the
 *     oldest insertion if at the cap. We use Map's natural insertion-order
 *     iteration for this — no separate doubly-linked list, accepted because
 *     the cache is small (5–50 symbols on solo-user, low thousands at most).
 */

export interface MemoryCacheOptions {
  /** Default TTL in milliseconds applied when `set` is called without one. */
  defaultTtlMs?: number;
  /** Maximum number of entries before oldest gets evicted on insert. */
  maxEntries?: number;
}

interface Entry<T> {
  value: T;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour
const DEFAULT_MAX_ENTRIES = 1000;

export class MemoryCache<T> {
  private store = new Map<string, Entry<T>>();
  private defaultTtlMs: number;
  private maxEntries: number;

  hitCount = 0;
  missCount = 0;
  /**
   * Bumped when `get(key)` finds an entry whose TTL has expired. The entry
   * is removed and a miss is also recorded so `hitCount + missCount` always
   * equals the total `get()` calls.
   */
  staleCount = 0;

  constructor(opts: MemoryCacheOptions = {}) {
    this.defaultTtlMs = opts.defaultTtlMs ?? DEFAULT_TTL_MS;
    this.maxEntries = opts.maxEntries ?? DEFAULT_MAX_ENTRIES;
  }

  /**
   * Read a fresh value for `key`. Returns `null` on miss OR on stale entry
   * (the stale entry is removed and `staleCount` is bumped).
   */
  get(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) {
      this.missCount += 1;
      return null;
    }
    if (Date.now() >= entry.expiresAt) {
      // Stale: drop the entry and treat as a miss for the caller.
      this.store.delete(key);
      this.staleCount += 1;
      this.missCount += 1;
      return null;
    }
    this.hitCount += 1;
    return entry.value;
  }

  /**
   * Stale-tolerant read. Returns the value (if present) plus a `stale` flag.
   * Counter still increments hit/miss/stale as if we were doing a strict get.
   */
  getStale(key: string): { value: T; stale: boolean } | null {
    const entry = this.store.get(key);
    if (!entry) {
      this.missCount += 1;
      return null;
    }
    const stale = Date.now() >= entry.expiresAt;
    if (stale) {
      this.staleCount += 1;
    } else {
      this.hitCount += 1;
    }
    return { value: entry.value, stale };
  }

  /**
   * Insert / replace a value with optional per-entry TTL. When the cache is
   * at `maxEntries` and `key` is new, the oldest insertion gets evicted.
   */
  set(key: string, value: T, ttlMs?: number): void {
    const expiresAt = Date.now() + (ttlMs ?? this.defaultTtlMs);
    if (!this.store.has(key) && this.store.size >= this.maxEntries) {
      // Drop oldest insertion. Map iteration is insertion-ordered.
      const firstKey = this.store.keys().next().value;
      if (firstKey !== undefined) {
        this.store.delete(firstKey);
      }
    }
    this.store.set(key, { value, expiresAt });
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }

  /** Snapshot of telemetry counters; consumed by `getCacheTelemetry()`. */
  telemetry(): { hits: number; misses: number; stales: number; size: number } {
    return {
      hits: this.hitCount,
      misses: this.missCount,
      stales: this.staleCount,
      size: this.store.size,
    };
  }

  /** Reset counters (used in tests; production never calls this). */
  resetCounters(): void {
    this.hitCount = 0;
    this.missCount = 0;
    this.staleCount = 0;
  }
}
