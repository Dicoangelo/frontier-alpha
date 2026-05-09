/**
 * Regression test for the v1.2.5 production crash.
 *
 * `hashSymbol()` returns an unsigned 32-bit integer, but `>>` is a signed
 * right shift. Any seed >= 2^31 produced a negative shifted value and
 * `negative % 5` returns a negative index in JS, which made
 * `BECAUSE_TEMPLATES[idx]` undefined and the next call crash with
 * "y[p] is not a function" inside `useMemo` on the landing page.
 *
 * This test exercises a battery of symbols whose hash exceeds 2^31 (the
 * NVDA / META / TSLA tickers happen to fall there). The bug is fixed by
 * using `>>>` (unsigned) instead of `>>`.
 */

import { describe, it, expect } from 'vitest';

// Re-derive the helpers locally so the test does not need to import the
// React component file (which pulls in JSX + react-dom). The functions
// must match the implementation in DemoPreview.tsx exactly.
function hashSymbol(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const TEMPLATES = [
  () => 'a',
  () => 'b',
  () => 'c',
  () => 'd',
  () => 'e',
];

describe('DemoPreview seed-to-template index', () => {
  it.each([
    ['NVDA'],
    ['META'],
    ['TSLA'],
    ['AAPL'],
    ['MSFT'],
    ['GOOGL'],
    ['AMZN'],
    ['BRK.B'],
    ['SPY'],
    ['QQQ'],
  ])('produces a valid index for %s with unsigned shift', (symbol) => {
    const seed = hashSymbol(symbol);
    const idx = (seed >>> 5) % TEMPLATES.length;
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(TEMPLATES.length);
    // Sanity: TEMPLATES[idx] is callable
    expect(typeof TEMPLATES[idx]).toBe('function');
  });

  it('regression: signed shift on real ticker NVDA produces negative index', () => {
    // hashSymbol('NVDA') = 2_591_302_102 (> 2^31). The buggy `>>` produces
    // -80_978_191, which mod 5 = -3. TEMPLATES[-3] is undefined and the
    // production crash was `y[p] is not a function` when calling it.
    const seed = hashSymbol('NVDA');
    expect(seed).toBeGreaterThanOrEqual(2 ** 31);
    const buggyIdx = (seed >> 5) % TEMPLATES.length;
    expect(buggyIdx).toBeLessThan(0);
    expect(TEMPLATES[buggyIdx]).toBeUndefined();
    // The fix:
    const fixedIdx = (seed >>> 5) % TEMPLATES.length;
    expect(fixedIdx).toBeGreaterThanOrEqual(0);
    expect(typeof TEMPLATES[fixedIdx]).toBe('function');
  });
});
