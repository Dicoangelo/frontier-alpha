/**
 * MSW Request Handlers
 * Mock API responses for E2E tests — no server required.
 */

import { http, HttpResponse } from 'msw';
import {
  mockQuote,
  mockFactorExposures,
  mockEarnings,
  mockEarningsHistory,
  mockEarningsForecast,
  mockHealthCheck,
  mockSignupResponse,
  mockAuthError,
  mockMeta,
} from '../fixtures/market-data.js';

const API_BASE = process.env.TEST_API_URL || 'http://localhost:3000';

// ============================================================================
// HELPERS
// ============================================================================

/** Check if request has a valid-looking auth token */
function hasAuth(request: Request): boolean {
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) return false;
  const token = auth.slice(7);
  // Only accept explicitly valid tokens
  const invalidTokens = ['invalid-token', 'bad-token', 'mock-token', ''];
  return !invalidTokens.includes(token);
}

/** Standard 401 response */
function unauthorized() {
  return HttpResponse.json(
    {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      meta: mockMeta(),
    },
    { status: 401 }
  );
}

// ============================================================================
// HANDLERS
// ============================================================================

export const handlers = [
  // ========================
  // Health
  // ========================
  http.get(`${API_BASE}/api/v1/health`, () => {
    return HttpResponse.json(mockHealthCheck(), {
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }),

  // ========================
  // Quotes
  // ========================
  http.get(`${API_BASE}/api/v1/quotes/stream`, ({ request }) => {
    const url = new URL(request.url);
    const symbolsParam = url.searchParams.get('symbols');
    if (!symbolsParam) {
      return HttpResponse.json({ error: 'symbols parameter required' }, { status: 400 });
    }
    const symbols = symbolsParam.split(',').map((s) => s.trim().toUpperCase());
    return HttpResponse.json({
      success: true,
      data: symbols.map(mockQuote),
      meta: { ...mockMeta(), source: 'msw', count: symbols.length },
    });
  }),

  http.get(`${API_BASE}/api/v1/quotes/:symbol`, ({ params }) => {
    const symbol = (params.symbol as string).toUpperCase();
    return HttpResponse.json({
      success: true,
      data: mockQuote(symbol),
      meta: mockMeta(),
    });
  }),

  // ========================
  // Earnings
  // ========================
  http.get(`${API_BASE}/api/v1/earnings/upcoming`, ({ request }) => {
    const url = new URL(request.url);
    const symbolsParam = url.searchParams.get('symbols');
    const symbols = symbolsParam
      ? symbolsParam.split(',')
      : ['AAPL', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'JPM', 'V', 'JNJ', 'UNH'];
    return HttpResponse.json({
      success: true,
      data: mockEarnings(symbols),
      meta: mockMeta(),
    });
  }),

  http.get(`${API_BASE}/api/v1/earnings/history/:symbol`, ({ params }) => {
    const symbol = params.symbol as string;
    return HttpResponse.json({
      success: true,
      data: mockEarningsHistory(symbol),
      meta: mockMeta(),
    });
  }),

  http.get(`${API_BASE}/api/v1/earnings/forecast/:symbol`, ({ params }) => {
    const symbol = params.symbol as string;
    return HttpResponse.json({
      success: true,
      data: mockEarningsForecast(symbol),
      meta: mockMeta(),
    });
  }),

  // ========================
  // Factors
  // ========================
  http.get(`${API_BASE}/api/v1/portfolio/factors/:symbols`, ({ params }) => {
    const symbols = (params.symbols as string).split(',');
    const data: Record<string, ReturnType<typeof mockFactorExposures>> = {};
    for (const symbol of symbols) {
      data[symbol.trim()] = mockFactorExposures(symbol.trim());
    }
    return HttpResponse.json({
      success: true,
      data,
      meta: mockMeta(),
    });
  }),

  http.get(`${API_BASE}/api/v1/portfolio/attribution`, ({ request }) => {
    if (!hasAuth(request)) return unauthorized();
    return HttpResponse.json({ success: true, data: {}, meta: mockMeta() });
  }),

  http.get(`${API_BASE}/api/v1/portfolio/risk`, ({ request }) => {
    if (!hasAuth(request)) return unauthorized();
    return HttpResponse.json({ success: true, data: {}, meta: mockMeta() });
  }),

  http.get(`${API_BASE}/api/v1/portfolio/metrics`, ({ request }) => {
    if (!hasAuth(request)) return unauthorized();
    return HttpResponse.json({ success: true, data: {}, meta: mockMeta() });
  }),

  // ========================
  // Portfolio (Protected)
  // ========================
  http.get(`${API_BASE}/api/v1/portfolio`, ({ request }) => {
    if (!hasAuth(request)) return unauthorized();
    return HttpResponse.json({ success: true, data: { positions: [] }, meta: mockMeta() });
  }),

  http.post(`${API_BASE}/api/v1/portfolio/positions`, ({ request }) => {
    if (!hasAuth(request)) return unauthorized();
    return HttpResponse.json({ success: true, data: {}, meta: mockMeta() });
  }),

  http.put(`${API_BASE}/api/v1/portfolio/positions/:id`, ({ request }) => {
    if (!hasAuth(request)) return unauthorized();
    return HttpResponse.json({ success: true, data: {}, meta: mockMeta() });
  }),

  http.delete(`${API_BASE}/api/v1/portfolio/positions/:id`, ({ request }) => {
    if (!hasAuth(request)) return unauthorized();
    return HttpResponse.json({ success: true, data: { deleted: true }, meta: mockMeta() });
  }),

  // ========================
  // Optimization (Protected)
  // ========================
  http.post(`${API_BASE}/api/v1/portfolio/optimize`, ({ request }) => {
    if (!hasAuth(request)) return unauthorized();
    return HttpResponse.json({
      success: true,
      data: {
        weights: { AAPL: 0.25, MSFT: 0.25, GOOGL: 0.25, NVDA: 0.25 },
        expectedReturn: 0.12,
        expectedVolatility: 0.18,
        sharpeRatio: 0.67,
      },
      meta: mockMeta(),
    });
  }),

  // ========================
  // Auth
  // ========================
  http.post(`${API_BASE}/api/v1/auth/signup`, async ({ request }) => {
    const body = (await request.json()) as { email?: string; password?: string; name?: string };

    if (!body.email || !body.password) {
      return HttpResponse.json(
        mockAuthError('VALIDATION_ERROR', 'Email and password are required'),
        { status: 400 }
      );
    }

    // Check email format
    if (!body.email.includes('@') || !body.email.includes('.')) {
      return HttpResponse.json(
        mockAuthError('VALIDATION_ERROR', 'Invalid email format'),
        { status: 400 }
      );
    }

    // Check password length
    if (body.password.length < 6) {
      return HttpResponse.json(
        mockAuthError('VALIDATION_ERROR', 'Password must be at least 6 characters'),
        { status: 400 }
      );
    }

    return HttpResponse.json(mockSignupResponse(body.email), { status: 201 });
  }),

  http.post(`${API_BASE}/api/v1/auth/login`, async ({ request }) => {
    const body = (await request.json()) as { email?: string; password?: string };

    if (!body.email || !body.password) {
      return HttpResponse.json(
        mockAuthError('VALIDATION_ERROR', 'Email and password are required'),
        { status: 400 }
      );
    }

    // All logins fail in mock (no real users)
    return HttpResponse.json(
      mockAuthError('INVALID_CREDENTIALS', 'Invalid email or password'),
      { status: 401 }
    );
  }),

  http.get(`${API_BASE}/api/v1/auth/me`, ({ request }) => {
    if (!hasAuth(request)) return unauthorized();
    return HttpResponse.json({
      success: true,
      data: { id: 'user-test', email: 'test@example.com' },
      meta: mockMeta(),
    });
  }),

  http.post(`${API_BASE}/api/v1/auth/refresh`, async ({ request }) => {
    const body = (await request.json()) as { refreshToken?: string };

    if (!body.refreshToken) {
      return HttpResponse.json(
        mockAuthError('VALIDATION_ERROR', 'Refresh token is required'),
        { status: 400 }
      );
    }

    return HttpResponse.json(
      mockAuthError('INVALID_TOKEN', 'Invalid refresh token'),
      { status: 401 }
    );
  }),

  http.post(`${API_BASE}/api/v1/auth/logout`, ({ request }) => {
    if (!hasAuth(request)) return unauthorized();
    return HttpResponse.json({ success: true, data: { loggedOut: true }, meta: mockMeta() });
  }),

  // ========================
  // Alerts (Protected)
  // ========================
  http.get(`${API_BASE}/api/v1/alerts/stream`, ({ request }) => {
    if (!hasAuth(request)) return unauthorized();
    return new HttpResponse(null, { status: 501 });
  }),

  http.get(`${API_BASE}/api/v1/alerts/factor-drift`, ({ request }) => {
    if (!hasAuth(request)) return unauthorized();
    return HttpResponse.json({ success: true, data: [], meta: mockMeta() });
  }),

  http.get(`${API_BASE}/api/v1/alerts/sec-filings`, ({ request }) => {
    if (!hasAuth(request)) return unauthorized();
    return HttpResponse.json({ success: true, data: [], meta: mockMeta() });
  }),

  http.get(`${API_BASE}/api/v1/alerts/config`, ({ request }) => {
    if (!hasAuth(request)) return unauthorized();
    return HttpResponse.json({ success: true, data: {}, meta: mockMeta() });
  }),

  http.put(`${API_BASE}/api/v1/alerts/config`, ({ request }) => {
    if (!hasAuth(request)) return unauthorized();
    return HttpResponse.json({ success: true, data: {}, meta: mockMeta() });
  }),

  http.post(`${API_BASE}/api/v1/alerts/:id/dismiss`, ({ request }) => {
    if (!hasAuth(request)) return unauthorized();
    return HttpResponse.json({ success: true, data: {}, meta: mockMeta() });
  }),

  http.get(`${API_BASE}/api/v1/alerts`, ({ request }) => {
    if (!hasAuth(request)) return unauthorized();
    return HttpResponse.json({ success: true, data: [], meta: mockMeta() });
  }),

  // ========================
  // Settings (Protected)
  // ========================
  http.get(`${API_BASE}/api/v1/settings/notifications`, ({ request }) => {
    if (!hasAuth(request)) return unauthorized();
    return HttpResponse.json({ success: true, data: {}, meta: mockMeta() });
  }),

  http.put(`${API_BASE}/api/v1/settings/notifications`, ({ request }) => {
    if (!hasAuth(request)) return unauthorized();
    return HttpResponse.json({ success: true, data: {}, meta: mockMeta() });
  }),

  // ========================
  // Catch-all: 404
  // ========================
  http.all(`${API_BASE}/api/v1/*`, () => {
    return HttpResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Endpoint not found' } },
      { status: 404 }
    );
  }),
];
