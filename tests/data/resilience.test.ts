/**
 * Unit tests for the upstream resilience primitives (harden/data-provider-cdf).
 * Pure logic — no network, no MSW. Timers/clock/jitter are all injected so the
 * tests are deterministic and instant.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchWithRetry,
  backoffDelay,
  isRetryableStatus,
  CircuitBreaker,
  getBreaker,
  resetBreakers,
} from '../../src/data/resilience.js';

describe('isRetryableStatus', () => {
  it('retries 429 and 5xx', () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
  });

  it('does NOT retry 4xx that is not 429', () => {
    expect(isRetryableStatus(400)).toBe(false);
    expect(isRetryableStatus(401)).toBe(false);
    expect(isRetryableStatus(403)).toBe(false);
    expect(isRetryableStatus(404)).toBe(false);
  });

  it('does not retry 2xx', () => {
    expect(isRetryableStatus(200)).toBe(false);
  });
});

describe('backoffDelay', () => {
  it('grows exponentially and is capped', () => {
    // random()~=1 => the full ceiling (floor of base*2^(n-1), capped at max)
    const r = () => 0.999999;
    expect(backoffDelay(1, 100, 10000, r)).toBe(99); // ~100*2^0
    expect(backoffDelay(2, 100, 10000, r)).toBe(199); // ~100*2^1
    expect(backoffDelay(3, 100, 10000, r)).toBe(399); // ~100*2^2
    expect(backoffDelay(10, 100, 500, r)).toBe(499); // capped at 500
  });

  it('full jitter: random()=0 yields 0 delay', () => {
    expect(backoffDelay(5, 100, 10000, () => 0)).toBe(0);
  });
});

describe('fetchWithRetry', () => {
  const noSleep = () => Promise.resolve();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns immediately on a 200 (no retry)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await fetchWithRetry('https://x.test', undefined, { sleep: noSleep });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a 429 then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('rl', { status: 429 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await fetchWithRetry('https://x.test', undefined, { retries: 3, sleep: noSleep });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('exhausts retries and returns the last non-OK response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('rl', { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await fetchWithRetry('https://x.test', undefined, { retries: 3, sleep: noSleep });
    expect(res.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(3); // 1 + 2 retries
  });

  it('does NOT retry a 401 (returns it on the first call)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('nope', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await fetchWithRetry('https://x.test', undefined, { retries: 3, sleep: noSleep });
    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a thrown network error then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await fetchWithRetry('https://x.test', undefined, { retries: 3, sleep: noSleep });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws the last error when every attempt throws', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('down'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchWithRetry('https://x.test', undefined, { retries: 2, sleep: noSleep }),
    ).rejects.toThrow('down');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('CircuitBreaker', () => {
  it('stays closed and allows attempts below the failure threshold', () => {
    const b = new CircuitBreaker({ failureThreshold: 3 });
    b.recordFailure();
    b.recordFailure();
    expect(b.canAttempt()).toBe(true);
    expect(b.getState()).toBe('closed');
  });

  it('opens after the failure threshold and blocks attempts', () => {
    const b = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1000 });
    b.recordFailure();
    b.recordFailure();
    b.recordFailure();
    expect(b.getState()).toBe('open');
    expect(b.canAttempt()).toBe(false);
  });

  it('half-opens after cooldown and allows a single probe', () => {
    let t = 1000;
    const b = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 500, now: () => t });
    b.recordFailure(); // opens at t=1000
    expect(b.canAttempt()).toBe(false);
    t = 1600; // cooldown elapsed
    expect(b.canAttempt()).toBe(true);
    expect(b.getState()).toBe('half_open');
  });

  it('closes on success after a half-open probe', () => {
    let t = 0;
    const b = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 100, now: () => t });
    b.recordFailure();
    t = 200;
    b.canAttempt(); // → half_open
    b.recordSuccess();
    expect(b.getState()).toBe('closed');
    expect(b.canAttempt()).toBe(true);
  });

  it('re-opens if the half-open probe fails', () => {
    let t = 0;
    const b = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 100, now: () => t });
    b.recordFailure();
    t = 200;
    b.canAttempt(); // → half_open
    b.recordFailure(); // probe failed → re-open
    expect(b.getState()).toBe('open');
    expect(b.canAttempt()).toBe(false); // still within the new cooldown
  });

  it('a success resets the consecutive-failure count', () => {
    const b = new CircuitBreaker({ failureThreshold: 3 });
    b.recordFailure();
    b.recordFailure();
    b.recordSuccess();
    b.recordFailure();
    b.recordFailure();
    expect(b.getState()).toBe('closed'); // only 2 in a row since the success
  });
});

describe('getBreaker registry', () => {
  beforeEach(() => resetBreakers());

  it('returns the same instance for a provider name', () => {
    const a = getBreaker('polygon');
    const b = getBreaker('polygon');
    expect(a).toBe(b);
  });

  it('resetBreakers clears shared state', () => {
    const a = getBreaker('polygon');
    resetBreakers();
    const b = getBreaker('polygon');
    expect(a).not.toBe(b);
  });
});
