/**
 * Unit test: ErrorCounter (US-008).
 *
 * Locks in the contract for `src/observability/ErrorCounter.ts`:
 *   - Increment buckets by `${method} ${route}` and accumulates count
 *   - getSummary returns records sorted by count desc
 *   - reset() clears all state
 *   - Long error messages truncate
 *   - Non-Error inputs (string, object, undefined) stringify safely
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ErrorCounterImpl } from '../../src/observability/ErrorCounter';

describe('ErrorCounter — process-level error aggregation', () => {
  let counter: ErrorCounterImpl;

  beforeEach(() => {
    counter = new ErrorCounterImpl();
  });

  it('increments per-route buckets and accumulates counts', () => {
    counter.increment('GET', '/api/v1/portfolio', new Error('boom'));
    counter.increment('GET', '/api/v1/portfolio', new Error('boom again'));
    counter.increment('POST', '/api/v1/portfolio', new Error('different'));

    const summary = counter.getSummary();
    expect(summary).toHaveLength(2);

    const portfolioGet = summary.find((r) => r.route === 'GET /api/v1/portfolio');
    expect(portfolioGet?.count).toBe(2);
    expect(portfolioGet?.lastError).toBe('boom again');

    const portfolioPost = summary.find((r) => r.route === 'POST /api/v1/portfolio');
    expect(portfolioPost?.count).toBe(1);
    expect(portfolioPost?.lastError).toBe('different');
  });

  it('sorts getSummary by count descending', () => {
    counter.increment('GET', '/a', new Error('1'));
    counter.increment('GET', '/b', new Error('1'));
    counter.increment('GET', '/b', new Error('2'));
    counter.increment('GET', '/b', new Error('3'));
    counter.increment('GET', '/c', new Error('1'));
    counter.increment('GET', '/c', new Error('2'));

    const summary = counter.getSummary();
    expect(summary.map((r) => r.route)).toEqual([
      'GET /b',
      'GET /c',
      'GET /a',
    ]);
  });

  it('reset() clears all state', () => {
    counter.increment('GET', '/api/v1/foo', new Error('boom'));
    expect(counter.getTotal()).toBe(1);
    counter.reset();
    expect(counter.getSummary()).toEqual([]);
    expect(counter.getTotal()).toBe(0);
  });

  it('getTotal aggregates across routes', () => {
    counter.increment('GET', '/a', new Error('1'));
    counter.increment('GET', '/a', new Error('2'));
    counter.increment('POST', '/b', new Error('1'));
    expect(counter.getTotal()).toBe(3);
  });

  it('truncates pathologically long error messages', () => {
    const huge = 'x'.repeat(2000);
    counter.increment('GET', '/api/v1/foo', new Error(huge));
    const record = counter.getSummary()[0];
    expect(record.lastError.length).toBeLessThanOrEqual(501);
    expect(record.lastError.endsWith('…')).toBe(true);
  });

  it('handles non-Error inputs (string / object / undefined)', () => {
    counter.increment('GET', '/a', 'string error');
    counter.increment('GET', '/b', { code: 500, msg: 'boom' });
    counter.increment('GET', '/c', undefined);

    const summary = counter.getSummary();
    expect(summary).toHaveLength(3);
    expect(summary.find((r) => r.route === 'GET /a')?.lastError).toBe('string error');
    expect(summary.find((r) => r.route === 'GET /b')?.lastError).toContain('500');
    expect(summary.find((r) => r.route === 'GET /c')?.lastError).toBe('undefined');
  });

  it('records ISO lastSeen timestamp', () => {
    const before = new Date().toISOString();
    counter.increment('GET', '/api/v1/foo', new Error('boom'));
    const after = new Date().toISOString();
    const record = counter.getSummary()[0];
    expect(record.lastSeen >= before).toBe(true);
    expect(record.lastSeen <= after).toBe(true);
  });
});
