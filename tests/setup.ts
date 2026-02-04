/**
 * Vitest Test Setup
 * Global configuration for E2E tests
 */

import { beforeAll, afterAll } from 'vitest';

// Environment validation
beforeAll(() => {
  const requiredEnvVars = ['TEST_API_URL'];
  const missing = requiredEnvVars.filter((v) => !process.env[v]);

  if (missing.length > 0 && process.env.CI) {
    console.warn(`Missing environment variables: ${missing.join(', ')}`);
    console.warn('Using default localhost URL');
  }
});

// Cleanup
afterAll(() => {
  // Any global cleanup
});

// Global test utilities
export const API_BASE = process.env.TEST_API_URL || 'http://localhost:3000';

export async function getAuthToken(): Promise<string> {
  const response = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.TEST_USER_EMAIL || 'test@example.com',
      password: process.env.TEST_USER_PASSWORD || 'TestPassword123!',
    }),
  });
  const data = await response.json();
  return data.data?.accessToken || 'mock-token';
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
