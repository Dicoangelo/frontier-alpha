/**
 * Upstream resilience primitives (harden/data-provider-cdf).
 *
 * Two small, dependency-free building blocks the MarketDataProvider layers
 * over its per-provider fetch calls:
 *
 *   1. `fetchWithRetry` — wraps a single HTTP call with bounded retry +
 *      exponential backoff and full jitter. Retries only *transient* failures
 *      (network throw, HTTP 429, HTTP 5xx). A 4xx that isn't 429 is returned
 *      as-is: retrying a 401/403/404 burns time and never succeeds (mirrors
 *      the `quota_free` guidance in QuotaClassifier — "fix the request").
 *
 *   2. `CircuitBreaker` — per-provider fast-fail. After `failureThreshold`
 *      consecutive failures the breaker OPENS and `canAttempt()` returns false
 *      for `cooldownMs`, so a hot 429 storm or a down provider stops getting
 *      hammered on every request and the orchestrator skips straight to the
 *      next provider. After the cooldown it goes HALF_OPEN and allows a single
 *      probe; success closes it, failure re-opens it for another cooldown.
 *
 * Both are intentionally synchronous-state / in-memory (same posture as
 * QuotaClassifier's counters): reset on process restart, no external store.
 */

export interface RetryOptions {
  /** Max attempts total (including the first). Default 3 (1 try + 2 retries). */
  retries?: number;
  /** Base backoff in ms before the first retry. Default 200ms. */
  baseDelayMs?: number;
  /** Cap on any single backoff wait. Default 3000ms. */
  maxDelayMs?: number;
  /** Injectable sleeper (tests pass a no-op / fake timer). */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable jitter source in [0,1). Default Math.random. */
  random?: () => number;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

/** True for statuses worth retrying against the SAME provider. */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Fetch with bounded retry + exponential backoff + full jitter.
 *
 * Retries on a thrown network error or a retryable status (429 / 5xx). Returns
 * the final `Response` (which may still be non-OK if retries are exhausted) so
 * the caller keeps its existing `response.ok` / status-classification logic.
 * Re-throws the last network error only if every attempt threw.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit | undefined,
  opts: RetryOptions = {},
): Promise<Response> {
  const retries = Math.max(1, opts.retries ?? 3);
  const baseDelayMs = opts.baseDelayMs ?? 200;
  const maxDelayMs = opts.maxDelayMs ?? 3000;
  const sleep = opts.sleep ?? defaultSleep;
  const random = opts.random ?? Math.random;

  let lastError: unknown;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, init);
      if (attempt < retries && isRetryableStatus(response.status)) {
        await sleep(backoffDelay(attempt, baseDelayMs, maxDelayMs, random));
        continue;
      }
      return response;
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await sleep(backoffDelay(attempt, baseDelayMs, maxDelayMs, random));
        continue;
      }
    }
  }

  // Every attempt threw a network error — surface the last one.
  throw lastError;
}

/**
 * Exponential backoff with full jitter: random in [0, min(cap, base*2^(n-1))].
 * Full jitter (vs equal jitter) is the AWS-recommended default for spreading
 * retry storms; it minimizes contention when many callers back off together.
 */
export function backoffDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  random: () => number = Math.random,
): number {
  const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
  return Math.floor(random() * exp);
}

export type BreakerState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerOptions {
  /** Consecutive failures before the breaker opens. Default 5. */
  failureThreshold?: number;
  /** How long the breaker stays open before a half-open probe. Default 30s. */
  cooldownMs?: number;
  /** Injectable clock (tests). Default Date.now. */
  now?: () => number;
}

/**
 * Per-provider circuit breaker. Not generic over keys — construct one per
 * provider and hold them in a registry (see `getBreaker`).
 */
export class CircuitBreaker {
  private failures = 0;
  private state: BreakerState = 'closed';
  private openedAt = 0;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly now: () => number;

  constructor(opts: CircuitBreakerOptions = {}) {
    this.failureThreshold = opts.failureThreshold ?? 5;
    this.cooldownMs = opts.cooldownMs ?? 30_000;
    this.now = opts.now ?? Date.now;
  }

  /**
   * Whether the caller should attempt the provider. Transitions open→half_open
   * once the cooldown elapses (allowing exactly one probe through).
   */
  canAttempt(): boolean {
    if (this.state === 'open') {
      if (this.now() - this.openedAt >= this.cooldownMs) {
        this.state = 'half_open';
        return true;
      }
      return false;
    }
    // closed or half_open both allow an attempt (half_open = single probe).
    return true;
  }

  recordSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  recordFailure(): void {
    // A failure while probing (half_open) re-opens immediately.
    if (this.state === 'half_open') {
      this.trip();
      return;
    }
    this.failures += 1;
    if (this.failures >= this.failureThreshold) {
      this.trip();
    }
  }

  private trip(): void {
    this.state = 'open';
    this.openedAt = this.now();
    this.failures = this.failureThreshold;
  }

  getState(): BreakerState {
    return this.state;
  }

  reset(): void {
    this.failures = 0;
    this.state = 'closed';
    this.openedAt = 0;
  }
}

/**
 * Process-wide breaker registry keyed by provider name. Kept module-level so
 * every MarketDataProvider instance shares breaker state for a given provider
 * (the rate limit / outage is upstream, not per-instance). Tests can reset via
 * `resetBreakers()`.
 */
const breakers = new Map<string, CircuitBreaker>();

export function getBreaker(
  provider: string,
  opts?: CircuitBreakerOptions,
): CircuitBreaker {
  let b = breakers.get(provider);
  if (!b) {
    b = new CircuitBreaker(opts);
    breakers.set(provider, b);
  }
  return b;
}

export function resetBreakers(): void {
  breakers.clear();
}
