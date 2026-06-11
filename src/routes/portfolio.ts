import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth.js';
import { portfolioService } from '../services/PortfolioService.js';
import { logger } from '../observability/logger.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { PerformanceAttribution } from '../analytics/PerformanceAttribution.js';
import { provenanceDag } from '../forensics/ProvenanceDag.js';
import { computeTemporalSaliency } from '../factors/temporalSaliency.js';
import type { APIResponse, OptimizationConfig, OptimizationResult, Price } from '../types/index.js';
import {
  BASE_HISTORY_DAYS,
  SUPPORTED_WINDOWS,
  lastBarDate,
  sliceAsOf,
  windowToDays,
  type HistoryWindow,
} from '../factors/historySlice.js';

/** Polygon.io daily-aggregates response (the fields this route reads). */
interface PolygonAggsResponse {
  status?: string;
  results?: Array<{ c: number }>;
}

/**
 * Shape of a `frontier_portfolio_shares` row joined with its
 * `frontier_portfolios` relation. The Supabase client types the embedded
 * relation loosely, so the join target is declared explicitly here.
 */
interface ShareWithPortfolio {
  frontier_portfolios?: { id: string; name: string; user_id: string };
}

interface RouteContext {
  server: {
    dataProvider: { getQuote(symbol: string): Promise<{ last: number } | null>; getHistoricalPrices(symbol: string, days: number): Promise<Price[]> };
    optimizer: { optimize(symbols: string[], prices: Map<string, Price[]>, config: OptimizationConfig): Promise<OptimizationResult> };
    factorEngine: { calculateExposures(symbols: string[], prices: Map<string, Price[]>): Promise<Map<string, unknown[]>> };
    currentPortfolio: unknown;
    useDatabase: boolean;
  };
}

