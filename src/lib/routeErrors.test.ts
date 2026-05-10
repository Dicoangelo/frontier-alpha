/**
 * Tests for `internalError()` route error helper. Shipped in v1.3.10
 * Phase A4 to surface real error messages instead of generic
 * "An unexpected error occurred." copy. The helper itself is small but
 * any change to its output shape silently breaks every route that uses
 * it — these tests pin the contract.
 */

import { describe, it, expect } from 'vitest';
import { internalError } from './routeErrors.js';

describe('internalError', () => {
  it('preserves the Error message with the domain prefix', () => {
    const result = internalError(new Error('Polygon rate limit'), 'Optimization');
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('INTERNAL_ERROR');
    expect(result.error.message).toBe('Optimization failed: Polygon rate limit');
  });

  it('uses the bare domain fallback when error is not an Error instance', () => {
    const result = internalError('plain string', 'Risk calculation');
    expect(result.error.message).toBe('Risk calculation failed');
  });

  it('uses the bare domain fallback when error is null', () => {
    const result = internalError(null, 'Trade explanation');
    expect(result.error.message).toBe('Trade explanation failed');
  });

  it('uses the bare domain fallback when error is undefined', () => {
    const result = internalError(undefined, 'Factor calculation');
    expect(result.error.message).toBe('Factor calculation failed');
  });

  it('uses the bare domain fallback when error message is empty string', () => {
    const result = internalError(new Error(''), 'Backtest');
    // Empty string is falsy, so realMessage stays null
    expect(result.error.message).toBe('Backtest failed');
  });

  it('handles an Error subclass with custom name + message', () => {
    class RateLimitError extends Error {
      constructor() {
        super('exceeded 5 req/min');
        this.name = 'RateLimitError';
      }
    }
    const result = internalError(new RateLimitError(), 'Quote fetch');
    expect(result.error.message).toBe('Quote fetch failed: exceeded 5 req/min');
  });

  it('returns the canonical APIResponse error shape', () => {
    const result = internalError(new Error('boom'), 'Test');
    expect(result).toEqual({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Test failed: boom',
      },
    });
    // No extra fields — the body is exactly { success, error: { code, message } }
    expect(Object.keys(result)).toEqual(['success', 'error']);
    expect(Object.keys(result.error)).toEqual(['code', 'message']);
  });

  it('preserves long error messages without truncation', () => {
    const longMessage = 'a'.repeat(5000);
    const result = internalError(new Error(longMessage), 'Ledger');
    expect(result.error.message).toContain(longMessage);
  });

  it('does not include stack traces in the response body', () => {
    const err = new Error('with stack');
    expect(err.stack).toBeDefined();
    const result = internalError(err, 'Surface');
    expect(JSON.stringify(result)).not.toContain('at Object.');
    expect(JSON.stringify(result)).not.toMatch(/\.test\.ts/);
  });

  it('handles error objects with non-string message field defensively', () => {
    const weirdError = Object.assign(new Error(), { message: 123 as unknown as string });
    const result = internalError(weirdError, 'Cleanup');
    // The instanceof Error check passes; .message is the typed-as-string
    // numeric. The string concatenation still produces a sensible result
    // because JS coerces. Pin this so a future "tighten the type" change
    // is intentional.
    expect(result.error.message).toContain('Cleanup failed');
  });
});
