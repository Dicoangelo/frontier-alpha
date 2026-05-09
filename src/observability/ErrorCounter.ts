/**
 * Process-level error counter (US-008).
 *
 * Counts Fastify `onError` events per route URL pattern, holds a rolling
 * snapshot for the last hour, and resets via an interval timer. The counter
 * is the in-process source of truth for `/api/v1/health/errors` and the
 * weekly health digest cron.
 *
 * Design choices:
 *   - Map keyed by `${method} ${routeUrlPattern}` so `/api/v1/portfolio` and
 *     `/api/v1/portfolio/factors/:symbols` are distinct buckets.
 *   - Counters reset every `RESET_INTERVAL_MS` (1 hour) on a process-wide
 *     timer. The reset wipes the Map; lastError / lastSeen come back via
 *     the next observed error.
 *   - `getSummary()` returns a flat array sorted by count desc so the
 *     observer endpoint and digest can render straight from it.
 *   - Sentry integration is owned by the client (`client/src/lib/sentry.ts`)
 *     and the optional server SDK call site. The counter does not
 *     forward events to Sentry directly: that decoupling keeps the unit
 *     trivially testable and lets Sentry stay opt-in.
 *
 * Cross-process scope: this is per Node process. Vercel serverless functions
 * are short-lived so the counter resets on cold-start; long-running Railway
 * workers retain it for the configured window. Both expose the same shape
 * via the endpoint, and the digest cron (Vercel) hits its own counter on
 * Vercel side; for richer cross-process aggregation we would need to
 * persist into Supabase, which is deferred to v1.4.
 */

export interface ErrorRecord {
  /** Method + route pattern, e.g. `GET /api/v1/portfolio`. */
  route: string;
  /** Number of errors observed since the last reset. */
  count: number;
  /** Last error message (truncated to keep responses small). */
  lastError: string;
  /** ISO timestamp of the most recent error. */
  lastSeen: string;
}

const MAX_LAST_ERROR_LEN = 500;
const DEFAULT_RESET_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

class ErrorCounterImpl {
  private map = new Map<string, ErrorRecord>();
  private intervalHandle: NodeJS.Timeout | null = null;
  private intervalMs: number;

  constructor(intervalMs: number = DEFAULT_RESET_INTERVAL_MS) {
    this.intervalMs = intervalMs;
  }

  /**
   * Start the reset interval. Idempotent: subsequent calls are no-ops so
   * test code can call this safely from multiple Fastify boots.
   */
  start(): void {
    if (this.intervalHandle) return;
    this.intervalHandle = setInterval(() => this.reset(), this.intervalMs);
    // unref() so the timer does not keep the process alive in tests.
    if (typeof this.intervalHandle.unref === 'function') {
      this.intervalHandle.unref();
    }
  }

  /** Stop the reset interval (used by tests; production never calls this). */
  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  /**
   * Increment the counter for a given route + method pair. Records the
   * latest error message and timestamp on every hit.
   */
  increment(method: string, routeUrl: string, error: unknown): void {
    const key = `${method} ${routeUrl}`;
    const message = ErrorCounterImpl.stringifyError(error);
    const existing = this.map.get(key);
    if (existing) {
      existing.count += 1;
      existing.lastError = message;
      existing.lastSeen = new Date().toISOString();
    } else {
      this.map.set(key, {
        route: key,
        count: 1,
        lastError: message,
        lastSeen: new Date().toISOString(),
      });
    }
  }

  /** Snapshot of all routes that have errored since the last reset. */
  getSummary(): ErrorRecord[] {
    return [...this.map.values()].sort((a, b) => b.count - a.count);
  }

  /** Total errors counted across all routes (used by digest). */
  getTotal(): number {
    let total = 0;
    for (const r of this.map.values()) total += r.count;
    return total;
  }

  /** Clear all counters. Called by the interval timer and by tests. */
  reset(): void {
    this.map.clear();
  }

  private static stringifyError(error: unknown): string {
    let raw: string;
    if (error instanceof Error) {
      raw = error.message || error.name || 'Error';
    } else if (typeof error === 'string') {
      raw = error;
    } else {
      try {
        // JSON.stringify(undefined) returns undefined (not a string), so coerce.
        raw = JSON.stringify(error) ?? String(error);
      } catch {
        raw = String(error);
      }
    }
    if (raw.length > MAX_LAST_ERROR_LEN) {
      return raw.slice(0, MAX_LAST_ERROR_LEN) + '…';
    }
    return raw;
  }
}

/**
 * Singleton instance. Importing modules read this directly. Tests can call
 * `errorCounter.reset()` between cases to isolate state.
 */
export const errorCounter = new ErrorCounterImpl();

// Export the class for tests that want their own isolated instance.
export { ErrorCounterImpl };
