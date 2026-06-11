/**
 * Tests for the ?demo=true entry latch (IDEA-FF-6).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { detectDemoMode, clearDemoMode } from './demoMode';

beforeEach(() => {
  sessionStorage.clear();
});

describe('detectDemoMode', () => {
  it('is off by default', () => {
    expect(detectDemoMode('')).toBe(false);
  });

  it('activates from the URL param and latches into sessionStorage', () => {
    expect(detectDemoMode('?demo=true')).toBe(true);
    // Subsequent navigations without the param stay in demo mode.
    expect(detectDemoMode('')).toBe(true);
  });

  it('ignores other values of the param', () => {
    expect(detectDemoMode('?demo=1')).toBe(false);
    expect(detectDemoMode('?demo=false')).toBe(false);
  });

  it('clearDemoMode drops the latch', () => {
    detectDemoMode('?demo=true');
    clearDemoMode();
    expect(detectDemoMode('')).toBe(false);
  });
});
