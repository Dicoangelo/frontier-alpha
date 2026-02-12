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
      dataSource: 'mock',
      meta: { ...mockMeta(), count: symbols.length },
    }, { headers: { 'X-Data-Source': 'mock' } });
  }),

  http.get(`${API_BASE}/api/v1/quotes/:symbol`, ({ params }) => {
    const symbol = (params.symbol as string).toUpperCase();
    return HttpResponse.json({
      success: true,
      data: mockQuote(symbol),
      dataSource: 'mock',
      meta: mockMeta(),
    }, { headers: { 'X-Data-Source': 'mock' } });
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
      dataSource: 'mock',
      meta: mockMeta(),
    }, { headers: { 'X-Data-Source': 'mock' } });
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
      dataSource: 'mock',
      meta: mockMeta(),
    }, { headers: { 'X-Data-Source': 'mock' } });
  }),

  http.get(`${API_BASE}/api/v1/portfolio/attribution`, ({ request }) => {
    if (!hasAuth(request)) return unauthorized();
    return HttpResponse.json({ success: true, data: {}, dataSource: 'mock', meta: mockMeta() }, { headers: { 'X-Data-Source': 'mock' } });
  }),

  http.get(`${API_BASE}/api/v1/portfolio/risk`, ({ request }) => {
    if (!hasAuth(request)) return unauthorized();
    return HttpResponse.json({ success: true, data: {}, dataSource: 'mock', meta: mockMeta() }, { headers: { 'X-Data-Source': 'mock' } });
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
    return HttpResponse.json({
      success: true,
      data: {
        id: 'portfolio-1',
        name: 'My Portfolio',
        positions: [
          { id: 'pos-1', symbol: 'AAPL', shares: 50, weight: 0.35, costBasis: 180.5, currentPrice: 227.63, unrealizedPnL: 2356.5 },
          { id: 'pos-2', symbol: 'MSFT', shares: 30, weight: 0.45, costBasis: 380.25, currentPrice: 415.2, unrealizedPnL: 1048.5 },
        ],
        cash: 5000,
        totalValue: 30129,
        currency: 'USD',
      },
      dataSource: 'mock',
      meta: mockMeta(),
    }, { headers: { 'X-Data-Source': 'mock' } });
  }),

  http.get(`${API_BASE}/api/v1/portfolio/positions`, ({ request }) => {
    if (!hasAuth(request)) return unauthorized();
    return HttpResponse.json({
      success: true,
      data: [
        { id: 'pos-1', symbol: 'AAPL', shares: 50, costBasis: 180.5 },
        { id: 'pos-2', symbol: 'MSFT', shares: 30, costBasis: 380.25 },
      ],
      meta: { ...mockMeta(), count: 2 },
    });
  }),

  http.post(`${API_BASE}/api/v1/portfolio/positions`, async ({ request }) => {
    if (!hasAuth(request)) return unauthorized();
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({
      success: true,
      data: {
        id: `pos-${Date.now()}`,
        symbol: body.symbol || 'AAPL',
        shares: body.shares || 10,
        costBasis: body.avgCost || 150,
      },
      meta: mockMeta(),
    }, { status: 201 });
  }),

  http.put(`${API_BASE}/api/v1/portfolio/positions/:id`, async ({ request, params }) => {
    if (!hasAuth(request)) return unauthorized();
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({
      success: true,
      data: {
        id: params.id,
        symbol: 'AAPL',
        shares: body.shares ?? 50,
        costBasis: body.avgCost ?? 180.5,
      },
      meta: mockMeta(),
    });
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
        dataSource: 'mock',
      },
      dataSource: 'mock',
      meta: mockMeta(),
    }, { headers: { 'X-Data-Source': 'mock' } });
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
  // CVRF Episode Lifecycle
  // ========================
  http.post(`${API_BASE}/api/v1/cvrf/episode/start`, async ({ request }) => {
    return HttpResponse.json({
      success: true,
      data: {
        id: `episode_${Date.now()}`,
        episodeNumber: 6,
        startDate: new Date().toISOString(),
        message: 'CVRF episode started. Record decisions and close when complete.',
      },
      meta: { ...mockMeta(), persistent: true },
    });
  }),

  http.post(`${API_BASE}/api/v1/cvrf/decision`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;

    if (!body.symbol || !body.action) {
      return HttpResponse.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: { symbol: 'Required', action: 'Required' } },
        },
        { status: 400 }
      );
    }

    return HttpResponse.json({
      success: true,
      data: {
        id: `dec_${Date.now()}`,
        timestamp: new Date().toISOString(),
        symbol: body.symbol,
        action: body.action,
        weightBefore: body.weightBefore ?? 0,
        weightAfter: body.weightAfter ?? 0,
        reason: body.reason ?? '',
        confidence: body.confidence ?? 0.5,
        factors: body.factors ?? [],
      },
      meta: { ...mockMeta(), persistent: true },
    });
  }),

  http.post(`${API_BASE}/api/v1/cvrf/episode/close`, async () => {
    return HttpResponse.json({
      success: true,
      data: {
        episode: {
          id: `episode_${Date.now()}`,
          episodeNumber: 6,
          startDate: new Date(Date.now() - 86400000).toISOString(),
          endDate: new Date().toISOString(),
          decisionsCount: 3,
          portfolioReturn: 0.025,
          sharpeRatio: 1.4,
        },
        cvrfResult: {
          performanceDelta: 0.015,
          decisionOverlap: 0.67,
          insightsExtracted: 2,
          beliefUpdates: 3,
          newRegime: 'bull_trending',
        },
      },
      meta: { ...mockMeta(), persistent: true },
    });
  }),

  // ========================
  // CVRF Episodes (Protected, Paginated)
  // ========================
  http.get(`${API_BASE}/api/v1/cvrf/episodes`, ({ request }) => {
    if (!hasAuth(request)) return unauthorized();

    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10) || 50, 200);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10) || 0;
    const expand = url.searchParams.get('expand');

    // Generate mock episodes
    const totalCompleted = 5;
    const episodes = Array.from({ length: Math.min(limit, totalCompleted - offset) }, (_, i) => {
      const n = offset + i + 1;
      const base: Record<string, unknown> = {
        id: `episode_${n}`,
        episodeNumber: n,
        startDate: new Date(Date.now() - n * 86400000).toISOString(),
        endDate: new Date(Date.now() - (n - 1) * 86400000).toISOString(),
        decisionsCount: 3,
        portfolioReturn: 0.02 * (n % 3 === 0 ? -1 : 1),
        sharpeRatio: 1.2,
        maxDrawdown: 0.03,
        status: 'completed',
      };
      if (expand === 'decisions') {
        base.decisions = [];
      }
      return base;
    });

    return HttpResponse.json({
      success: true,
      data: {
        current: null,
        completed: episodes,
        totalEpisodes: totalCompleted,
        pagination: {
          total: totalCompleted,
          limit,
          offset,
          hasMore: offset + limit < totalCompleted,
        },
      },
      meta: mockMeta(),
    });
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
