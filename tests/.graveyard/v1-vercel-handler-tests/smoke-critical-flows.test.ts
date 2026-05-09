/**
 * Smoke Tests: Critical User Flows (US-030)
 *
 * Covers the 5 most critical user paths via MSW-mocked API calls:
 *   1. Auth flow — signup, login, token refresh, logout
 *   2. Portfolio CRUD — create, add position, update position, delete position
 *   3. Factor calculation — request factors for known symbols, verify structure
 *   4. CVRF episode — start episode, record decision, close episode
 *   5. Earnings endpoint — fetch forecast, verify required fields
 */

import { describe, it, expect } from 'vitest';

const API_BASE = process.env.TEST_API_URL || 'http://localhost:3000';
const VALID_TOKEN = 'mock-valid-token';

function authHeaders(token: string = VALID_TOKEN) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

// ============================================================================
// 1. AUTH FLOW
// ============================================================================

describe('Auth Flow', () => {
  it('signup returns success with user data for valid input', async () => {
    const res = await fetch(`${API_BASE}/api/v1/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'newuser@example.com',
        password: 'securePassword123',
        name: 'New User',
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('user');
    expect(body.data.user).toHaveProperty('id');
    expect(body.data.user).toHaveProperty('email');
    expect(body.data).toHaveProperty('confirmationRequired');
  });

  it('signup rejects missing email with validation error', async () => {
    const res = await fetch(`${API_BASE}/api/v1/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'password123' }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toHaveProperty('code');
    expect(body.error).toHaveProperty('message');
  });

  it('login returns error response shape for invalid credentials', async () => {
    const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'wrongPassword',
      }),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toHaveProperty('code');
    expect(body.error).toHaveProperty('message');
  });

  it('token refresh returns error for invalid refresh token', async () => {
    const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: 'expired-or-invalid-token' }),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_TOKEN');
  });

  it('logout succeeds with valid token', async () => {
    const res = await fetch(`${API_BASE}/api/v1/auth/logout`, {
      method: 'POST',
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('loggedOut', true);
  });

  it('logout returns 401 without token', async () => {
    const res = await fetch(`${API_BASE}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});

// ============================================================================
// 2. PORTFOLIO CRUD
// ============================================================================

describe('Portfolio CRUD', () => {
  it('GET /portfolio returns portfolio with expected shape', async () => {
    const res = await fetch(`${API_BASE}/api/v1/portfolio`, {
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('positions');
    expect(body.data).toHaveProperty('cash');
    expect(body.data).toHaveProperty('totalValue');
    expect(body.data).toHaveProperty('currency', 'USD');
    expect(Array.isArray(body.data.positions)).toBe(true);
  });

  it('POST /portfolio/positions creates a new position', async () => {
    const res = await fetch(`${API_BASE}/api/v1/portfolio/positions`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        symbol: 'NVDA',
        shares: 25,
        avgCost: 875.30,
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('id');
    expect(body.data).toHaveProperty('symbol');
    expect(body.data).toHaveProperty('shares');
    expect(body.data).toHaveProperty('costBasis');
  });

  it('PUT /portfolio/positions/:id updates a position', async () => {
    const res = await fetch(`${API_BASE}/api/v1/portfolio/positions/pos-1`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({
        shares: 75,
        avgCost: 190.0,
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('id', 'pos-1');
    expect(body.data).toHaveProperty('shares');
    expect(body.data).toHaveProperty('costBasis');
  });

  it('DELETE /portfolio/positions/:id removes a position', async () => {
    const res = await fetch(`${API_BASE}/api/v1/portfolio/positions/pos-2`, {
      method: 'DELETE',
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('deleted', true);
  });

  it('portfolio endpoints require authentication', async () => {
    const res = await fetch(`${API_BASE}/api/v1/portfolio`, {
      headers: { 'Content-Type': 'application/json' },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });
});

// ============================================================================
// 3. FACTOR CALCULATION
// ============================================================================

describe('Factor Calculation', () => {
  it('returns factor exposures for a single symbol', async () => {
    const res = await fetch(`${API_BASE}/api/v1/portfolio/factors/AAPL`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body).toHaveProperty('dataSource');
    expect(['mock', 'live']).toContain(body.dataSource);
    expect(body.data).toHaveProperty('AAPL');
    expect(Array.isArray(body.data.AAPL)).toBe(true);

    // Each factor exposure has the required fields
    for (const exposure of body.data.AAPL) {
      expect(exposure).toHaveProperty('factor');
      expect(exposure).toHaveProperty('exposure');
      expect(exposure).toHaveProperty('confidence');
      expect(typeof exposure.factor).toBe('string');
      expect(typeof exposure.exposure).toBe('number');
      expect(typeof exposure.confidence).toBe('number');
    }
  });

  it('returns factor exposures for multiple symbols', async () => {
    const res = await fetch(`${API_BASE}/api/v1/portfolio/factors/AAPL,MSFT,GOOGL`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Should have data for all requested symbols
    expect(body.data).toHaveProperty('AAPL');
    expect(body.data).toHaveProperty('MSFT');
    expect(body.data).toHaveProperty('GOOGL');
  });

  it('includes X-Data-Source header', async () => {
    const res = await fetch(`${API_BASE}/api/v1/portfolio/factors/AAPL`);

    expect(res.status).toBe(200);
    const header = res.headers.get('X-Data-Source');
    expect(header).toBeDefined();
    expect(['mock', 'live']).toContain(header);
  });
});

// ============================================================================
// 4. CVRF EPISODE LIFECYCLE
// ============================================================================

describe('CVRF Episode Lifecycle', () => {
  it('starts a new episode', async () => {
    const res = await fetch(`${API_BASE}/api/v1/cvrf/episode/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('id');
    expect(body.data).toHaveProperty('episodeNumber');
    expect(body.data).toHaveProperty('startDate');
    expect(body.data).toHaveProperty('message');
    expect(typeof body.data.id).toBe('string');
    expect(typeof body.data.episodeNumber).toBe('number');
  });

  it('records a trading decision', async () => {
    const res = await fetch(`${API_BASE}/api/v1/cvrf/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol: 'AAPL',
        action: 'buy',
        weightBefore: 0.1,
        weightAfter: 0.15,
        reason: 'Strong momentum signal',
        confidence: 0.8,
        factors: ['momentum_12m', 'market'],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('id');
    expect(body.data).toHaveProperty('symbol', 'AAPL');
    expect(body.data).toHaveProperty('action', 'buy');
    expect(body.data).toHaveProperty('confidence');
    expect(body.data).toHaveProperty('factors');
  });

  it('closes an episode with CVRF results', async () => {
    const res = await fetch(`${API_BASE}/api/v1/cvrf/episode/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runCvrfCycle: true }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('episode');
    expect(body.data).toHaveProperty('cvrfResult');

    // Episode shape
    const ep = body.data.episode;
    expect(ep).toHaveProperty('id');
    expect(ep).toHaveProperty('episodeNumber');
    expect(ep).toHaveProperty('startDate');
    expect(ep).toHaveProperty('endDate');
    expect(ep).toHaveProperty('decisionsCount');

    // CVRF result shape
    const cvrf = body.data.cvrfResult;
    expect(cvrf).toHaveProperty('performanceDelta');
    expect(cvrf).toHaveProperty('decisionOverlap');
    expect(cvrf).toHaveProperty('insightsExtracted');
    expect(cvrf).toHaveProperty('beliefUpdates');
    expect(cvrf).toHaveProperty('newRegime');
  });

  it('rejects decision with missing required fields', async () => {
    const res = await fetch(`${API_BASE}/api/v1/cvrf/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: 'AAPL' }), // missing action
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toHaveProperty('code');
  });
});

// ============================================================================
// 5. EARNINGS ENDPOINT
// ============================================================================

describe('Earnings Endpoint', () => {
  it('returns forecast for a known symbol with required fields', async () => {
    const res = await fetch(`${API_BASE}/api/v1/earnings/forecast/AAPL`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body).toHaveProperty('dataSource');
    expect(['mock', 'live']).toContain(body.dataSource);

    // Required forecast fields
    const forecast = body.data;
    expect(forecast).toHaveProperty('symbol');
    expect(forecast).toHaveProperty('expectedMove');
    expect(forecast).toHaveProperty('confidence');
    expect(forecast).toHaveProperty('direction');
    expect(typeof forecast.expectedMove).toBe('number');
    expect(typeof forecast.confidence).toBe('number');
  });

  it('returns forecast for different symbols', async () => {
    const symbols = ['NVDA', 'MSFT', 'GOOGL'];

    for (const symbol of symbols) {
      const res = await fetch(`${API_BASE}/api/v1/earnings/forecast/${symbol}`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('symbol');
    }
  });

  it('includes meta with timestamp', async () => {
    const res = await fetch(`${API_BASE}/api/v1/earnings/forecast/AAPL`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('meta');
    expect(body.meta).toHaveProperty('timestamp');
    expect(body.meta).toHaveProperty('requestId');
  });
});
