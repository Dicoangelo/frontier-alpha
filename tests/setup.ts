/**
 * Vitest Test Setup
 * Global configuration for E2E tests with MSW (Mock Service Worker)
 */

import { beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { handlers } from './setup/msw-handlers.js';

// ============================================================================
// MSW Server
// ============================================================================

export const server = setupServer(...handlers);

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'warn' });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

// ============================================================================
// Global test utilities
// ============================================================================

export const API_BASE = process.env.TEST_API_URL || 'http://localhost:3000';

export async function getAuthToken(): Promise<string> {
  // In mock mode, return a token that MSW recognizes as valid
  return 'mock-valid-token';
}

export function authHeaders(token: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

// Test data helpers
export const TEST_SYMBOLS = ['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'AMZN'];

export function randomSymbol(): string {
  return TEST_SYMBOLS[Math.floor(Math.random() * TEST_SYMBOLS.length)];
}

export function randomPosition() {
  return {
    symbol: randomSymbol(),
    shares: Math.floor(Math.random() * 100) + 10,
    costBasis: Math.random() * 500 + 100,
  };
}

// Performance measurement
export class PerformanceTimer {
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  elapsed(): number {
    return Date.now() - this.startTime;
  }

  assertUnder(ms: number, description: string): void {
    const elapsed = this.elapsed();
    if (elapsed > ms) {
      throw new Error(
        `Performance assertion failed: ${description} took ${elapsed}ms (expected < ${ms}ms)`
      );
    }
  }
}

/**
 * Standard status codes for endpoints that depend on external APIs (Polygon, Alpha Vantage, etc.)
 * 200 = success
 * 404 = endpoint not deployed
 * 500 = external API error (rate limit, auth, etc.)
 * 503 = service unavailable
 */
export const EXTERNAL_API_STATUSES = [200, 404, 500, 503];

/**
 * Check if status indicates external API is unavailable (not a test failure)
 */
export function isExternalApiError(status: number): boolean {
  return status === 500 || status === 503;
}