export async function portfolioRoutes(fastify: FastifyInstance, opts: RouteContext) {
  const { server } = opts;

  // GET /api/v1/portfolio
  fastify.get<{ Reply: APIResponse<unknown> }>(
    '/api/v1/portfolio',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const start = Date.now();

      // ─── Welcome email on first auth-gated API call ─────────────────
      // Fire-and-forget: render + send the welcome email exactly once per
      // user, stamping `welcomed_at` so it never re-fires. The IIFE below
      // returns void so the email round-trip never blocks the response,
      // and any failure is swallowed (logged but non-fatal) — matching the
      // PR #18 subscription-confirmed pattern in `src/routes/billing.ts`.
      if (request.user?.id) {
        const userId = request.user.id;
        const userEmail = request.user.email;
        void (async () => {
          try {
            const { data: profile } = await supabaseAdmin
              .from('frontier_profiles')
              .select('display_name, welcomed_at')
              .eq('user_id', userId)
              .maybeSingle();

            const profileRow = profile as
              | { display_name?: string | null; welcomed_at?: string | null }
              | null;

            if (profileRow?.welcomed_at || !userEmail) {
              return;
            }

            // Pull metadata-derived display name as a fallback when the
            // user has not yet customized their frontier profile.
            const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
            const meta = authUser?.user?.user_metadata as
              | { full_name?: string; name?: string }
              | undefined;
            const displayName =
              profileRow?.display_name ||
              meta?.full_name ||
              meta?.name ||
              userEmail.split('@')[0];

            const frontendUrl =
              process.env.FRONTEND_URL || 'https://frontier-alpha.metaventionsai.com';
            const dashboardUrl = `${frontendUrl}/dashboard`;

            const { renderWelcome } = await import(
              '../notifications/email-templates/index.js'
            );
            const { getAlertDelivery } = await import(
              '../notifications/AlertDelivery.js'
            );

            const payload = renderWelcome({ displayName, dashboardUrl });

            await getAlertDelivery().sendEmail({
              to: userEmail,
              subject: payload.subject,
              html: payload.html,
              text: payload.text,
            });

            // Stamp welcomed_at idempotently — upsert covers the case where
            // no row exists yet (frontier_profiles is created lazily).
            await supabaseAdmin
              .from('frontier_profiles')
              .upsert(
                {
                  user_id: userId,
                  welcomed_at: new Date().toISOString(),
                  display_name: profileRow?.display_name ?? null,
                },
                { onConflict: 'user_id' }
              );
          } catch (err) {
            logger.warn({ err, userId }, 'Welcome email failed (non-fatal)');
          }
        })();
      }

      // If using database and user is authenticated
      if (server.useDatabase && request.user) {
        const dbPortfolio = await portfolioService.getPortfolio(request.user.id);

        if (!dbPortfolio) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'No portfolio found' },
          });
        }

        // Get current quotes for positions
        const quotes = new Map<string, number>();
        for (const position of dbPortfolio.positions) {
          const quote = await server.dataProvider.getQuote(position.symbol);
          if (quote) {
            quotes.set(position.symbol, quote.last);
          }
        }

        const portfolio = portfolioService.toAPIFormat(dbPortfolio, quotes);

        return {
          success: true,
          data: portfolio,
          meta: {
            timestamp: new Date(),
            requestId: request.id,
            latencyMs: Date.now() - start,
          },
        };
      }

      // Fallback to in-memory portfolio
      if (!server.currentPortfolio) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'No portfolio configured' },
        });
      }

      return {
        success: true,
        data: server.currentPortfolio,
        meta: {
          timestamp: new Date(),
          requestId: request.id,
          latencyMs: Date.now() - start,
        },
      };
    }
  );

  // POST /api/v1/portfolio/positions — Add position
  fastify.post<{
    Body: { symbol: string; shares: number; avgCost: number };
    Reply: APIResponse<unknown>;
  }>(
    '/api/v1/portfolio/positions',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const start = Date.now();
      const { symbol, shares, avgCost } = request.body;

      try {
        const position = await portfolioService.addPosition(
          request.user.id,
          symbol,
          shares,
          avgCost
        );

        if (!position) {
          return reply.status(400).send({
            success: false,
            error: { code: 'BAD_REQUEST', message: 'Failed to add position' },
          });
        }

        return {
          success: true,
          data: position,
          meta: {
            timestamp: new Date(),
            requestId: request.id,
            latencyMs: Date.now() - start,
          },
        };
      } catch (error) {
        logger.error({ err: error }, 'Failed to add position');
        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? `Portfolio operation failed: ${error.message}` : 'Portfolio operation failed' },
        });
      }
    }
  );

  // PUT /api/v1/portfolio/positions/:id — Update position
  fastify.put<{
    Params: { id: string };
    Body: { shares: number; avgCost: number };
    Reply: APIResponse<unknown>;
  }>(
    '/api/v1/portfolio/positions/:id',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const start = Date.now();
      const { id } = request.params;
      const { shares, avgCost } = request.body;

      try {
        const position = await portfolioService.updatePosition(
          request.user.id,
          id,
          shares,
          avgCost
        );

        if (!position) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Position not found' },
          });
        }

        return {
          success: true,
          data: position,
          meta: {
            timestamp: new Date(),
            requestId: request.id,
            latencyMs: Date.now() - start,
          },
        };
      } catch (error) {
        logger.error({ err: error }, 'Failed to update position');
        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? `Portfolio operation failed: ${error.message}` : 'Portfolio operation failed' },
        });
      }
    }
  );

  // DELETE /api/v1/portfolio/positions/:id — Delete position
  fastify.delete<{
    Params: { id: string };
    Reply: APIResponse<{ deleted: boolean }>;
  }>(
    '/api/v1/portfolio/positions/:id',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const start = Date.now();
      const { id } = request.params;

      try {
        const deleted = await portfolioService.deletePosition(request.user.id, id);

        if (!deleted) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Position not found' },
          });
        }

        return {
          success: true,
          data: { deleted: true },
          meta: {
            timestamp: new Date(),
            requestId: request.id,
            latencyMs: Date.now() - start,
          },
        };
      } catch (error) {
        logger.error({ err: error }, 'Failed to delete position');
        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? `Portfolio operation failed: ${error.message}` : 'Portfolio operation failed' },
        });
      }
    }
  );

  // POST /api/v1/portfolio/optimize
  fastify.post<{
    Body: { symbols: string[]; config: OptimizationConfig };
  }>(
    '/api/v1/portfolio/optimize',
    async (request, reply) => {
      const start = Date.now();
      const { symbols, config } = request.body;

      try {
        // Fetch prices for all symbols. Use BASE_HISTORY_DAYS (300) so we
        // share the cache key with /factors and /factors/history — otherwise
        // every cold Vercel function falls through to Polygon and trips the
        // free-tier rate limit.
        const prices = new Map<string, Price[]>();
        const skipped: string[] = [];
        for (const symbol of [...symbols, 'SPY']) {
          try {
            const symbolPrices = await server.dataProvider.getHistoricalPrices(symbol, BASE_HISTORY_DAYS);
            if (symbolPrices.length > 0) {
              prices.set(symbol, symbolPrices);
            } else {
              skipped.push(symbol);
            }
          } catch (err) {
            logger.warn({ err, symbol }, 'optimize: skipping symbol');
            skipped.push(symbol);
          }
        }

        // Need at least 2 symbols + SPY benchmark to optimize
        const resolvedSymbols = symbols.filter((s) => prices.has(s));
        if (resolvedSymbols.length < 2 || !prices.has('SPY')) {
          return reply.status(503).send({
            success: false,
            error: {
              code: 'INSUFFICIENT_DATA',
              message: `Optimizer needs at least 2 holdings with price history plus SPY benchmark. Resolved ${resolvedSymbols.length} of ${symbols.length} holdings; SPY ${prices.has('SPY') ? 'available' : 'unavailable'}.`,
              skipped,
            },
          });
        }

        // Default risk-free rate to 4.5% (10y treasury proxy) when client
        // omits it — older client builds don't send it and the type was
        // marked required, causing NaN cascades through the optimizer.
        const safeConfig: OptimizationConfig = {
          ...config,
          riskFreeRate: typeof config.riskFreeRate === 'number' ? config.riskFreeRate : 0.045,
        };

        // Run optimization on the resolved subset only
        const result = await server.optimizer.optimize(resolvedSymbols, prices, safeConfig);

        // Provenance lineage (IDEA-FF-3): market_data → optimizer_run →
        // recommendation. Fire-and-forget; only recorded for signed-in users.
        if (request.user?.id) {
          const userId = request.user.id;
          void (async () => {
            const marketDataId = await provenanceDag.record({
              userId,
              nodeType: 'market_data',
              label: `Price history (${resolvedSymbols.length + 1} symbols, ${BASE_HISTORY_DAYS}d)`,
              payload: { symbols: [...resolvedSymbols, 'SPY'], days: BASE_HISTORY_DAYS, skipped },
            });
            const runId = await provenanceDag.record({
              userId,
              nodeType: 'optimizer_run',
              label: `Optimizer run — ${safeConfig.objective ?? 'default'}`,
              payload: { config: safeConfig as unknown as Record<string, unknown> },
              parents: [marketDataId],
            });
            await provenanceDag.record({
              userId,
              nodeType: 'recommendation',
              label: 'Recommended weights',
              payload: { weights: Object.fromEntries(result.weights) },
              parents: [runId],
            });
          })();
        }

        return {
          success: true,
          data: {
            ...result,
            weights: Object.fromEntries(result.weights) as unknown as Record<string, number>,
          },
          meta: {
            timestamp: new Date(),
            requestId: request.id,
            latencyMs: Date.now() - start,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Portfolio optimization failed';
        logger.error({ err: error }, 'Portfolio optimization failed');
        return reply.status(500).send({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: `Optimization failed: ${message}`,
          },
        });
      }
    }
  );

  // GET /api/v1/portfolio/factors/saliency/:symbol — temporal saliency
  // (IDEAS Topic D): which trading-day windows drove the momentum and
  // volatility signals. True additive attribution over the same cached
  // price series the factor engine uses — zero new upstream calls.
  fastify.get<{
    Params: { symbol: string };
    Reply: APIResponse<unknown>;
  }>(
    '/api/v1/portfolio/factors/saliency/:symbol',
    async (request, reply) => {
      const start = Date.now();
      const symbol = request.params.symbol.toUpperCase();

      try {
        const prices = await server.dataProvider.getHistoricalPrices(symbol, BASE_HISTORY_DAYS);
        const result = computeTemporalSaliency(symbol, prices);

        if (!result) {
          return reply.status(503).send({
            success: false,
            error: {
              code: 'INSUFFICIENT_DATA',
              message: `Not enough price history for ${symbol} to compute temporal saliency.`,
            },
          });
        }

        return {
          success: true,
          data: result,
          meta: {
            timestamp: new Date(),
            requestId: request.id,
            latencyMs: Date.now() - start,
          },
        };
      } catch (error) {
        logger.error({ err: error, symbol }, 'Temporal saliency failed');
        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Temporal saliency computation failed' },
        });
      }
    }
  );

  // GET /api/v1/portfolio/factors/:symbols
  fastify.get<{
    Params: { symbols: string };
    Reply: APIResponse<unknown>;
  }>(
    '/api/v1/portfolio/factors/:symbols',
    async (request, reply) => {
      const start = Date.now();
      const symbols = request.params.symbols.split(',');

      try {
        const prices = new Map<string, Price[]>();
        const skipped: string[] = [];
        // Request 300 days to ensure enough data for momentum calculations (need 252 + 21 + buffer)
        for (const symbol of [...symbols, 'SPY']) {
          try {
            const symbolPrices = await server.dataProvider.getHistoricalPrices(symbol, BASE_HISTORY_DAYS);
            prices.set(symbol, symbolPrices);
          } catch (err) {
            logger.warn({ err, symbol }, 'factors: skipping symbol');
            skipped.push(symbol);
          }
        }

        // If every symbol failed (including SPY benchmark), return 500
        if (prices.size === 0) {
          return reply.status(500).send({
            success: false,
            error: {
              code: 'NO_FACTOR_DATA',
              message: 'All symbol fetches failed',
              skipped,
            },
          });
        }

        // Only compute exposures for symbols that successfully fetched prices
        const resolvedSymbols = symbols.filter((s) => prices.has(s));
        const exposures = await server.factorEngine.calculateExposures(resolvedSymbols, prices);

        return {
          success: true,
          data: Object.fromEntries(exposures),
          meta: {
            timestamp: new Date(),
            requestId: request.id,
            latencyMs: Date.now() - start,
            ...(skipped.length > 0 ? { skipped } : {}),
          },
        };
      } catch (error) {
        logger.error({ err: error }, 'Factor calculation failed');
        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? `Factor calculation failed: ${error.message}` : 'Factor calculation failed' },
        });
      }
    }
  );

  // GET /api/v1/portfolio/factors/history/:symbols?window=1d|5d
  //
  // Server-derived companion to /portfolio/factors/:symbols. Returns BOTH the
  // current factor exposures AND a window-prior snapshot in a single round
  // trip, so the client can render the FactorDeltas card without waiting a
  // UTC day for the localStorage baseline to capture.
  //
  // The prior snapshot is computed by truncating the same Price[] series the
  // current snapshot uses (see src/factors/historySlice.ts for the rationale)
  // and re-running calculateExposures. No new persistence layer.
  fastify.get<{
    Params: { symbols: string };
    Querystring: { window?: string };
    Reply: APIResponse<unknown>;
  }>(
    '/api/v1/portfolio/factors/history/:symbols',
    async (request, reply) => {
      const start = Date.now();
      const symbols = request.params.symbols.split(',');
      const rawWindow = request.query?.window ?? '1d';
      if (!SUPPORTED_WINDOWS.includes(rawWindow as HistoryWindow)) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'UNSUPPORTED_WINDOW',
            message: `window must be one of ${SUPPORTED_WINDOWS.join(', ')}`,
          },
        });
      }
      const window = rawWindow as HistoryWindow;
      const windowDays = windowToDays(window);
      // Fetch the SAME 300-day window the sibling /portfolio/factors/:symbols
      // endpoint asks for. The HistoricalPriceCache keys on `${symbol}:${days}`
      // (CompositeCache.getPrices line ~56) so a 301-day request would never
      // re-use a 300-day cache hit and would always fall through to Polygon,
      // immediately tripping the 5 req/min free-tier rate limit when the
      // dashboard fires both endpoints in sequence (observed in production
      // 2026-05-09: every symbol skipped, NO_FACTOR_DATA returned, FactorDeltas
      // card stuck on "Return tomorrow" for the seeded test user).
      // 300 days minus the max 5-day slice still leaves 295 trading days,
      // well above the 252-day minimum FactorEngine needs for momentum_12m.
      const fetchDays = BASE_HISTORY_DAYS;

      try {
        const prices = new Map<string, Price[]>();
        const skipped: string[] = [];
        for (const symbol of [...symbols, 'SPY']) {
          try {
            const symbolPrices = await server.dataProvider.getHistoricalPrices(symbol, fetchDays);
            prices.set(symbol, symbolPrices);
          } catch (err) {
            logger.warn({ err, symbol }, 'factors-history: skipping symbol');
            skipped.push(symbol);
          }
        }

        if (prices.size === 0) {
          return reply.status(500).send({
            success: false,
            error: {
              code: 'NO_FACTOR_DATA',
              message: 'All symbol fetches failed',
              skipped,
            },
          });
        }

        const resolvedSymbols = symbols.filter((s) => prices.has(s));
        const priorPrices = sliceAsOf(prices, windowDays);
        const priorResolvedSymbols = resolvedSymbols.filter((s) => priorPrices.has(s));

        const [current, prior] = await Promise.all([
          server.factorEngine.calculateExposures(resolvedSymbols, prices),
          priorResolvedSymbols.length > 0
            ? server.factorEngine.calculateExposures(priorResolvedSymbols, priorPrices)
            : Promise.resolve(new Map<string, unknown[]>()),
        ]);

        const benchmark = prices.get('SPY') ?? [];
        const priorBenchmark = priorPrices.get('SPY') ?? [];

        return {
          success: true,
          data: {
            current: Object.fromEntries(current),
            prior: Object.fromEntries(prior),
            window,
            asOfDate: lastBarDate(benchmark),
            priorDate: lastBarDate(priorBenchmark),
          },
          meta: {
            timestamp: new Date(),
            requestId: request.id,
            latencyMs: Date.now() - start,
            ...(skipped.length > 0 ? { skipped } : {}),
          },
        };
      } catch (error) {
        logger.error({ err: error }, 'Factor history calculation failed');
        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? `Factor history calculation failed: ${error.message}` : 'Factor history calculation failed' },
        });
      }
    }
  );

  // ─── Attribution helpers ───────────────────────────────────────────

  interface AttributionPosition {
    symbol: string;
    shares: number;
    weight: number;
    costBasis: number;
    currentPrice: number;
  }

  const PERIOD_DAYS: Record<string, number> = {
    '1W': 7,
    '1M': 30,
    '3M': 90,
    '6M': 180,
    '1Y': 365,
    YTD: Math.floor(
      (new Date().getTime() - new Date(new Date().getFullYear(), 0, 1).getTime()) /
        (1000 * 60 * 60 * 24)
    ),
  };

  const BENCHMARK_RETURNS: Record<string, number> = {
    '1W': 0.005,
    '1M': 0.02,
    '3M': 0.05,
    '6M': 0.08,
    '1Y': 0.12,
    YTD: 0.08,
  };

  const SECTOR_MAP: Record<string, string> = {
    NVDA: 'Technology',
    AAPL: 'Technology',
    MSFT: 'Technology',
    GOOGL: 'Technology',
    META: 'Technology',
    AMD: 'Technology',
    AMZN: 'Consumer Discretionary',
    TSLA: 'Consumer Discretionary',
    JPM: 'Financials',
    V: 'Financials',
    JNJ: 'Healthcare',
    UNH: 'Healthcare',
  };

  const BENCHMARK_SECTOR_WEIGHTS: Record<string, number> = {
    Technology: 0.28,
    Financials: 0.13,
    Healthcare: 0.13,
    'Consumer Discretionary': 0.10,
    'Consumer Staples': 0.07,
    Industrials: 0.09,
    Energy: 0.05,
    Materials: 0.03,
    Utilities: 0.03,
    'Real Estate': 0.03,
    Communications: 0.06,
  };

  async function fetchHistoricalReturns(
    symbol: string,
    days: number,
    apiKey: string
  ): Promise<number | null> {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const from = startDate.toISOString().split('T')[0];
      const to = endDate.toISOString().split('T')[0];

      const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${from}/${to}?adjusted=true&sort=asc&apiKey=${apiKey}`;

      const response = await fetch(url);
      if (!response.ok) return null;

      const data = (await response.json()) as PolygonAggsResponse;
      if (data.status !== 'OK' || !data.results || data.results.length < 2) {
        return null;
      }

      const firstClose = data.results[0].c;
      const lastClose = data.results[data.results.length - 1].c;

      return (lastClose - firstClose) / firstClose;
    } catch (error) {
      logger.error({ err: error, symbol }, 'Failed to fetch historical returns');
      return null;
    }
  }

  function generateMockReturn(symbol: string, days: number): number {
    const hash = symbol.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    const annualReturn = (hash % 30 - 10) / 100; // -10% to +20%
    const periodReturn = annualReturn * (days / 365);
    const volatility = (hash % 10) / 100;
    const noise = (Math.sin(hash * days) * volatility) / 2;
    return periodReturn + noise;
  }

  // GET /api/v1/portfolio/attribution
  fastify.get<{
    Querystring: { period?: string; symbols?: string };
  }>(
    '/api/v1/portfolio/attribution',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const start = Date.now();
      const period = (request.query.period as string) || '1M';
      const days = PERIOD_DAYS[period] || 30;

      const symbolsParam = request.query.symbols as string | undefined;
      const symbols = symbolsParam
        ? symbolsParam.split(',').map((s) => s.trim().toUpperCase())
        : ['NVDA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN'];

      const positions: AttributionPosition[] = symbols.map((symbol) => ({
        symbol,
        shares: 100,
        weight: 1 / symbols.length,
        costBasis: 100,
        currentPrice: 100,
      }));

      const polygonKey = process.env.POLYGON_API_KEY;
      let dataSource: 'mock' | 'live' = 'mock';

      const portfolioPositions = await Promise.all(
        positions.map(async (pos) => {
          let periodReturn: number | null = null;

          if (polygonKey && process.env.NODE_ENV === 'production') {
            periodReturn = await fetchHistoricalReturns(pos.symbol, days, polygonKey);
            if (periodReturn !== null) {
              dataSource = 'live';
            }
          }

          if (periodReturn === null) {
            periodReturn = generateMockReturn(pos.symbol, days);
          }

          return { symbol: pos.symbol, weight: pos.weight, return: periodReturn };
        })
      );

      const benchmarkReturn = BENCHMARK_RETURNS[period] || 0.02;
      const benchmarkPositions = Object.entries(BENCHMARK_SECTOR_WEIGHTS).map(([sector, weight]) => ({
        symbol: sector,
        weight,
        return: benchmarkReturn * (0.8 + Math.random() * 0.4),
        sector,
      }));

      const techWeight = portfolioPositions
        .filter((p) => ['NVDA', 'AAPL', 'MSFT', 'GOOGL', 'META', 'AMD'].includes(p.symbol))
        .reduce((sum, p) => sum + p.weight, 0);

      const factorExposures = [
        { factor: 'market', exposure: 1.0 + (techWeight - 0.28) * 0.3 },
        { factor: 'momentum', exposure: 0.2 + techWeight * 0.3 },
        { factor: 'quality', exposure: 0.15 + techWeight * 0.2 },
        { factor: 'size', exposure: -0.1 - techWeight * 0.2 },
        { factor: 'value', exposure: -0.1 - techWeight * 0.3 },
      ];

      const factorReturns: Record<string, number> = {
        market: benchmarkReturn,
        momentum: benchmarkReturn * 0.8,
        quality: benchmarkReturn * 0.5,
        size: benchmarkReturn * -0.3,
        value: benchmarkReturn * 0.2,
      };

      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const attribution = PerformanceAttribution.calculateAttribution(
        portfolioPositions.map((p) => ({
          ...p,
          sector: SECTOR_MAP[p.symbol] || 'Other',
        })),
        benchmarkPositions,
        factorExposures,
        factorReturns,
        {
          start: startDate.toISOString().split('T')[0],
          end: endDate.toISOString().split('T')[0],
          label: period,
        }
      );

      reply.header('X-Data-Source', dataSource);
      return {
        success: true,
        data: attribution,
        dataSource,
        meta: {
          timestamp: new Date(),
          requestId: request.id,
          latencyMs: Date.now() - start,
          period,
          positionCount: positions.length,
        },
      };
    }
  );

  // POST /api/v1/portfolio/attribution
  fastify.post<{
    Body: { positions: AttributionPosition[]; period?: string };
  }>(
    '/api/v1/portfolio/attribution',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const start = Date.now();
      const period = request.body.period || '1M';
      const days = PERIOD_DAYS[period] || 30;
      const positions = request.body.positions;

      const polygonKey = process.env.POLYGON_API_KEY;
      let dataSource: 'mock' | 'live' = 'mock';

      const portfolioPositions = await Promise.all(
        positions.map(async (pos) => {
          let periodReturn: number | null = null;

          if (polygonKey && process.env.NODE_ENV === 'production') {
            periodReturn = await fetchHistoricalReturns(pos.symbol, days, polygonKey);
            if (periodReturn !== null) {
              dataSource = 'live';
            }
          }

          if (periodReturn === null) {
            periodReturn = generateMockReturn(pos.symbol, days);
          }

          return { symbol: pos.symbol, weight: pos.weight, return: periodReturn };
        })
      );

      const benchmarkReturn = BENCHMARK_RETURNS[period] || 0.02;
      const benchmarkPositions = Object.entries(BENCHMARK_SECTOR_WEIGHTS).map(([sector, weight]) => ({
        symbol: sector,
        weight,
        return: benchmarkReturn * (0.8 + Math.random() * 0.4),
        sector,
      }));

      const techWeight = portfolioPositions
        .filter((p) => ['NVDA', 'AAPL', 'MSFT', 'GOOGL', 'META', 'AMD'].includes(p.symbol))
        .reduce((sum, p) => sum + p.weight, 0);

      const factorExposures = [
        { factor: 'market', exposure: 1.0 + (techWeight - 0.28) * 0.3 },
        { factor: 'momentum', exposure: 0.2 + techWeight * 0.3 },
        { factor: 'quality', exposure: 0.15 + techWeight * 0.2 },
        { factor: 'size', exposure: -0.1 - techWeight * 0.2 },
        { factor: 'value', exposure: -0.1 - techWeight * 0.3 },
      ];

      const factorReturns: Record<string, number> = {
        market: benchmarkReturn,
        momentum: benchmarkReturn * 0.8,
        quality: benchmarkReturn * 0.5,
        size: benchmarkReturn * -0.3,
        value: benchmarkReturn * 0.2,
      };

      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const attribution = PerformanceAttribution.calculateAttribution(
        portfolioPositions.map((p) => ({
          ...p,
          sector: SECTOR_MAP[p.symbol] || 'Other',
        })),
        benchmarkPositions,
        factorExposures,
        factorReturns,
        {
          start: startDate.toISOString().split('T')[0],
          end: endDate.toISOString().split('T')[0],
          label: period,
        }
      );

      reply.header('X-Data-Source', dataSource);
      return {
        success: true,
        data: attribution,
        dataSource,
        meta: {
          timestamp: new Date(),
          requestId: request.id,
          latencyMs: Date.now() - start,
          period,
          positionCount: positions.length,
        },
      };
    }
  );

  // ─── Risk helpers ──────────────────────────────────────────────────

  interface RiskPosition {
    symbol: string;
    shares: number;
    avg_cost: number;
  }

  interface RiskMetrics {
    var95: number;
    cvar95: number;
    sharpeRatio: number;
    sortinoRatio: number;
    volatility: number;
    maxDrawdown: number;
    beta: number;
    informationRatio: number;
    tailRisk: number;
    probPositive: number;
  }

  async function fetchHistoricalPrices(
    symbols: string[],
    apiKey: string,
    days: number = 252
  ): Promise<Map<string, number[]>> {
    const pricesMap = new Map<string, number[]>();
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days * 1.5);

    const promises = symbols.map(async (symbol) => {
      try {
        const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${startDate.toISOString().split('T')[0]}/${endDate.toISOString().split('T')[0]}?adjusted=true&sort=asc&limit=500&apiKey=${apiKey}`;

        const response = await fetch(url);
        if (!response.ok) return;

        const data = (await response.json()) as PolygonAggsResponse;
        if (data.results) {
          const closes = data.results.map((r) => r.c);
          pricesMap.set(symbol, closes);
        }
      } catch (error) {
        logger.error({ err: error, symbol }, 'Failed to fetch prices');
      }
    });

    await Promise.all(promises);
    return pricesMap;
  }

  function calculateReturns(prices: number[]): number[] {
    const returns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      if (prices[i - 1] > 0) {
        returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
      }
    }
    return returns;
  }

  function calculatePortfolioReturns(
    positions: RiskPosition[],
    pricesMap: Map<string, number[]>
  ): number[] {
    const minLength = Math.min(
      ...positions.map((p) => (pricesMap.get(p.symbol) || []).length)
    );

    if (minLength < 2) return [];

    const values: number[] = positions.map((p) => {
      const prices = pricesMap.get(p.symbol) || [];
      const latestPrice = prices[prices.length - 1] || p.avg_cost;
      return p.shares * latestPrice;
    });

    const totalValue = values.reduce((a, b) => a + b, 0);
    const weights = values.map((v) => v / totalValue);

    const portfolioReturns: number[] = [];

    for (let i = 1; i < minLength; i++) {
      let portfolioReturn = 0;

      for (let j = 0; j < positions.length; j++) {
        const symbol = positions[j].symbol;
        const prices = pricesMap.get(symbol) || [];

        if (prices[i] && prices[i - 1] && prices[i - 1] > 0) {
          const assetReturn = (prices[i] - prices[i - 1]) / prices[i - 1];
          portfolioReturn += weights[j] * assetReturn;
        }
      }

      portfolioReturns.push(portfolioReturn);
    }

    return portfolioReturns;
  }

  function runMonteCarloSimulation(
    historicalReturns: number[],
    simulations: number = 10000,
    horizon: number = 252
  ): { annualReturns: number[]; var95: number; cvar95: number; probPositive: number } {
    if (historicalReturns.length === 0) {
      return { annualReturns: [], var95: 0, cvar95: 0, probPositive: 0.5 };
    }

    const annualReturns: number[] = [];

    for (let sim = 0; sim < simulations; sim++) {
      let cumReturn = 1;

      for (let day = 0; day < horizon; day++) {
        const randomIdx = Math.floor(Math.random() * historicalReturns.length);
        cumReturn *= 1 + historicalReturns[randomIdx];
      }

      annualReturns.push(cumReturn - 1);
    }

    annualReturns.sort((a, b) => a - b);

    const var95Idx = Math.floor(0.05 * simulations);
    const var95 = annualReturns[var95Idx];

    const cvar95Returns = annualReturns.slice(0, var95Idx);
    const cvar95 =
      cvar95Returns.length > 0
        ? cvar95Returns.reduce((a, b) => a + b, 0) / cvar95Returns.length
        : var95;

    const probPositive = annualReturns.filter((r) => r > 0).length / simulations;

    return { annualReturns, var95, cvar95, probPositive };
  }

  function calculateRiskMetrics(
    portfolioReturns: number[],
    benchmarkReturns: number[] = [],
    riskFreeRate: number = 0.05
  ): RiskMetrics {
    if (portfolioReturns.length === 0) {
      return {
        var95: 0,
        cvar95: 0,
        sharpeRatio: 0,
        sortinoRatio: 0,
        volatility: 0,
        maxDrawdown: 0,
        beta: 1,
        informationRatio: 0,
        tailRisk: 0,
        probPositive: 0.5,
      };
    }

    const n = portfolioReturns.length;
    const meanReturn = portfolioReturns.reduce((a, b) => a + b, 0) / n;
    const annualizedReturn = meanReturn * 252;

    const variance =
      portfolioReturns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / (n - 1);
    const dailyVol = Math.sqrt(variance);
    const annualizedVol = dailyVol * Math.sqrt(252);

    const dailyRf = riskFreeRate / 252;
    const sharpeRatio =
      annualizedVol > 0 ? (annualizedReturn - riskFreeRate) / annualizedVol : 0;

    const negativeReturns = portfolioReturns.filter((r) => r < dailyRf);
    const downsideVariance =
      negativeReturns.length > 0
        ? negativeReturns.reduce((sum, r) => sum + Math.pow(r - dailyRf, 2), 0) / negativeReturns.length
        : 0;
    const downsideDeviation = Math.sqrt(downsideVariance) * Math.sqrt(252);
    const sortinoRatio =
      downsideDeviation > 0 ? (annualizedReturn - riskFreeRate) / downsideDeviation : 0;

    let maxDrawdown = 0;
    let peak = 1;
    let cumValue = 1;

    for (const r of portfolioReturns) {
      cumValue *= 1 + r;
      if (cumValue > peak) {
        peak = cumValue;
      }
      const drawdown = (peak - cumValue) / peak;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    let beta = 1;
    if (benchmarkReturns.length >= n) {
      const benchMean = benchmarkReturns.slice(0, n).reduce((a, b) => a + b, 0) / n;
      let covariance = 0;
      let benchVariance = 0;

      for (let i = 0; i < n; i++) {
        covariance += (portfolioReturns[i] - meanReturn) * (benchmarkReturns[i] - benchMean);
        benchVariance += Math.pow(benchmarkReturns[i] - benchMean, 2);
      }

      covariance /= n - 1;
      benchVariance /= n - 1;

      beta = benchVariance > 0 ? covariance / benchVariance : 1;
    }

    const mc = runMonteCarloSimulation(portfolioReturns, 10000, 252);

    const worst1Percent = Math.floor(mc.annualReturns.length * 0.01);
    const tailRisk =
      worst1Percent > 0
        ? mc.annualReturns.slice(0, worst1Percent).reduce((a, b) => a + b, 0) / worst1Percent
        : mc.var95;

    let informationRatio = 0;
    if (benchmarkReturns.length >= n) {
      const excessReturns: number[] = [];
      for (let i = 0; i < n; i++) {
        excessReturns.push(portfolioReturns[i] - benchmarkReturns[i]);
      }
      const excessMean = excessReturns.reduce((a, b) => a + b, 0) / n;
      const trackingError = Math.sqrt(
        excessReturns.reduce((sum, r) => sum + Math.pow(r - excessMean, 2), 0) / (n - 1)
      );
      informationRatio =
        trackingError > 0 ? (excessMean * 252) / (trackingError * Math.sqrt(252)) : 0;
    }

    return {
      var95: Math.abs(mc.var95),
      cvar95: Math.abs(mc.cvar95),
      sharpeRatio: parseFloat(sharpeRatio.toFixed(2)),
      sortinoRatio: parseFloat(sortinoRatio.toFixed(2)),
      volatility: parseFloat(annualizedVol.toFixed(4)),
      maxDrawdown: parseFloat(maxDrawdown.toFixed(4)),
      beta: parseFloat(beta.toFixed(2)),
      informationRatio: parseFloat(informationRatio.toFixed(2)),
      tailRisk: Math.abs(tailRisk),
      probPositive: mc.probPositive,
    };
  }

  function generateMockBenchmarkReturns(days: number): number[] {
    const returns: number[] = [];
    for (let i = 0; i < days; i++) {
      returns.push((Math.random() - 0.48) * 0.02);
    }
    return returns;
  }

  // GET /api/v1/portfolio/risk
  fastify.get(
    '/api/v1/portfolio/risk',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const start = Date.now();

      try {
        // Get user's portfolio
        const { data: portfolio, error: portfolioError } = await supabaseAdmin
          .from('frontier_portfolios')
          .select('id')
          .eq('user_id', request.user.id)
          .single();

        if (portfolioError || !portfolio) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Portfolio not found' },
          });
        }

        // Get positions
        const { data: positions, error: positionsError } = await supabaseAdmin
          .from('frontier_positions')
          .select('symbol, shares, avg_cost')
          .eq('portfolio_id', portfolio.id);

        if (positionsError) {
          logger.error({ err: positionsError }, 'Positions fetch error');
          return reply.status(500).send({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Failed to load portfolio positions' },
          });
        }

        if (!positions || positions.length === 0) {
          reply.header('X-Data-Source', 'live');
          return {
            success: true,
            data: {
              var95: 0,
              cvar95: 0,
              sharpeRatio: 0,
              sortinoRatio: 0,
              volatility: 0,
              maxDrawdown: 0,
              beta: 1,
              informationRatio: 0,
              tailRisk: 0,
              probPositive: 0.5,
            },
            dataSource: 'live' as const,
            meta: {
              timestamp: new Date(),
              requestId: request.id,
              latencyMs: Date.now() - start,
            },
          };
        }

        // Fetch historical prices
        const apiKey = process.env.POLYGON_API_KEY;
        let pricesMap = new Map<string, number[]>();
        let dataSource: 'mock' | 'live' = 'mock';

        if (apiKey) {
          pricesMap = await fetchHistoricalPrices(
            positions.map((p) => p.symbol),
            apiKey,
            252
          );

          if (pricesMap.size > 0) {
            dataSource = 'live';
          }
        }

        // Generate mock prices if no real data
        if (pricesMap.size === 0) {
          for (const pos of positions) {
            const mockPrices: number[] = [];
            let price = pos.avg_cost;

            for (let i = 0; i < 252; i++) {
              price *= 1 + (Math.random() - 0.48) * 0.03;
              mockPrices.push(price);
            }

            pricesMap.set(pos.symbol, mockPrices);
          }
        }

        // Calculate portfolio returns
        const portfolioReturns = calculatePortfolioReturns(positions, pricesMap);

        // Get benchmark returns (SPY)
        let benchmarkReturns: number[] = [];
        if (apiKey) {
          const benchPrices = await fetchHistoricalPrices(['SPY'], apiKey, 252);
          const spyPrices = benchPrices.get('SPY') || [];
          benchmarkReturns = calculateReturns(spyPrices);
        }

        if (benchmarkReturns.length === 0) {
          benchmarkReturns = generateMockBenchmarkReturns(portfolioReturns.length);
        }

        // Calculate risk metrics
        const metrics = calculateRiskMetrics(portfolioReturns, benchmarkReturns, 0.05);

        reply.header('X-Data-Source', dataSource);
        return {
          success: true,
          data: metrics,
          dataSource,
          meta: {
            timestamp: new Date(),
            requestId: request.id,
            latencyMs: Date.now() - start,
            dataPoints: portfolioReturns.length,
            simulations: 10000,
          },
        };
      } catch (error: unknown) {
        logger.error({ err: error }, 'Risk calculation error');

        const errorMessage = error instanceof Error ? error.message : '';
        const isExternalError =
          errorMessage.includes('fetch') ||
          errorMessage.includes('network') ||
          errorMessage.includes('timeout') ||
          errorMessage.includes('Polygon') ||
          errorMessage.includes('ECONNREFUSED') ||
          errorMessage.includes('ETIMEDOUT');

        if (isExternalError) {
          return reply.status(503).send({
            success: false,
            error: {
              code: 'SERVICE_UNAVAILABLE',
              message: 'External data service temporarily unavailable. Please try again.',
            },
            meta: {
              timestamp: new Date(),
              requestId: request.id,
              latencyMs: Date.now() - start,
            },
          });
        }

        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? `Risk calculation failed: ${error.message}` : 'Risk calculation failed' },
        });
      }
    }
  );

  // ─── Portfolio Share ───────────────────────────────────────────────

  // GET /api/v1/portfolio/share/:id
  fastify.get<{
    Params: { id: string };
  }>(
    '/api/v1/portfolio/share/:id',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const start = Date.now();
      const { id } = request.params;

      if (!id) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Share ID is required' },
        });
      }

      try {
        const { data: share, error: shareError } = await supabaseAdmin
          .from('frontier_portfolio_shares')
          .select(`
            id,
            portfolio_id,
            share_token,
            permissions,
            shared_with_email,
            created_at,
            expires_at,
            access_count,
            accessed_at,
            frontier_portfolios!inner (
              id,
              name,
              user_id
            )
          `)
          .eq('id', id)
          .single();

        if (shareError || !share) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Share not found' },
          });
        }

        // Verify user owns the portfolio
        if ((share as unknown as ShareWithPortfolio).frontier_portfolios?.user_id !== request.user.id) {
          return reply.status(403).send({
            success: false,
            error: { code: 'FORBIDDEN', message: 'You do not have permission to view this share' },
          });
        }

        const baseUrl = process.env.FRONTEND_URL || 'https://frontier-alpha.vercel.app';

        return {
          success: true,
          data: {
            id: share.id,
            portfolioId: share.portfolio_id,
            portfolioName: (share as unknown as ShareWithPortfolio).frontier_portfolios?.name || 'Unknown',
            shareUrl: `${baseUrl}/shared/${share.share_token}`,
            permissions: share.permissions,
            sharedWithEmail: share.shared_with_email,
            createdAt: share.created_at,
            expiresAt: share.expires_at,
            accessCount: share.access_count,
            lastAccessed: share.accessed_at,
            isExpired: share.expires_at ? new Date(share.expires_at) < new Date() : false,
          },
          meta: {
            timestamp: new Date(),
            requestId: request.id,
            latencyMs: Date.now() - start,
          },
        };
      } catch (error) {
        logger.error({ err: error }, 'Portfolio share fetch error');
        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch share' },
        });
      }
    }
  );

  // DELETE /api/v1/portfolio/share/:id
  fastify.delete<{
    Params: { id: string };
  }>(
    '/api/v1/portfolio/share/:id',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const start = Date.now();
      const { id } = request.params;

      if (!id) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Share ID is required' },
        });
      }

      try {
        // Get the share and verify ownership
        const { data: share, error: shareError } = await supabaseAdmin
          .from('frontier_portfolio_shares')
          .select(`
            id,
            portfolio_id,
            frontier_portfolios!inner (
              user_id
            )
          `)
          .eq('id', id)
          .single();

        if (shareError || !share) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Share not found' },
          });
        }

        // Verify user owns the portfolio
        if ((share as unknown as ShareWithPortfolio).frontier_portfolios?.user_id !== request.user.id) {
          return reply.status(403).send({
            success: false,
            error: { code: 'FORBIDDEN', message: 'You do not have permission to revoke this share' },
          });
        }

        // Delete the share
        const { error: deleteError } = await supabaseAdmin
          .from('frontier_portfolio_shares')
          .delete()
          .eq('id', id);

        if (deleteError) {
          logger.error({ err: deleteError }, 'Share deletion error');
          return reply.status(500).send({
            success: false,
            error: { code: 'DB_ERROR', message: 'Failed to revoke share' },
          });
        }

        return {
          success: true,
          data: { id, revoked: true },
          meta: {
            timestamp: new Date(),
            requestId: request.id,
            latencyMs: Date.now() - start,
          },
        };
      } catch (error) {
        logger.error({ err: error }, 'Portfolio share deletion error');
        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Failed to revoke share' },
        });
      }
    }
  );
}
