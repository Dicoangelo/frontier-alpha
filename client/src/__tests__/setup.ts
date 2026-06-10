/**
 * Vitest Test Setup for Client
 *
 * Global configuration for React component and hook tests.
 */

import '@testing-library/jest-dom';
import { beforeAll, afterEach, vi } from 'vitest';

// Mock window.matchMedia for useIsMobile hook
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(), // deprecated
      removeListener: vi.fn(), // deprecated
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  // Mock navigator.onLine
  Object.defineProperty(navigator, 'onLine', {
    writable: true,
    value: true,
  });

  // import.meta.env values live in vitest.config.ts `test.env` —
  // vi.stubGlobal('import', ...) cannot intercept import.meta and was a no-op.
});

// Reset mocks after each test
afterEach(() => {
  vi.clearAllMocks();
});
