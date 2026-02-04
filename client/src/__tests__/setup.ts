/**
 * Vitest Test Setup for Client
 *
 * Global configuration for React component and hook tests.
 */

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

  // Mock import.meta.env
  vi.stubGlobal('import', {
    meta: {
      env: {
        VITE_API_URL: 'http://localhost:3000',
        VITE_SUPABASE_URL: 'http://localhost:54321',
        VITE_SUPABASE_ANON_KEY: 'test-key',
      },
    },
  });
});

// Reset mocks after each test
afterEach(() => {
  vi.clearAllMocks();
});
