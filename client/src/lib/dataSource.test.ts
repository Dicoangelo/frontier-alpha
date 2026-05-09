/**
 * Tests for DataSource<T> contract (US-002, P1)
 *
 * The contract is small — these tests lock the discriminator/helpers so
 * future refactors can't quietly break the type-level invariant that
 * "raw demo number leaking through" should be a TS error.
 */

import { describe, it, expect } from 'vitest';
import {
  EMPTY,
  isDemo,
  isEmpty,
  isReal,
  unwrapOrEmpty,
  unwrapOrUndefined,
  wrapDemo,
  wrapReal,
  type DataSource,
} from './dataSource';

describe('dataSource', () => {
  it('wrapReal produces a real-tagged DataSource', () => {
    const ds = wrapReal({ x: 1 });
    expect(ds.kind).toBe('real');
    expect(isReal(ds)).toBe(true);
    expect(isDemo(ds)).toBe(false);
    expect(isEmpty(ds)).toBe(false);
    if (isReal(ds)) {
      expect(ds.value).toEqual({ x: 1 });
    }
  });

  it('wrapDemo produces a demo-tagged DataSource', () => {
    const ds = wrapDemo({ x: 1 });
    expect(ds.kind).toBe('demo');
    expect(isReal(ds)).toBe(false);
    expect(isDemo(ds)).toBe(true);
    expect(isEmpty(ds)).toBe(false);
  });

  it('EMPTY is reusable and discriminated', () => {
    expect(EMPTY.kind).toBe('empty');
    const ds: DataSource<number> = EMPTY;
    expect(isEmpty(ds)).toBe(true);
    expect(isReal(ds)).toBe(false);
    expect(isDemo(ds)).toBe(false);
  });

  it('unwrapOrEmpty falls back to the placeholder for empty', () => {
    expect(unwrapOrEmpty(EMPTY as DataSource<number>, 0)).toBe(0);
    expect(unwrapOrEmpty(wrapReal(42), 0)).toBe(42);
    expect(unwrapOrEmpty(wrapDemo(7), 0)).toBe(7);
  });

  it('unwrapOrUndefined returns undefined for empty, value otherwise', () => {
    expect(unwrapOrUndefined(EMPTY as DataSource<number>)).toBeUndefined();
    expect(unwrapOrUndefined(wrapReal(42))).toBe(42);
    expect(unwrapOrUndefined(wrapDemo(7))).toBe(7);
  });
});
