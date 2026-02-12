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
  // CVRF Beliefs & Constraints
  // ========================
  http.get(`${API_BASE}/api/v1/cvrf/beliefs`, () => {
    return HttpResponse.json({
      success: true,
      data: {
        id: 'belief_state_1',
        version: 5,
        updatedAt: new Date().toISOString(),
        factorWeights: {
          momentum: 0.25,
          value: 0.15,
          quality: 0.20,
          volatility: -0.10,
          growth: 0.18,
          size: 0.12,
        },
        factorConfidences: {
          momentum: 0.85,
          value: 0.72,
          quality: 0.80,
          volatility: 0.90,
          growth: 0.75,
          size: 0.65,
        },
        riskTolerance: 0.6,
        maxDrawdownThreshold: 0.15,
        volatilityTarget: 0.18,
        momentumHorizon: 12,
        meanReversionThreshold: 2.0,
        concentrationLimit: 0.25,
        minPositionSize: 0.02,
        rebalanceThreshold: 0.05,
        currentRegime: 'bull',
        regimeConfidence: 0.82,
        conceptualPriors: [
          {
            id: 'prior_1',
            type: 'momentum_persistence',
            concept: 'Strong momentum persists in tech sector',
            evidence: ['episode_3', 'episode_4'],
            confidence: 0.78,
            sourceEpisode: 'episode_4',
            impactDirection: 'positive',
          },
        ],
      },
      meta: mockMeta(),
    });
  }),

  http.get(`${API_BASE}/api/v1/cvrf/constraints`, () => {
    return HttpResponse.json({
      success: true,
      data: {
        factorTargets: {
          momentum: { target: 0.25, tolerance: 0.10 },
          value: { target: 0.15, tolerance: 0.08 },
          quality: { target: 0.20, tolerance: 0.10 },
        },
        maxWeight: 0.25,
        minWeight: 0.02,
        volatilityTarget: 0.18,
        riskBudget: 0.10,
      },
      meta: mockMeta(),
    });
  }),

  http.get(`${API_BASE}/api/v1/cvrf/history`, () => {
    return HttpResponse.json({
      success: true,
      data: [
        {
          timestamp: new Date(Date.now() - 86400000).toISOString(),
          betterEpisodeReturn: 0.035,
          worseEpisodeReturn: 0.010,
          performanceDelta: 0.025,
          decisionOverlap: 0.67,
          insightsCount: 3,
          beliefUpdatesCount: 4,
          newRegime: 'bull',
        },
        {
          timestamp: new Date(Date.now() - 172800000).toISOString(),
          betterEpisodeReturn: 0.028,
          worseEpisodeReturn: -0.005,
          performanceDelta: 0.033,
          decisionOverlap: 0.50,
          insightsCount: 2,
          beliefUpdatesCount: 3,
          newRegime: 'sideways',
        },
      ],
      meta: mockMeta(),
    });
  }),

  http.post(`${API_BASE}/api/v1/cvrf/risk`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;

    if (!body.portfolioValue || !body.portfolioReturns || !body.positions) {
      return HttpResponse.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'portfolioValue, portfolioReturns, and positions are required' },
        },
        { status: 400 }
      );
    }

    return HttpResponse.json({
      success: true,
      data: {
        withinEpisode: {
          currentCVaR: -0.032,
          threshold: -0.05,
          triggered: false,
          adjustment: {
            type: 'none',
            magnitude: 0,
            targets: [],
          },
        },
        overEpisode: {
          conceptualInsights: [
            { concept: 'Momentum factor outperforming', confidence: 0.82 },
          ],
          metaPrompt: {
            optimizationDirection: 'Increase momentum exposure while maintaining quality tilt',
            keyLearnings: [
              'Tech momentum persists across episodes',
              'Value factor underperforming in current regime',
            ],
            factorAdjustments: { momentum: 0.05, value: -0.03 },
            riskGuidance: 'Maintain current risk levels; CVaR within tolerance',
            timingInsights: 'Bull regime favors trend-following strategies',
            generatedAt: new Date().toISOString(),
          },
          learningRate: 0.15,
          beliefDeltas: { momentum: 0.02, value: -0.01 },
        },
        combinedRecommendation: 'Continue current strategy with slight momentum tilt increase',
      },
      meta: mockMeta(),
    });
  }),

  // ========================
  // ML Engine
  // ========================
  http.get(`${API_BASE}/api/v1/ml/regime`, ({ request }) => {
    const url = new URL(request.url);
    const symbol = (url.searchParams.get('symbols') || 'SPY').split(',')[0].trim().toUpperCase();
    return HttpResponse.json({
      success: true,
      data: {
        regime: 'bull',
        confidence: 0.78,
        probabilities: { bull: 0.78, bear: 0.05, sideways: 0.12, volatile: 0.05 },
        transitions: {
          bull: { bull: 0.85, bear: 0.05, sideways: 0.07, volatile: 0.03 },
          bear: { bull: 0.10, bear: 0.75, sideways: 0.10, volatile: 0.05 },
          sideways: { bull: 0.20, bear: 0.15, sideways: 0.55, volatile: 0.10 },
          volatile: { bull: 0.10, bear: 0.20, sideways: 0.15, volatile: 0.55 },
        },
        symbol,
        timestamp: new Date().toISOString(),
      },
      meta: mockMeta(),
    });
  }),

  http.get(`${API_BASE}/api/v1/ml/attribution`, ({ request }) => {
    const url = new URL(request.url);
    const symbols = (url.searchParams.get('symbols') || 'AAPL,MSFT,GOOGL')
      .split(',').map((s: string) => s.trim().toUpperCase());
    return HttpResponse.json({
      success: true,
      data: {
        totalReturn: 0.0234,
        factorReturn: 0.0198,
        residualReturn: 0.0036,
        factors: [
          { factor: 'momentum', exposure: 0.45, factorReturn: 0.02, contribution: 0.009, gradientImportance: 0.02, shapleyValue: 0.009, direction: 'positive', percentOfTotal: 45.5 },
          { factor: 'quality', exposure: 0.30, factorReturn: 0.015, contribution: 0.0045, gradientImportance: 0.015, shapleyValue: 0.0045, direction: 'positive', percentOfTotal: 22.7 },
          { factor: 'value', exposure: -0.10, factorReturn: 0.01, contribution: -0.001, gradientImportance: 0.01, shapleyValue: -0.001, direction: 'negative', percentOfTotal: 5.1 },
        ],
        waterfall: [
          { label: 'momentum', start: 0, end: 0.009, value: 0.009, type: 'positive' },
          { label: 'quality', start: 0.009, end: 0.0135, value: 0.0045, type: 'positive' },
          { label: 'value', start: 0.0135, end: 0.0125, value: -0.001, type: 'negative' },
          { label: 'residual', start: 0.0125, end: 0.0161, value: 0.0036, type: 'residual' },
          { label: 'total', start: 0, end: 0.0234, value: 0.0234, type: 'total' },
        ],
        summary: {
          positiveCount: 2,
          negativeCount: 1,
          totalPositive: 0.0135,
          totalNegative: -0.001,
          topPositive: 'momentum',
          topNegative: 'value',
          rSquared: 0.846,
        },
        symbols,
      },
      meta: mockMeta(),
    });
  }),

  http.get(`${API_BASE}/api/v1/ml/models`, ({ request }) => {
    const url = new URL(request.url);
    const typeFilter = url.searchParams.get('type');
    const statusFilter = url.searchParams.get('status');

    let models = [
      {
        id: 'mv_mock_regime_1',
        model_type: 'regime_detector',
        version: '1.0.0',
        status: 'deployed',
        metrics: { accuracy: 0.72, sharpeImprovement: 0.15, maxDrawdownReduction: 0.03 },
        trained_at: new Date(Date.now() - 86400000).toISOString(),
        data_points: 252,
      },
      {
        id: 'mv_mock_factor_1',
        model_type: 'neural_factor',
        version: '1.0.0',
        status: 'deployed',
        metrics: { momentumMAE: 0.012, informationCoefficient: 0.18 },
        trained_at: new Date(Date.now() - 86400000).toISOString(),
        data_points: 252,
      },
      {
        id: 'mv_mock_regime_0',
        model_type: 'regime_detector',
        version: '0.9.0',
        status: 'archived',
        metrics: { accuracy: 0.65, sharpeImprovement: 0.08, maxDrawdownReduction: 0.01 },
        trained_at: new Date(Date.now() - 172800000).toISOString(),
        data_points: 126,
      },
    ];

    if (typeFilter) {
      models = models.filter(m => m.model_type === typeFilter);
    }
    if (statusFilter) {
      models = models.filter(m => m.status === statusFilter);
    }

    return HttpResponse.json({
      success: true,
      data: {
        models,
        count: models.length,
      },
      meta: mockMeta(),
    });
  }),

  // ========================
  // Options Intelligence
  // ========================
  http.get(`${API_BASE}/api/v1/options/chain`, ({ request }) => {
    const url = new URL(request.url);
    const symbol = (url.searchParams.get('symbol') || '').toUpperCase();
    if (!symbol) {
      return HttpResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'symbol query parameter is required' } },
        { status: 400 }
      );
    }
    const expiration1 = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
    const expiration2 = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
    const underlyingPrice = 150;
    return HttpResponse.json({
      success: true,
      data: {
        symbol,
        expirations: [expiration1, expiration2],
        calls: [
          { strike: 145, expiration: expiration1, bid: 6.20, ask: 6.50, last: 6.35, volume: 1200, openInterest: 5000, impliedVolatility: 0.28, type: 'call' },
          { strike: 150, expiration: expiration1, bid: 3.10, ask: 3.40, last: 3.25, volume: 2500, openInterest: 8000, impliedVolatility: 0.25, type: 'call' },
          { strike: 155, expiration: expiration1, bid: 1.20, ask: 1.50, last: 1.35, volume: 800, openInterest: 3000, impliedVolatility: 0.27, type: 'call' },
        ],
        puts: [
          { strike: 145, expiration: expiration1, bid: 1.00, ask: 1.30, last: 1.15, volume: 600, openInterest: 2000, impliedVolatility: 0.30, type: 'put' },
          { strike: 150, expiration: expiration1, bid: 2.90, ask: 3.20, last: 3.05, volume: 1800, openInterest: 6000, impliedVolatility: 0.27, type: 'put' },
          { strike: 155, expiration: expiration1, bid: 5.80, ask: 6.10, last: 5.95, volume: 400, openInterest: 1500, impliedVolatility: 0.29, type: 'put' },
        ],
        underlyingPrice,
      },
      meta: mockMeta(),
    });
  }),

  http.get(`${API_BASE}/api/v1/options/greeks`, ({ request }) => {
    const url = new URL(request.url);
    const symbol = (url.searchParams.get('symbol') || '').toUpperCase();
    if (!symbol) {
      return HttpResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'symbol query parameter is required' } },
        { status: 400 }
      );
    }
    const strike = url.searchParams.get('strike');
    const expiration = url.searchParams.get('expiration');
    const type = url.searchParams.get('type');

    if (strike && expiration && type) {
      // Single contract mode
      return HttpResponse.json({
        success: true,
        data: {
          mode: 'contract',
          greeks: {
            symbol,
            strike: parseFloat(strike),
            expiration,
            type,
            underlyingPrice: 150,
            impliedVolatility: 0.25,
            timeToExpiry: 0.08,
            theoreticalPrice: 3.25,
            delta: type === 'call' ? 0.52 : -0.48,
            gamma: 0.045,
            theta: -0.029,
            vega: 0.18,
            rho: 0.015,
          },
        },
        meta: mockMeta(),
      });
    }

    // Portfolio mode
    return HttpResponse.json({
      success: true,
      data: {
        mode: 'portfolio',
        greeks: {
          positionCount: 3,
          netDelta: 156,
          netGamma: 13.5,
          netTheta: -8.7,
          netVega: 54,
          netRho: 4.5,
          delta: 1.56,
          gamma: 0.135,
          theta: -0.087,
          vega: 0.54,
          rho: 0.045,
          positions: [],
        },
        symbol,
      },
      meta: mockMeta(),
    });
  }),

  http.post(`${API_BASE}/api/v1/options/strategies`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const validTypes = ['covered_call', 'protective_put', 'bull_call_spread', 'bear_put_spread', 'iron_condor', 'straddle', 'strangle'];

    if (!body.type || !validTypes.includes(body.type as string)) {
      return HttpResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: `Invalid strategy type. Must be one of: ${validTypes.join(', ')}` } },
        { status: 400 }
      );
    }
    if (!body.symbol) {
      return HttpResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'symbol is required' } },
        { status: 400 }
      );
    }

    return HttpResponse.json({
      success: true,
      data: {
        strategy: {
          name: 'Covered Call',
          type: body.type,
          legs: [
            { type: 'stock', strike: 0, expiration: '2026-03-14', quantity: 100, premium: 150 },
            { type: 'call', strike: 155, expiration: '2026-03-14', quantity: -1, premium: -3.0 },
          ],
          underlyingPrice: 150,
          description: 'Long stock + short call.',
          outlook: 'neutral',
        },
        maxProfit: 800,
        maxLoss: -14700,
        breakevens: [147],
        probabilityOfProfit: 0.62,
        netDebit: 14700,
        riskRewardRatio: 0.054,
        pnlData: [
          { price: 130, profit: -1700 },
          { price: 140, profit: -700 },
          { price: 150, profit: 300 },
          { price: 160, profit: 800 },
        ],
      },
      meta: mockMeta(),
    });
  }),

  http.get(`${API_BASE}/api/v1/options/strategies`, ({ request }) => {
    const url = new URL(request.url);
    const symbol = (url.searchParams.get('symbol') || '').toUpperCase();
    if (!symbol) {
      return HttpResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'symbol query parameter is required' } },
        { status: 400 }
      );
    }
    const ivRank = parseFloat(url.searchParams.get('ivRank') || '50');
    const regime = url.searchParams.get('regime') || 'sideways';

    return HttpResponse.json({
      success: true,
      data: {
        symbol,
        ivRank,
        regime,
        recommendations: [
          { type: 'iron_condor', name: 'Iron Condor', rationale: 'Range-bound market favors premium selling.', outlook: 'neutral', score: 0.85 },
          { type: 'covered_call', name: 'Covered Call', rationale: 'Generate income on existing stock position.', outlook: 'neutral', score: 0.72 },
          { type: 'bull_call_spread', name: 'Bull Call Spread', rationale: 'Defined-risk bullish bet with known max loss.', outlook: 'bullish', score: 0.60 },
        ],
      },
      meta: mockMeta(),
    });
  }),

  http.get(`${API_BASE}/api/v1/options/vol-surface`, ({ request }) => {
    const url = new URL(request.url);
    const symbol = (url.searchParams.get('symbol') || '').toUpperCase();
    if (!symbol) {
      return HttpResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'symbol query parameter is required' } },
        { status: 400 }
      );
    }
    const exp1 = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
    const exp2 = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
    return HttpResponse.json({
      success: true,
      data: {
        symbol,
        underlyingPrice: 150,
        strikes: [140, 145, 150, 155, 160],
        expirations: [exp1, exp2],
        surface: [
          { strike: 140, expiration: exp1, iv: 0.32 },
          { strike: 145, expiration: exp1, iv: 0.28 },
          { strike: 150, expiration: exp1, iv: 0.25 },
          { strike: 155, expiration: exp1, iv: 0.27 },
          { strike: 160, expiration: exp1, iv: 0.31 },
          { strike: 140, expiration: exp2, iv: 0.30 },
          { strike: 145, expiration: exp2, iv: 0.27 },
          { strike: 150, expiration: exp2, iv: 0.24 },
          { strike: 155, expiration: exp2, iv: 0.26 },
          { strike: 160, expiration: exp2, iv: 0.29 },
        ],
        heatmap: {
          symbol,
          underlyingPrice: 150,
          riskFreeRate: 0.0525,
          strikes: [140, 145, 150, 155, 160],
          expirations: [exp1, exp2],
          cells: [],
        },
      },
      meta: mockMeta(),
    });
  }),

  // ========================
  // Tax Optimization
  // ========================
  http.get(`${API_BASE}/api/v1/tax/lots`, ({ request }) => {
    if (!hasAuth(request)) return unauthorized();
    const url = new URL(request.url);
    const symbol = url.searchParams.get('symbol')?.toUpperCase();

    const allLots = [
      {
        id: 'tl_1',
        userId: 'user-test',
        symbol: 'AAPL',
        shares: 50,
        costBasis: 180.5,
        purchaseDate: '2025-06-15T00:00:00.000Z',
        soldDate: null,
        isOpen: true,
        holdingDays: 242,
        isShortTerm: true,
      },
      {
        id: 'tl_2',
        userId: 'user-test',
        symbol: 'MSFT',
        shares: 30,
        costBasis: 420.0,
        purchaseDate: '2025-03-10T00:00:00.000Z',
        soldDate: null,
        isOpen: true,
        holdingDays: 339,
        isShortTerm: true,
      },
      {
        id: 'tl_3',
        userId: 'user-test',
        symbol: 'GOOGL',
        shares: 20,
        costBasis: 175.0,
        purchaseDate: '2024-08-01T00:00:00.000Z',
        soldDate: '2025-11-15T00:00:00.000Z',
        isOpen: false,
        holdingDays: 471,
        isShortTerm: false,
      },
    ];

    const lots = symbol ? allLots.filter(l => l.symbol === symbol) : allLots;

    return HttpResponse.json({
      success: true,
      data: {
        lots,
        count: lots.length,
      },
      meta: mockMeta(),
    });
  }),

  http.get(`${API_BASE}/api/v1/tax/harvest`, ({ request }) => {
    if (!hasAuth(request)) return unauthorized();
    return HttpResponse.json({
      success: true,
      data: {
        opportunities: [
          {
            symbol: 'MSFT',
            unrealizedLoss: -450.0,
            currentPrice: 405.0,
            costBasis: 420.0,
            totalShares: 30,
            estimatedTaxSavings: 189.0,
            shortTermLoss: -450.0,
            longTermLoss: 0,
            shortTermTaxSavings: 189.0,
            longTermTaxSavings: 0,
            replacements: [
              { symbol: 'GOOGL', sector: 'Technology', reason: 'Same sector alternative' },
              { symbol: 'CRM', sector: 'Technology', reason: 'Same sector alternative' },
            ],
            lots: [
              {
                lotId: 'tl_2',
                shares: 30,
                costBasis: 420.0,
                purchaseDate: '2025-03-10T00:00:00.000Z',
                unrealizedLoss: -450.0,
                isShortTerm: true,
                holdingDays: 339,
              },
            ],
          },
        ],
        totalUnrealizedLosses: -450.0,
        totalEstimatedTaxSavings: 189.0,
        scannedPositions: 3,
        qualifyingPositions: 1,
      },
      meta: mockMeta(),
    });
  }),

  http.post(`${API_BASE}/api/v1/tax/harvest`, async ({ request }) => {
    if (!hasAuth(request)) return unauthorized();
    const body = (await request.json()) as Record<string, unknown>;

    if (!body.symbol || !body.shares || !body.salePrice) {
      return HttpResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'symbol, shares, and salePrice are required' } },
        { status: 400 }
      );
    }

    return HttpResponse.json({
      success: true,
      data: {
        totalProceeds: (body.shares as number) * (body.salePrice as number),
        totalCostBasis: (body.shares as number) * 420.0,
        realizedGain: (body.shares as number) * ((body.salePrice as number) - 420.0),
        isShortTerm: true,
        events: [
          {
            id: `te_${Date.now()}`,
            userId: 'user-test',
            taxYear: new Date().getFullYear(),
            eventType: 'realized_loss',
            symbol: body.symbol,
            realizedGain: (body.shares as number) * ((body.salePrice as number) - 420.0),
            isWashSale: false,
            taxLotId: 'tl_2',
            shares: body.shares,
            salePrice: body.salePrice,
            costBasis: 420.0,
            saleDate: new Date().toISOString(),
          },
        ],
      },
      meta: mockMeta(),
    });
  }),

  http.get(`${API_BASE}/api/v1/tax/wash-sales`, ({ request }) => {
    if (!hasAuth(request)) return unauthorized();
    return HttpResponse.json({
      success: true,
      data: {
        violations: [
          {
            saleLotId: 'tl_4',
            saleSymbol: 'NVDA',
            saleDate: '2026-01-05T00:00:00.000Z',
            saleShares: 10,
            saleLoss: -200.0,
            replacementLotId: 'tl_5',
            replacementSymbol: 'NVDA',
            replacementDate: '2026-01-20T00:00:00.000Z',
            replacementShares: 10,
            replacementCostBasis: 140.0,
            disallowedLoss: 200.0,
            adjustedCostBasis: 160.0,
            affectedShares: 10,
            matchType: 'same_ticker',
          },
        ],
        totalDisallowedLosses: 200.0,
        totalAdjustedCostBasis: 160.0,
        scannedEvents: 5,
        violationCount: 1,
      },
      meta: mockMeta(),
    });
  }),

  http.get(`${API_BASE}/api/v1/tax/report`, ({ request }) => {
    if (!hasAuth(request)) return unauthorized();
    const url = new URL(request.url);
    const yearParam = url.searchParams.get('year');
    const taxYear = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();

    if (isNaN(taxYear) || taxYear < 2000 || taxYear > 2100) {
      return HttpResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'year must be a valid year between 2000 and 2100' } },
        { status: 400 }
      );
    }

    return HttpResponse.json({
      success: true,
      data: {
        taxYear,
        userId: 'user-test',
        generatedAt: new Date().toISOString(),
        summary: {
          taxYear,
          shortTermGains: 500,
          shortTermLosses: -200,
          longTermGains: 1200,
          longTermLosses: -300,
          netShortTerm: 300,
          netLongTerm: 900,
          totalRealizedGain: 1200,
          washSaleAdjustment: 200,
          eventCount: 8,
        },
        washSaleDisallowedLosses: 200,
        washSaleViolations: [],
        harvestingSavingsEstimate: 189.0,
        harvestingOpportunitiesCount: 1,
        shortTermTransactions: [
          {
            description: '10 shares NVDA',
            dateAcquired: '2025-11-01',
            dateSold: '2026-01-05',
            proceeds: 1400,
            costBasis: 1600,
            adjustmentCode: 'W',
            adjustmentAmount: 200,
            gainOrLoss: 0,
            isShortTerm: true,
            symbol: 'NVDA',
            shares: 10,
          },
        ],
        longTermTransactions: [
          {
            description: '20 shares GOOGL',
            dateAcquired: '2024-08-01',
            dateSold: '2025-11-15',
            proceeds: 3800,
            costBasis: 3500,
            adjustmentCode: '',
            adjustmentAmount: 0,
            gainOrLoss: 300,
            isShortTerm: false,
            symbol: 'GOOGL',
            shares: 20,
          },
        ],
        scheduleD: {
          shortTermProceeds: 1400,
          shortTermCostBasis: 1600,
          shortTermAdjustments: 200,
          shortTermGainOrLoss: 0,
          longTermProceeds: 3800,
          longTermCostBasis: 3500,
          longTermAdjustments: 0,
          longTermGainOrLoss: 300,
          netGainOrLoss: 300,
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
