/**
 * FRONTIER ALPHA - API Server
 * 
 * REST + WebSocket API for the cognitive factor intelligence platform.
 * 
 * Endpoints:
 * - GET  /api/v1/portfolio           - Get current portfolio
 * - POST /api/v1/portfolio/optimize  - Run optimization
 * - GET  /api/v1/portfolio/factors   - Get factor exposures
 * - GET  /api/v1/portfolio/explain   - Get AI explanation
 * - GET  /api/v1/quotes/:symbol      - Real-time quote
 * - GET  /api/v1/earnings/upcoming   - Upcoming earnings
 * - GET  /api/v1/earnings/forecast/:symbol - Earnings impact forecast
 * 
 * WebSocket:
 * - /ws/quotes - Real-time quote streaming
 */

import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';

import { FactorEngine } from './factors/FactorEngine.js';
import { PortfolioOptimizer } from './optimizer/PortfolioOptimizer.js';
import { CognitiveExplainer } from './core/CognitiveExplainer.js';
import { EarningsOracle } from './core/EarningsOracle.js';
import { MarketDataProvider } from './data/MarketDataProvider.js';
import { authMiddleware, hashApiKey } from './middleware/auth.js';
import { rateLimiterMiddleware } from './middleware/rateLimiter.js';
import { portfolioService } from './services/PortfolioService.js';
import { sharingService, createPortfolioShare, getPortfolioShareByToken } from './services/SharingService.js';
import { leaderboardService } from './services/LeaderboardService.js';
import type { LeaderboardMetric, LeaderboardPeriod } from './services/LeaderboardService.js';
import type { SharedPortfolioVisibility } from './lib/supabase.js';
import { ExplanationService, type ExplanationRequest, type ExplanationType } from './services/ExplanationService.js';
import { supabaseAdmin } from './lib/supabase.js';
import { logger } from './observability/logger.js';
import { metrics, recordRequest } from './observability/metrics.js';
import { randomBytes } from 'crypto';

// ML Engine
import { RegimeDetector } from './ml/RegimeDetector.js';
import type { MarketRegime, RegimeDetectionResult } from './ml/RegimeDetector.js';
import { FactorAttribution } from './ml/FactorAttribution.js';
import type { FactorAttributionResult } from './ml/FactorAttribution.js';
import { TrainingPipeline } from './ml/TrainingPipeline.js';
import type { ModelStatus, ModelType } from './ml/TrainingPipeline.js';

// Options Intelligence
import { optionsDataProvider } from './options/OptionsDataProvider.js';
import { greeksCalculator } from './options/GreeksCalculator.js';
import type { OptionPosition } from './options/GreeksCalculator.js';
import { strategyBuilder } from './options/StrategyBuilder.js';
import type { StrategyType } from './options/StrategyBuilder.js';
import { ivService } from './options/ImpliedVolatility.js';

// Tax Optimization
import { TaxLotTracker } from './tax/TaxLotTracker.js';
import { HarvestingScanner } from './tax/HarvestingScanner.js';
import { WashSaleDetector } from './tax/WashSaleDetector.js';
import { TaxReportGenerator } from './tax/TaxReportGenerator.js';

// CVRF (Conceptual Verbal Reinforcement Framework)
import { CVRFManager } from './cvrf/CVRFManager.js';
import {
  getCVRFRiskAssessment,
} from './cvrf/integration.js';

import type {
  APIResponse,
  Portfolio,
  OptimizationConfig,
  Quote,
  EarningsImpactForecast,
  Price,
} from './types/index.js';

// ============================================================================
// SERVER CONFIGURATION
// ============================================================================

export interface ServerConfig {
  port: number;
  host: string;
  polygonApiKey?: string;
  alphaVantageApiKey?: string;
}

const DEFAULT_CONFIG: ServerConfig = {
  port: 3000,
  host: '0.0.0.0',
  polygonApiKey: process.env.POLYGON_API_KEY,
  alphaVantageApiKey: process.env.ALPHA_VANTAGE_API_KEY,
};

// ============================================================================
// FRONTIER ALPHA SERVER
// ============================================================================

export class FrontierAlphaServer {
  private app: FastifyInstance;
  private factorEngine: FactorEngine;
  private optimizer: PortfolioOptimizer;
  private explainer: CognitiveExplainer;
  private explanationService: ExplanationService;
  private earningsOracle: EarningsOracle;
  private dataProvider: MarketDataProvider;
  private cvrfManager: CVRFManager;
  private regimeDetector: RegimeDetector;
  private factorAttribution: FactorAttribution;
  private _trainingPipeline: TrainingPipeline;
  private taxLotTracker: TaxLotTracker;
  private harvestingScanner: HarvestingScanner;
  private washSaleDetector: WashSaleDetector;
  private taxReportGenerator: TaxReportGenerator;
  private config: ServerConfig;

  // In-memory portfolio state (fallback for unauthenticated requests)
  private currentPortfolio: Portfolio | null = null;
  private useDatabase: boolean = !!process.env.SUPABASE_SERVICE_KEY;

  constructor(config: Partial<ServerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Initialize components
    this.factorEngine = new FactorEngine();
    this.optimizer = new PortfolioOptimizer(this.factorEngine);
    this.explainer = new CognitiveExplainer();
    this.explanationService = new ExplanationService(this.explainer);
    this.earningsOracle = new EarningsOracle();
    this.dataProvider = new MarketDataProvider({
      polygonApiKey: this.config.polygonApiKey,
      alphaVantageApiKey: this.config.alphaVantageApiKey,
    });
    this.cvrfManager = new CVRFManager();
    this.regimeDetector = new RegimeDetector();
    this.factorAttribution = new FactorAttribution();
    this._trainingPipeline = new TrainingPipeline();
    this.taxLotTracker = new TaxLotTracker();
    this.harvestingScanner = new HarvestingScanner();
    this.washSaleDetector = new WashSaleDetector();
    this.taxReportGenerator = new TaxReportGenerator();

    // Initialize Fastify
    this.app = Fastify({
      logger: true,
    });

    this.setupPlugins();
    this.setupRoutes();
  }

  private async setupPlugins() {
    await this.app.register(cors, {
      origin: true,
    });

    await this.app.register(websocket);

    // --- Request logging & metrics -------------------------------------------

    // Attach a request-scoped logger with requestId
    this.app.addHook('onRequest', async (request, _reply) => {
      (request as unknown as Record<string, unknown>).__startTime = process.hrtime.bigint();
      (request as unknown as Record<string, unknown>).__reqLogger = logger.child({ requestId: request.id });
      ((request as unknown as Record<string, unknown>).__reqLogger as typeof logger).info({
        method: request.method,
        url: request.url,
      }, 'incoming request');
      metrics.incGauge('active_connections');
    });

    this.app.addHook('onResponse', async (request, reply) => {
      metrics.decGauge('active_connections');
      const startNs = (request as unknown as Record<string, unknown>).__startTime as bigint | undefined;
      const durationMs = startNs
        ? Number(process.hrtime.bigint() - startNs) / 1e6
        : 0;
      const durationSec = durationMs / 1000;

      const route = request.routeOptions?.url ?? request.url;
      recordRequest(request.method, route, reply.statusCode, durationSec);

      const reqLogger = ((request as unknown as Record<string, unknown>).__reqLogger as typeof logger | undefined) ?? logger;
      reqLogger.info({
        method: request.method,
        url: request.url,
        status: reply.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
      }, 'request completed');
    });

    this.app.addHook('onError', async (request, _reply, error) => {
      const reqLogger = ((request as unknown as Record<string, unknown>).__reqLogger as typeof logger | undefined) ?? logger;
      reqLogger.error({
        method: request.method,
        url: request.url,
        err: error,
      }, 'request error');
    });
  }

  private setupRoutes() {
    // ========================================
    // Global Rate Limiter (applied to all /api/* routes)
    // ========================================
    this.app.addHook('onRequest', async (request, reply) => {
      // Skip rate limiting for health check and websocket
      if (request.url === '/health' || request.url.startsWith('/ws/')) {
        return;
      }
      await rateLimiterMiddleware(request, reply);
    });

    // ========================================
    // Health Check
    // ========================================
    this.app.get('/health', async () => {
      return { status: 'ok', timestamp: new Date().toISOString(), version: '1.0.3-debug' };
    });

    // ========================================
    // Prometheus Metrics
    // ========================================
    this.app.get('/api/v1/metrics', async (_request, reply) => {
      reply.type('text/plain; version=0.0.4; charset=utf-8');
      return metrics.toPrometheus();
    });

    // ========================================
    // Portfolio Endpoints (Protected)
    // ========================================

    this.app.get<{ Reply: APIResponse<unknown> }>(
      '/api/v1/portfolio',
      { preHandler: authMiddleware },
      async (request, reply) => {
        const start = Date.now();

        // If using database and user is authenticated
        if (this.useDatabase && request.user) {
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
            const quote = await this.dataProvider.getQuote(position.symbol);
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
        if (!this.currentPortfolio) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'No portfolio configured' },
          });
        }

        return {
          success: true,
          data: this.currentPortfolio,
          meta: {
            timestamp: new Date(),
            requestId: request.id,
            latencyMs: Date.now() - start,
          },
        };
      }
    );

    // Add position
    this.app.post<{
      Body: { symbol: string; shares: number; avgCost: number };
      Reply: APIResponse<unknown>;
    }>(
      '/api/v1/portfolio/positions',
      { preHandler: authMiddleware },
      async (request, reply) => {
        const start = Date.now();
        const { symbol, shares, avgCost } = request.body;
        // authMiddleware ensures request.user is always defined

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
            error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
          });
        }
      }
    );

    // Update position
    this.app.put<{
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
        // authMiddleware ensures request.user is always defined

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
            error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
          });
        }
      }
    );

    // Delete position
    this.app.delete<{
      Params: { id: string };
      Reply: APIResponse<{ deleted: boolean }>;
    }>(
      '/api/v1/portfolio/positions/:id',
      { preHandler: authMiddleware },
      async (request, reply) => {
        const start = Date.now();
        const { id } = request.params;
        // authMiddleware ensures request.user is always defined

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
            error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
          });
        }
      }
    );

    this.app.post<{
      Body: { symbols: string[]; config: OptimizationConfig };
    }>(
      '/api/v1/portfolio/optimize',
      async (request, reply) => {
        const start = Date.now();
        const { symbols, config } = request.body;

        try {
          // Fetch prices for all symbols
          const prices = new Map<string, Price[]>();
          for (const symbol of [...symbols, 'SPY']) {
            const symbolPrices = await this.dataProvider.getHistoricalPrices(symbol, 252);
            prices.set(symbol, symbolPrices);
          }

          // Run optimization
          const result = await this.optimizer.optimize(symbols, prices, config);

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
          logger.error({ err: error }, 'Portfolio optimization failed');
          return reply.status(500).send({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Portfolio optimization failed' },
          });
        }
      }
    );

    this.app.get<{
      Params: { symbols: string };
      Reply: APIResponse<unknown>;
    }>(
      '/api/v1/portfolio/factors/:symbols',
      async (request, reply) => {
        const start = Date.now();
        const symbols = request.params.symbols.split(',');

        try {
          const prices = new Map<string, Price[]>();
          // Request 300 days to ensure enough data for momentum calculations (need 252 + 21 + buffer)
          for (const symbol of [...symbols, 'SPY']) {
            const symbolPrices = await this.dataProvider.getHistoricalPrices(symbol, 300);
            prices.set(symbol, symbolPrices);
          }

          const exposures = await this.factorEngine.calculateExposures(symbols, prices);

          return {
            success: true,
            data: Object.fromEntries(exposures),
            meta: {
              timestamp: new Date(),
              requestId: request.id,
              latencyMs: Date.now() - start,
            },
          };
        } catch (error) {
          logger.error({ err: error }, 'Factor calculation failed');
          return reply.status(500).send({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Factor calculation failed' },
          });
        }
      }
    );

    // ========================================
    // Quote Endpoints
    // ========================================

    // Batch quote stream — must be registered before :symbol to avoid route conflict
    this.app.get<{
      Querystring: { symbols: string; sse?: string };
    }>(
      '/api/v1/quotes/stream',
      async (request, reply) => {
        const symbolsParam = request.query.symbols;
        if (!symbolsParam) {
          return reply.status(400).send({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'Symbols parameter is required' },
          });
        }

        const symbols = symbolsParam.split(',').map((s: string) => s.trim().toUpperCase()).filter(Boolean);
        const quotes: Quote[] = [];

        for (const symbol of symbols) {
          try {
            const quote = await this.dataProvider.getQuote(symbol);
            if (quote) quotes.push(quote);
          } catch {
            // Skip symbols that fail
          }
        }

        return reply.send({
          success: true,
          data: quotes,
          meta: {
            timestamp: new Date().toISOString(),
            source: 'fastify',
            count: quotes.length,
          },
        });
      }
    );

    this.app.get<{
      Params: { symbol: string };
      Reply: APIResponse<Quote>;
    }>(
      '/api/v1/quotes/:symbol',
      async (request, reply) => {
        const start = Date.now();
        const { symbol } = request.params;

        const quote = await this.dataProvider.getQuote(symbol);

        if (!quote) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: `No quote found for ${symbol}` },
          });
        }

        return {
          success: true,
          data: quote,
          meta: {
            timestamp: new Date(),
            requestId: request.id,
            latencyMs: Date.now() - start,
          },
        };
      }
    );

    // ========================================
    // Earnings Endpoints
    // ========================================

    this.app.get<{
      Querystring: { symbols: string };
      Reply: APIResponse<unknown[]>;
    }>(
      '/api/v1/earnings/upcoming',
      async (request, _reply) => {
        const start = Date.now();
        const symbols = request.query.symbols?.split(',') || [
          'AAPL', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'JPM', 'V', 'JNJ', 'UNH'
        ];

        const earnings = await this.earningsOracle.getUpcomingEarnings(symbols, 14);

        return {
          success: true,
          data: earnings,
          meta: {
            timestamp: new Date(),
            requestId: request.id,
            latencyMs: Date.now() - start,
          },
        };
      }
    );

    this.app.get<{
      Params: { symbol: string };
      Reply: APIResponse<EarningsImpactForecast>;
    }>(
      '/api/v1/earnings/forecast/:symbol',
      async (request, reply) => {
        const start = Date.now();
        const { symbol } = request.params;

        try {
          // Get upcoming earnings
          const earnings = await this.earningsOracle.getUpcomingEarnings([symbol], 30);
          if (earnings.length === 0) {
            return reply.status(404).send({
              success: false,
              error: { code: 'NOT_FOUND', message: `No upcoming earnings for ${symbol}` },
            });
          }

          // Get factor exposures
          const prices = new Map<string, Price[]>();
          for (const s of [symbol, 'SPY']) {
            prices.set(s, await this.dataProvider.getHistoricalPrices(s, 252));
          }
          const exposures = await this.factorEngine.calculateExposures([symbol], prices);

          // Generate forecast
          const forecast = await this.earningsOracle.forecast(
            symbol,
            earnings[0],
            exposures.get(symbol) || []
          );

          return {
            success: true,
            data: forecast,
            meta: {
              timestamp: new Date(),
              requestId: request.id,
              latencyMs: Date.now() - start,
            },
          };
        } catch (error) {
          logger.error({ err: error }, 'Earnings forecast failed');
          return reply.status(500).send({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Earnings forecast failed' },
          });
        }
      }
    );

    // ========================================
    // Cognitive Explanation Endpoint
    // ========================================

    this.app.post<{
      Body: {
        symbol: string;
        oldWeight: number;
        newWeight: number;
      };
      Reply: APIResponse<unknown>;
    }>(
      '/api/v1/portfolio/explain',
      async (request, reply) => {
        const start = Date.now();
        const { symbol, oldWeight, newWeight } = request.body;

        try {
          // Get factor exposures
          const prices = new Map<string, Price[]>();
          for (const s of [symbol, 'SPY']) {
            prices.set(s, await this.dataProvider.getHistoricalPrices(s, 252));
          }
          
          const exposures = await this.factorEngine.calculateExposures([symbol], prices);
          const symbolExposures = exposures.get(symbol) || [];

          // Generate explanation
          const explanation = this.explainer.explainAllocationChange(
            symbol,
            oldWeight,
            newWeight,
            { old: symbolExposures, new: symbolExposures }
          );

          return {
            success: true,
            data: explanation,
            meta: {
              timestamp: new Date(),
              requestId: request.id,
              latencyMs: Date.now() - start,
            },
          };
        } catch (error) {
          logger.error({ err: error }, 'Explanation generation failed');
          return reply.status(500).send({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Explanation generation failed' },
          });
        }
      }
    );

    // ========================================
    // General Explanation Endpoint (LLM + Template)
    // ========================================

    const VALID_EXPLANATION_TYPES: ExplanationType[] = [
      'portfolio_move', 'rebalance', 'earnings', 'risk_alert', 'factor_shift',
    ];

    this.app.post<{
      Body: ExplanationRequest;
      Reply: APIResponse<unknown>;
    }>(
      '/api/v1/explain',
      async (request, reply) => {
        const start = Date.now();

        try {
          const { type, symbol, context } = request.body;

          if (!type || !VALID_EXPLANATION_TYPES.includes(type)) {
            return reply.status(400).send({
              success: false,
              error: {
                code: 'VALIDATION_ERROR',
                message: `Invalid explanation type. Must be one of: ${VALID_EXPLANATION_TYPES.join(', ')}`,
              },
            });
          }

          const result = await this.explanationService.generate({
            type,
            symbol,
            context,
          });

          return {
            success: true,
            data: result,
            meta: {
              timestamp: new Date(),
              requestId: request.id,
              latencyMs: Date.now() - start,
              source: result.sources.includes('ai_model') ? 'llm' : 'template',
              llmEnabled: this.explanationService.isLLMEnabled,
            },
          };
        } catch (error) {
          logger.error({ err: error }, 'Explanation generation failed');
          return reply.status(500).send({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Explanation generation failed' },
          });
        }
      }
    );

    // ========================================
    // Trade Explanation Chain-of-Thought (US-025)
    // GET /api/v1/explain/trade/:symbol
    // Cached per symbol per day
    // ========================================

    this.app.get<{
      Params: { symbol: string };
      Reply: APIResponse<unknown>;
    }>(
      '/api/v1/explain/trade/:symbol',
      async (request, reply) => {
        const start = Date.now();
        const { symbol } = request.params;

        if (!symbol || symbol.trim().length === 0) {
          return reply.status(400).send({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'Symbol is required' },
          });
        }

        try {
          const chain = await this.explanationService.explainTrade(symbol.toUpperCase());

          return {
            success: true,
            data: chain,
            meta: {
              timestamp: new Date(),
              requestId: request.id,
              latencyMs: Date.now() - start,
              cached: chain.cached,
            },
          };
        } catch (error) {
          logger.error({ err: error, symbol }, 'Trade explanation failed');
          return reply.status(500).send({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Trade explanation generation failed' },
          });
        }
      }
    );

    // ========================================
    // User Settings Endpoints (Protected)
    // ========================================

    this.app.get<{ Reply: APIResponse<unknown> }>(
      '/api/v1/settings',
      { preHandler: authMiddleware },
      async (request, reply) => {
        const start = Date.now();

        // authMiddleware ensures request.user is always defined
        const { data, error } = await supabaseAdmin
          .from('frontier_user_settings')
          .select('*')
          .eq('user_id', request.user.id)
          .single();

        if (error && error.code !== 'PGRST116') {
          logger.error({ err: error }, 'Failed to fetch user settings');
          return reply.status(500).send({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Failed to load settings' },
          });
        }

        return {
          success: true,
          data: data || {
            display_name: null,
            risk_tolerance: 'moderate',
            notifications_enabled: true,
            email_alerts: true,
            max_position_pct: 20,
            stop_loss_pct: 10,
            take_profit_pct: 25,
          },
          meta: {
            timestamp: new Date(),
            requestId: request.id,
            latencyMs: Date.now() - start,
          },
        };
      }
    );

    this.app.put<{
      Body: {
        display_name?: string;
        risk_tolerance?: 'conservative' | 'moderate' | 'aggressive';
        notifications_enabled?: boolean;
        email_alerts?: boolean;
        max_position_pct?: number;
        stop_loss_pct?: number;
        take_profit_pct?: number;
      };
      Reply: APIResponse<unknown>;
    }>(
      '/api/v1/settings',
      { preHandler: authMiddleware },
      async (request, reply) => {
        const start = Date.now();

        // authMiddleware ensures request.user is always defined
        const { data, error } = await supabaseAdmin
          .from('frontier_user_settings')
          .upsert({
            user_id: request.user.id,
            ...request.body,
          })
          .select()
          .single();

        if (error) {
          logger.error({ err: error }, 'Failed to update settings');
          return reply.status(500).send({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Failed to update settings' },
          });
        }

        return {
          success: true,
          data,
          meta: {
            timestamp: new Date(),
            requestId: request.id,
            latencyMs: Date.now() - start,
          },
        };
      }
    );

    // ========================================
    // Alerts Endpoints (Protected)
    // ========================================

    this.app.get<{ Reply: APIResponse<unknown[]> }>(
      '/api/v1/alerts',
      { preHandler: authMiddleware },
      async (request, reply) => {
        const start = Date.now();
        // authMiddleware ensures request.user is always defined

        const { data, error } = await supabaseAdmin
          .from('frontier_risk_alerts')
          .select('*')
          .eq('user_id', request.user.id)
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) {
          logger.error({ err: error }, 'Failed to fetch alerts');
          return reply.status(500).send({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Failed to load alerts' },
          });
        }

        return {
          success: true,
          data: data || [],
          meta: {
            timestamp: new Date(),
            requestId: request.id,
            latencyMs: Date.now() - start,
          },
        };
      }
    );

    this.app.put<{
      Params: { id: string };
      Reply: APIResponse<unknown>;
    }>(
      '/api/v1/alerts/:id/acknowledge',
      { preHandler: authMiddleware },
      async (request, reply) => {
        const start = Date.now();
        const { id } = request.params;
        // authMiddleware ensures request.user is always defined

        const { data, error } = await supabaseAdmin
          .from('frontier_risk_alerts')
          .update({ acknowledged_at: new Date().toISOString() })
          .eq('id', id)
          .eq('user_id', request.user.id)
          .select()
          .single();

        if (error) {
          logger.error({ err: error }, 'Failed to acknowledge alert');
          return reply.status(500).send({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Failed to acknowledge alert' },
          });
        }

        return {
          success: true,
          data,
          meta: {
            timestamp: new Date(),
            requestId: request.id,
            latencyMs: Date.now() - start,
          },
        };
      }
    );

    // ========================================
    // CVRF (Conceptual Verbal Reinforcement) Endpoints
    // ========================================

    // Get current CVRF beliefs
    this.app.get<{ Reply: APIResponse<unknown> }>(
      '/api/v1/cvrf/beliefs',
      async (request, _reply) => {
        const start = Date.now();
        const beliefs = this.cvrfManager.getCurrentBeliefs();

        return {
          success: true,
          data: {
            ...beliefs,
            factorWeights: Object.fromEntries(beliefs.factorWeights),
            factorConfidences: Object.fromEntries(beliefs.factorConfidences),
          },
          meta: {
            timestamp: new Date(),
            requestId: request.id,
            latencyMs: Date.now() - start,
          },
        };
      }
    );

    // Start new CVRF episode
    this.app.post<{ Reply: APIResponse<unknown> }>(
      '/api/v1/cvrf/episode/start',
      async (request, _reply) => {
        const start = Date.now();
        const episode = this.cvrfManager.startEpisode();

        return {
          success: true,
          data: {
            id: episode.id,
            startDate: episode.startDate,
            message: 'CVRF episode started. Record decisions and close when complete.',
          },
          meta: {
            timestamp: new Date(),
            requestId: request.id,
            latencyMs: Date.now() - start,
          },
        };
      }
    );

    // Close CVRF episode and run cycle
    this.app.post<{
      Body: { runCvrfCycle?: boolean };
      Reply: APIResponse<unknown>;
    }>(
      '/api/v1/cvrf/episode/close',
      async (request, reply) => {
        const start = Date.now();
        const { runCvrfCycle = true } = request.body || {};

        try {
          const { episode, cvrfResult } = await this.cvrfManager.closeEpisode(
            undefined,
            runCvrfCycle
          );

          return {
            success: true,
            data: {
              episode: {
                id: episode.id,
                startDate: episode.startDate,
                endDate: episode.endDate,
                decisionsCount: episode.decisions.length,
                portfolioReturn: episode.portfolioReturn,
                sharpeRatio: episode.sharpeRatio,
              },
              cvrfResult: cvrfResult ? {
                performanceDelta: cvrfResult.episodeComparison.performanceDelta,
                decisionOverlap: cvrfResult.episodeComparison.decisionOverlap,
                insightsExtracted: cvrfResult.extractedInsights.length,
                beliefUpdates: cvrfResult.beliefUpdates.length,
                newRegime: cvrfResult.newBeliefState.currentRegime,
              } : null,
            },
            meta: {
              timestamp: new Date(),
              requestId: request.id,
              latencyMs: Date.now() - start,
            },
          };
        } catch (error) {
          logger.error({ err: error }, 'CVRF episode close failed');
          return reply.status(400).send({
            success: false,
            error: { code: 'BAD_REQUEST', message: 'Failed to close CVRF episode' },
          });
        }
      }
    );

    // Record trading decision
    this.app.post<{
      Body: {
        symbol: string;
        action: 'buy' | 'sell' | 'hold' | 'rebalance';
        weightBefore: number;
        weightAfter: number;
        reason: string;
        confidence: number;
        factors?: Array<{ factor: string; exposure: number; tStat: number; confidence: number; contribution: number }>;
      };
      Reply: APIResponse<unknown>;
    }>(
      '/api/v1/cvrf/decision',
      async (request, reply) => {
        const start = Date.now();
        const { symbol, action, weightBefore, weightAfter, reason, confidence, factors } = request.body;

        try {
          const decision = this.cvrfManager.recordDecision({
            timestamp: new Date(),
            symbol,
            action,
            weightBefore,
            weightAfter,
            reason,
            confidence,
            factors: factors || [],
          });

          return {
            success: true,
            data: decision,
            meta: {
              timestamp: new Date(),
              requestId: request.id,
              latencyMs: Date.now() - start,
            },
          };
        } catch (error) {
          logger.error({ err: error }, 'Failed to record decision');
          return reply.status(400).send({
            success: false,
            error: { code: 'BAD_REQUEST', message: 'Failed to record trading decision' },
          });
        }
      }
    );

    // Get CVRF optimization constraints
    this.app.get<{ Reply: APIResponse<unknown> }>(
      '/api/v1/cvrf/constraints',
      async (request, _reply) => {
        const start = Date.now();
        const constraints = this.cvrfManager.getOptimizationConstraints();

        return {
          success: true,
          data: {
            ...constraints,
            factorTargets: Object.fromEntries(constraints.factorTargets),
          },
          meta: {
            timestamp: new Date(),
            requestId: request.id,
            latencyMs: Date.now() - start,
          },
        };
      }
    );

    // Get CVRF risk assessment
    this.app.post<{
      Body: {
        portfolioValue: number;
        portfolioReturns: number[];
        positions: Array<{ symbol: string; weight: number }>;
      };
      Reply: APIResponse<unknown>;
    }>(
      '/api/v1/cvrf/risk',
      async (request, _reply) => {
        const start = Date.now();
        const { portfolioValue, portfolioReturns, positions } = request.body;

        const assessment = getCVRFRiskAssessment(
          portfolioValue,
          portfolioReturns,
          positions,
          this.cvrfManager
        );

        return {
          success: true,
          data: assessment,
          meta: {
            timestamp: new Date(),
            requestId: request.id,
            latencyMs: Date.now() - start,
          },
        };
      }
    );

    // Get CVRF cycle history
    this.app.get<{ Reply: APIResponse<unknown> }>(
      '/api/v1/cvrf/history',
      async (request, _reply) => {
        const start = Date.now();
        const history = this.cvrfManager.getCycleHistory();

        return {
          success: true,
          data: history.map(cycle => ({
            timestamp: cycle.timestamp,
            betterEpisodeReturn: cycle.episodeComparison.betterEpisode.portfolioReturn,
            worseEpisodeReturn: cycle.episodeComparison.worseEpisode.portfolioReturn,
            performanceDelta: cycle.episodeComparison.performanceDelta,
            decisionOverlap: cycle.episodeComparison.decisionOverlap,
            insightsCount: cycle.extractedInsights.length,
            beliefUpdatesCount: cycle.beliefUpdates.length,
            newRegime: cycle.newBeliefState.currentRegime,
          })),
          meta: {
            timestamp: new Date(),
            requestId: request.id,
            latencyMs: Date.now() - start,
          },
        };
      }
    );

    // ========================================
    // ML Engine Endpoints
    // ========================================

    // GET /api/v1/ml/regime — Current regime prediction + confidence
    this.app.get<{
      Querystring: { symbols?: string };
    }>(
      '/api/v1/ml/regime',
      async (request, reply) => {
        const start = Date.now();
        const symbolsParam = request.query.symbols || 'SPY';
        const symbol = symbolsParam.split(',')[0].trim().toUpperCase();

        try {
          const prices = await this.dataProvider.getHistoricalPrices(symbol, 252);

          if (!prices || prices.length < 42) {
            return reply.status(400).send({
              success: false,
              error: {
                code: 'INSUFFICIENT_DATA',
                message: `Need at least 42 price points for regime detection, got ${prices?.length ?? 0}`,
              },
            });
          }

          const result: RegimeDetectionResult = this.regimeDetector.detectRegime(prices);

          const transitions = this.regimeDetector.getTransitionProbabilities();
          const transitionMap: Record<MarketRegime, Record<MarketRegime, number>> = {} as Record<MarketRegime, Record<MarketRegime, number>>;
          for (const t of transitions) {
            transitionMap[t.from] = t.to;
          }

          return {
            success: true,
            data: {
              regime: result.regime,
              confidence: result.confidence,
              probabilities: result.probabilities,
              transitions: transitionMap,
              symbol,
              timestamp: result.timestamp.toISOString(),
            },
            meta: {
              timestamp: new Date(),
              requestId: request.id,
              latencyMs: Date.now() - start,
            },
          };
        } catch (error) {
          logger.error({ err: error }, 'Regime detection failed');
          return reply.status(500).send({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Regime detection failed' },
          });
        }
      }
    );

    // GET /api/v1/ml/attribution — Factor importance for portfolio
    this.app.get<{
      Querystring: { symbols?: string };
    }>(
      '/api/v1/ml/attribution',
      async (request, reply) => {
        const start = Date.now();
        const symbolsParam = request.query.symbols || 'AAPL,MSFT,GOOGL';
        const symbols = symbolsParam.split(',').map((s: string) => s.trim().toUpperCase()).filter(Boolean);

        try {
          // Fetch prices and compute factor exposures
          const prices = new Map<string, Price[]>();
          for (const s of [...symbols, 'SPY']) {
            const symbolPrices = await this.dataProvider.getHistoricalPrices(s, 300);
            prices.set(s, symbolPrices);
          }

          const exposuresMap = await this.factorEngine.calculateExposures(symbols, prices);

          // Build equal-weight portfolio exposures and factor returns
          const factorExposures: Record<string, number> = {};
          const factorReturns: Record<string, number> = {};

          // Use first symbol's factors as the factor list
          const firstSymbolExposures = exposuresMap.get(symbols[0]);
          if (!firstSymbolExposures || firstSymbolExposures.length === 0) {
            return reply.status(400).send({
              success: false,
              error: {
                code: 'INSUFFICIENT_DATA',
                message: 'No factor exposures available for the given symbols',
              },
            });
          }

          for (const fe of firstSymbolExposures) {
            // Average exposure across symbols
            let totalExposure = 0;
            for (const sym of symbols) {
              const symExposures = exposuresMap.get(sym) || [];
              const matching = symExposures.find(e => e.factor === fe.factor);
              totalExposure += matching?.exposure ?? 0;
            }
            factorExposures[fe.factor] = totalExposure / symbols.length;
            // Use factor exposure as proxy for factor return (for demo/mock)
            factorReturns[fe.factor] = (totalExposure / symbols.length) * 0.01;
          }

          // Compute total portfolio return from factor model
          const totalReturn = Object.keys(factorExposures).reduce(
            (sum, f) => sum + factorExposures[f] * factorReturns[f], 0
          );

          const result: FactorAttributionResult = this.factorAttribution.calculateAttribution(
            totalReturn,
            factorExposures,
            factorReturns,
          );

          return {
            success: true,
            data: {
              totalReturn: result.totalReturn,
              factorReturn: result.factorReturn,
              residualReturn: result.residualReturn,
              factors: result.factors,
              waterfall: result.waterfall,
              summary: result.summary,
              symbols,
            },
            meta: {
              timestamp: new Date(),
              requestId: request.id,
              latencyMs: Date.now() - start,
            },
          };
        } catch (error) {
          logger.error({ err: error }, 'Factor attribution failed');
          return reply.status(500).send({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Factor attribution failed' },
          });
        }
      }
    );

    // GET /api/v1/ml/models — Model versions and status
    this.app.get<{
      Querystring: { type?: string; status?: string };
    }>(
      '/api/v1/ml/models',
      async (request, reply) => {
        const start = Date.now();
        const typeFilter = request.query.type as ModelType | undefined;
        const statusFilter = request.query.status as ModelStatus | undefined;

        try {
          // If using database, fetch from Supabase
          if (this.useDatabase) {
            let query = supabaseAdmin
              .from('frontier_model_versions')
              .select('*')
              .order('trained_at', { ascending: false })
              .limit(50);

            if (typeFilter) {
              query = query.eq('model_type', typeFilter);
            }
            if (statusFilter) {
              query = query.eq('status', statusFilter);
            }

            const { data, error } = await query;

            if (error) {
              logger.error({ err: error }, 'Failed to fetch model versions');
              return reply.status(500).send({
                success: false,
                error: { code: 'DATABASE_ERROR', message: 'Failed to fetch model versions' },
              });
            }

            return {
              success: true,
              data: {
                models: data || [],
                count: data?.length ?? 0,
              },
              meta: {
                timestamp: new Date(),
                requestId: request.id,
                latencyMs: Date.now() - start,
              },
            };
          }

          // Fallback: return in-memory mock model versions
          const mockModels: Array<{
            id: string;
            model_type: ModelType;
            version: string;
            status: ModelStatus;
            metrics: Record<string, number>;
            trained_at: string;
            data_points: number;
          }> = [
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

          let filteredModels = mockModels;
          if (typeFilter) {
            filteredModels = filteredModels.filter(m => m.model_type === typeFilter);
          }
          if (statusFilter) {
            filteredModels = filteredModels.filter(m => m.status === statusFilter);
          }

          return {
            success: true,
            data: {
              models: filteredModels,
              count: filteredModels.length,
            },
            meta: {
              timestamp: new Date(),
              requestId: request.id,
              latencyMs: Date.now() - start,
            },
          };
        } catch (error) {
          logger.error({ err: error }, 'Failed to fetch model versions');
          return reply.status(500).send({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch model versions' },
          });
        }
      }
    );

    // ========================================
    // Options Intelligence Endpoints
    // ========================================

    // GET /api/v1/options/chain — Options chain for a symbol
    this.app.get<{
      Querystring: { symbol?: string };
    }>(
      '/api/v1/options/chain',
      async (request, reply) => {
        const start = Date.now();
        const symbol = (request.query.symbol || '').trim().toUpperCase();

        if (!symbol) {
          return reply.status(400).send({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'symbol query parameter is required' },
          });
        }

        try {
          const chain = await optionsDataProvider.getOptionsChain(symbol);

          return {
            success: true,
            data: chain,
            meta: {
              timestamp: new Date(),
              requestId: request.id,
              latencyMs: Date.now() - start,
            },
          };
        } catch (error) {
          logger.error({ err: error, symbol }, 'Options chain fetch failed');
          return reply.status(500).send({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch options chain' },
          });
        }
      }
    );

    // GET /api/v1/options/greeks — Greeks for contract or portfolio
    this.app.get<{
      Querystring: {
        symbol?: string;
        strike?: string;
        expiration?: string;
        type?: string;
        underlyingPrice?: string;
        iv?: string;
      };
    }>(
      '/api/v1/options/greeks',
      async (request, reply) => {
        const start = Date.now();
        const symbol = (request.query.symbol || '').trim().toUpperCase();

        if (!symbol) {
          return reply.status(400).send({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'symbol query parameter is required' },
          });
        }

        try {
          const strike = request.query.strike ? parseFloat(request.query.strike) : undefined;
          const expiration = request.query.expiration;
          const optionType = request.query.type as 'call' | 'put' | undefined;
          const underlyingPriceParam = request.query.underlyingPrice ? parseFloat(request.query.underlyingPrice) : undefined;
          const ivParam = request.query.iv ? parseFloat(request.query.iv) : undefined;

          // Single contract mode: all params provided
          if (strike && expiration && optionType) {
            // Get underlying price from quote if not provided
            let underlyingPrice = underlyingPriceParam;
            if (!underlyingPrice) {
              const quote = await this.dataProvider.getQuote(symbol);
              underlyingPrice = quote?.last ?? 100;
            }

            const contractGreeks = greeksCalculator.calculateContractGreeks({
              symbol,
              strike,
              expiration,
              type: optionType,
              underlyingPrice,
              impliedVolatility: ivParam ?? 0.25,
            });

            return {
              success: true,
              data: { mode: 'contract', greeks: contractGreeks },
              meta: {
                timestamp: new Date(),
                requestId: request.id,
                latencyMs: Date.now() - start,
              },
            };
          }

          // Portfolio mode: fetch chain and compute portfolio-level greeks
          const chain = await optionsDataProvider.getOptionsChain(symbol);
          const quote = await this.dataProvider.getQuote(symbol);
          const underlyingPrice = underlyingPriceParam ?? quote?.last ?? 100;

          // Build positions from chain ATM contracts (first expiration)
          const positions: OptionPosition[] = [];
          if (chain.expirations.length > 0) {
            const firstExpiration = chain.expirations[0];
            const atmCalls = chain.calls
              .filter(c => c.expiration === firstExpiration)
              .sort((a, b) => Math.abs(a.strike - underlyingPrice) - Math.abs(b.strike - underlyingPrice))
              .slice(0, 3);

            for (const call of atmCalls) {
              positions.push({
                symbol,
                strike: call.strike,
                expiration: call.expiration,
                type: 'call',
                quantity: 1,
                underlyingPrice,
                impliedVolatility: call.impliedVolatility || 0.25,
              });
            }
          }

          const portfolioGreeks = greeksCalculator.calculatePortfolioGreeks(positions);

          return {
            success: true,
            data: { mode: 'portfolio', greeks: portfolioGreeks, symbol },
            meta: {
              timestamp: new Date(),
              requestId: request.id,
              latencyMs: Date.now() - start,
            },
          };
        } catch (error) {
          logger.error({ err: error, symbol }, 'Greeks calculation failed');
          return reply.status(500).send({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Greeks calculation failed' },
          });
        }
      }
    );

    // POST /api/v1/options/strategies — Analyze a strategy
    const VALID_STRATEGY_TYPES: StrategyType[] = [
      'covered_call', 'protective_put', 'bull_call_spread',
      'bear_put_spread', 'iron_condor', 'straddle', 'strangle',
    ];

    this.app.post<{
      Body: {
        type: StrategyType;
        symbol: string;
        underlyingPrice?: number;
        expiration?: string;
        strikes?: number[];
        premiums?: number[];
        iv?: number;
      };
    }>(
      '/api/v1/options/strategies',
      async (request, reply) => {
        const start = Date.now();
        const { type, symbol, underlyingPrice: bodyPrice, expiration, strikes, premiums, iv } = request.body || {};

        if (!type || !VALID_STRATEGY_TYPES.includes(type)) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: `Invalid strategy type. Must be one of: ${VALID_STRATEGY_TYPES.join(', ')}`,
            },
          });
        }

        if (!symbol) {
          return reply.status(400).send({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'symbol is required' },
          });
        }

        try {
          const quote = await this.dataProvider.getQuote(symbol.toUpperCase());
          const underlyingPrice = bodyPrice ?? quote?.last ?? 100;
          const exp = expiration || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
          const sigma = iv ?? 0.25;

          // Build strategy based on type using reasonable defaults
          const atmStrike = Math.round(underlyingPrice);
          const otmCallStrike = strikes?.[1] ?? Math.round(underlyingPrice * 1.05);
          const otmPutStrike = strikes?.[0] ?? Math.round(underlyingPrice * 0.95);
          const defaultPremium = underlyingPrice * 0.02;

          let strategy;
          switch (type) {
            case 'covered_call':
              strategy = strategyBuilder.buildCoveredCall(
                underlyingPrice, otmCallStrike, premiums?.[0] ?? defaultPremium, exp, sigma
              );
              break;
            case 'protective_put':
              strategy = strategyBuilder.buildProtectivePut(
                underlyingPrice, otmPutStrike, premiums?.[0] ?? defaultPremium, exp, sigma
              );
              break;
            case 'bull_call_spread':
              strategy = strategyBuilder.buildBullCallSpread(
                underlyingPrice, atmStrike, otmCallStrike,
                premiums?.[0] ?? defaultPremium * 1.5, premiums?.[1] ?? defaultPremium * 0.5, exp, sigma
              );
              break;
            case 'bear_put_spread':
              strategy = strategyBuilder.buildBearPutSpread(
                underlyingPrice, atmStrike, otmPutStrike,
                premiums?.[0] ?? defaultPremium * 1.5, premiums?.[1] ?? defaultPremium * 0.5, exp, sigma
              );
              break;
            case 'iron_condor':
              strategy = strategyBuilder.buildIronCondor(
                underlyingPrice,
                strikes?.[0] ?? Math.round(underlyingPrice * 0.92),
                otmPutStrike,
                otmCallStrike,
                strikes?.[3] ?? Math.round(underlyingPrice * 1.08),
                premiums?.[0] ?? defaultPremium * 0.3,
                premiums?.[1] ?? defaultPremium * 0.8,
                premiums?.[2] ?? defaultPremium * 0.8,
                premiums?.[3] ?? defaultPremium * 0.3,
                exp, sigma
              );
              break;
            case 'straddle':
              strategy = strategyBuilder.buildStraddle(
                underlyingPrice, atmStrike,
                premiums?.[0] ?? defaultPremium, premiums?.[1] ?? defaultPremium, exp, sigma
              );
              break;
            case 'strangle':
              strategy = strategyBuilder.buildStrangle(
                underlyingPrice, otmCallStrike, otmPutStrike,
                premiums?.[0] ?? defaultPremium * 0.6, premiums?.[1] ?? defaultPremium * 0.6, exp, sigma
              );
              break;
          }

          const analysis = strategyBuilder.analyzeStrategy(strategy);

          return {
            success: true,
            data: analysis,
            meta: {
              timestamp: new Date(),
              requestId: request.id,
              latencyMs: Date.now() - start,
            },
          };
        } catch (error) {
          logger.error({ err: error }, 'Strategy analysis failed');
          return reply.status(500).send({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Strategy analysis failed' },
          });
        }
      }
    );

    // GET /api/v1/options/strategies — Recommended strategies
    this.app.get<{
      Querystring: { symbol?: string; ivRank?: string; regime?: string };
    }>(
      '/api/v1/options/strategies',
      async (request, reply) => {
        const start = Date.now();
        const symbol = (request.query.symbol || '').trim().toUpperCase();
        const ivRankParam = request.query.ivRank ? parseFloat(request.query.ivRank) : undefined;
        const regimeParam = request.query.regime as 'bull' | 'bear' | 'sideways' | 'volatile' | undefined;

        if (!symbol) {
          return reply.status(400).send({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'symbol query parameter is required' },
          });
        }

        try {
          // Get IV rank from IV service if not provided
          let ivRank = ivRankParam ?? 50;
          if (ivRankParam === undefined) {
            const ivData = await ivService.getIVData(symbol);
            if (ivData) {
              ivRank = ivData.ivRank;
            }
          }

          // Default regime
          const regime = regimeParam ?? 'sideways';

          const recommendations = strategyBuilder.recommendStrategies(ivRank, regime);

          return {
            success: true,
            data: {
              symbol,
              ivRank,
              regime,
              recommendations,
            },
            meta: {
              timestamp: new Date(),
              requestId: request.id,
              latencyMs: Date.now() - start,
            },
          };
        } catch (error) {
          logger.error({ err: error }, 'Strategy recommendation failed');
          return reply.status(500).send({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Strategy recommendation failed' },
          });
        }
      }
    );

    // GET /api/v1/options/vol-surface — Volatility surface data
    this.app.get<{
      Querystring: { symbol?: string };
    }>(
      '/api/v1/options/vol-surface',
      async (request, reply) => {
        const start = Date.now();
        const symbol = (request.query.symbol || '').trim().toUpperCase();

        if (!symbol) {
          return reply.status(400).send({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'symbol query parameter is required' },
          });
        }

        try {
          const chain = await optionsDataProvider.getOptionsChain(symbol);
          const quote = await this.dataProvider.getQuote(symbol);
          const underlyingPrice = quote?.last ?? chain.underlyingPrice ?? 100;

          // Build IV grid from chain data
          const strikes = [...new Set([...chain.calls, ...chain.puts].map(o => o.strike))].sort((a, b) => a - b);
          const expirations = chain.expirations;

          const ivGrid = new Map<string, number>();
          for (const opt of [...chain.calls, ...chain.puts]) {
            const key = `${opt.strike}:${opt.expiration}`;
            if (!ivGrid.has(key) && opt.impliedVolatility > 0) {
              ivGrid.set(key, opt.impliedVolatility);
            }
          }

          // Generate heatmap with Greeks from the IV surface
          const heatmap = greeksCalculator.generateHeatmap(
            symbol,
            underlyingPrice,
            strikes,
            expirations,
            ivGrid,
          );

          // Build surface data: array of { strike, expiration, iv } points
          const surface: Array<{ strike: number; expiration: string; iv: number }> = [];
          for (const exp of expirations) {
            for (const strike of strikes) {
              const key = `${strike}:${exp}`;
              const iv = ivGrid.get(key) ?? 0.25;
              surface.push({ strike, expiration: exp, iv });
            }
          }

          return {
            success: true,
            data: {
              symbol,
              underlyingPrice,
              strikes,
              expirations,
              surface,
              heatmap,
            },
            meta: {
              timestamp: new Date(),
              requestId: request.id,
              latencyMs: Date.now() - start,
            },
          };
        } catch (error) {
          logger.error({ err: error }, 'Vol surface generation failed');
          return reply.status(500).send({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Vol surface generation failed' },
          });
        }
      }
    );

    // ========================================
    // Tax Optimization Endpoints (Protected)
    // ========================================

    // GET /api/v1/tax/lots — Get tax lots for user
    this.app.get<{
      Querystring: { symbol?: string };
    }>(
      '/api/v1/tax/lots',
      { preHandler: authMiddleware },
      async (request, reply) => {
        const start = Date.now();
        const symbol = request.query.symbol?.trim().toUpperCase();

        try {
          // If using database, fetch from Supabase
          if (this.useDatabase) {
            let query = supabaseAdmin
              .from('frontier_tax_lots')
              .select('*')
              .eq('user_id', request.user.id)
              .order('purchase_date', { ascending: false });

            if (symbol) {
              query = query.eq('symbol', symbol);
            }

            const { data, error } = await query;

            if (error) {
              logger.error({ err: error }, 'Failed to fetch tax lots');
              return reply.status(500).send({
                success: false,
                error: { code: 'DATABASE_ERROR', message: 'Failed to fetch tax lots' },
              });
            }

            return {
              success: true,
              data: {
                lots: data || [],
                count: data?.length ?? 0,
              },
              meta: {
                timestamp: new Date(),
                requestId: request.id,
                latencyMs: Date.now() - start,
              },
            };
          }

          // Fallback: in-memory tracker
          const openLots = this.taxLotTracker.getOpenLots(request.user.id, symbol);
          const allLots = symbol
            ? this.taxLotTracker.getAllLots(request.user.id).filter(l => l.symbol === symbol)
            : this.taxLotTracker.getAllLots(request.user.id);

          return {
            success: true,
            data: {
              lots: allLots.map(lot => ({
                ...lot,
                purchaseDate: lot.purchaseDate.toISOString(),
                soldDate: lot.soldDate?.toISOString() ?? null,
                isOpen: openLots.some(o => o.id === lot.id),
                holdingDays: this.taxLotTracker.getHoldingPeriodDays(lot),
                isShortTerm: lot.soldDate
                  ? this.taxLotTracker.isShortTermHolding(lot.purchaseDate, lot.soldDate)
                  : this.taxLotTracker.isShortTermHolding(lot.purchaseDate, new Date()),
              })),
              count: allLots.length,
            },
            meta: {
              timestamp: new Date(),
              requestId: request.id,
              latencyMs: Date.now() - start,
            },
          };
        } catch (error) {
          logger.error({ err: error }, 'Failed to fetch tax lots');
          return reply.status(500).send({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch tax lots' },
          });
        }
      }
    );

    // GET /api/v1/tax/harvest — Get harvesting opportunities
    this.app.get<{
      Querystring: { symbols?: string };
    }>(
      '/api/v1/tax/harvest',
      { preHandler: authMiddleware },
      async (request, reply) => {
        const start = Date.now();

        try {
          // Build current prices from quotes
          const symbolsParam = request.query.symbols || 'AAPL,MSFT,GOOGL,NVDA,AMZN';
          const symbols = symbolsParam.split(',').map((s: string) => s.trim().toUpperCase()).filter(Boolean);
          const currentPrices = new Map<string, number>();

          for (const sym of symbols) {
            const quote = await this.dataProvider.getQuote(sym);
            if (quote) {
              currentPrices.set(sym, quote.last);
            }
          }

          const result = this.harvestingScanner.scan(
            this.taxLotTracker,
            request.user.id,
            currentPrices
          );

          return {
            success: true,
            data: {
              opportunities: result.opportunities.map(o => ({
                ...o,
                lots: o.lots.map(l => ({
                  ...l,
                  purchaseDate: l.purchaseDate.toISOString(),
                })),
              })),
              totalUnrealizedLosses: result.totalUnrealizedLosses,
              totalEstimatedTaxSavings: result.totalEstimatedTaxSavings,
              scannedPositions: result.scannedPositions,
              qualifyingPositions: result.qualifyingPositions,
            },
            meta: {
              timestamp: new Date(),
              requestId: request.id,
              latencyMs: Date.now() - start,
            },
          };
        } catch (error) {
          logger.error({ err: error }, 'Harvesting scan failed');
          return reply.status(500).send({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Harvesting scan failed' },
          });
        }
      }
    );

    // POST /api/v1/tax/harvest — Execute a harvest (sell loss position)
    this.app.post<{
      Body: {
        symbol: string;
        shares: number;
        salePrice: number;
        method?: 'fifo' | 'lifo' | 'specific';
        lotIds?: string[];
      };
    }>(
      '/api/v1/tax/harvest',
      { preHandler: authMiddleware },
      async (request, reply) => {
        const start = Date.now();
        const { symbol, shares, salePrice, method, lotIds } = request.body || {};

        if (!symbol || !shares || !salePrice) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'symbol, shares, and salePrice are required',
            },
          });
        }

        try {
          const result = this.taxLotTracker.sellShares(
            request.user.id,
            symbol.toUpperCase(),
            shares,
            salePrice,
            new Date(),
            method || 'fifo',
            lotIds
          );

          return {
            success: true,
            data: {
              totalProceeds: result.totalProceeds,
              totalCostBasis: result.totalCostBasis,
              realizedGain: result.realizedGain,
              isShortTerm: result.isShortTerm,
              events: result.events.map(e => ({
                ...e,
                saleDate: e.saleDate.toISOString(),
              })),
            },
            meta: {
              timestamp: new Date(),
              requestId: request.id,
              latencyMs: Date.now() - start,
            },
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Harvest execution failed';
          logger.error({ err: error }, 'Harvest execution failed');
          return reply.status(400).send({
            success: false,
            error: { code: 'BAD_REQUEST', message },
          });
        }
      }
    );

    // GET /api/v1/tax/wash-sales — Get wash sale warnings
    this.app.get(
      '/api/v1/tax/wash-sales',
      { preHandler: authMiddleware },
      async (request, reply) => {
        const start = Date.now();

        try {
          const result = this.washSaleDetector.scanTransactionHistory(
            this.taxLotTracker,
            request.user.id
          );

          return {
            success: true,
            data: {
              violations: result.violations.map(v => ({
                ...v,
                saleDate: v.saleDate.toISOString(),
                replacementDate: v.replacementDate.toISOString(),
              })),
              totalDisallowedLosses: result.totalDisallowedLosses,
              totalAdjustedCostBasis: result.totalAdjustedCostBasis,
              scannedEvents: result.scannedEvents,
              violationCount: result.violationCount,
            },
            meta: {
              timestamp: new Date(),
              requestId: request.id,
              latencyMs: Date.now() - start,
            },
          };
        } catch (error) {
          logger.error({ err: error }, 'Wash sale scan failed');
          return reply.status(500).send({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Wash sale scan failed' },
          });
        }
      }
    );

    // GET /api/v1/tax/report — Get annual tax report
    this.app.get<{
      Querystring: { year?: string; format?: string };
    }>(
      '/api/v1/tax/report',
      { preHandler: authMiddleware },
      async (request, reply) => {
        const start = Date.now();
        const taxYear = request.query.year
          ? parseInt(request.query.year, 10)
          : new Date().getFullYear();
        const format = request.query.format || 'json';

        if (isNaN(taxYear) || taxYear < 2000 || taxYear > 2100) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'year must be a valid year between 2000 and 2100',
            },
          });
        }

        try {
          // Build current prices for harvesting scanner (optional enhancement)
          const currentPrices = new Map<string, number>();
          const openLots = this.taxLotTracker.getOpenLots(request.user.id);
          const openSymbols = [...new Set(openLots.map(l => l.symbol))];

          for (const sym of openSymbols) {
            const quote = await this.dataProvider.getQuote(sym);
            if (quote) {
              currentPrices.set(sym, quote.last);
            }
          }

          const report = this.taxReportGenerator.generateReport(
            this.taxLotTracker,
            request.user.id,
            taxYear,
            this.washSaleDetector,
            this.harvestingScanner,
            currentPrices
          );

          // Export in requested format
          if (format === 'csv') {
            const csv = this.taxReportGenerator.exportCSV(report);
            reply.type('text/csv');
            reply.header('Content-Disposition', `attachment; filename="tax-report-${taxYear}.csv"`);
            return csv;
          }

          return {
            success: true,
            data: report,
            meta: {
              timestamp: new Date(),
              requestId: request.id,
              latencyMs: Date.now() - start,
            },
          };
        } catch (error) {
          logger.error({ err: error }, 'Tax report generation failed');
          return reply.status(500).send({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Tax report generation failed' },
          });
        }
      }
    );

    // ========================================
    // API Key Management Endpoints (Protected)
    // ========================================

    // List user's API keys
    this.app.get<{ Reply: APIResponse<unknown[]> }>(
      '/api/v1/api-keys',
      { preHandler: authMiddleware },
      async (request, reply) => {
        const start = Date.now();
        // authMiddleware ensures request.user is always defined

        const { data, error } = await supabaseAdmin
          .from('frontier_api_keys')
          .select('id, name, permissions, rate_limit, created_at, last_used_at, revoked_at')
          .eq('user_id', request.user.id)
          .order('created_at', { ascending: false });

        if (error) {
          logger.error({ err: error }, 'Failed to fetch API keys');
          return reply.status(500).send({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Failed to load API keys' },
          });
        }

        // Fetch usage stats per key
        const keysWithStats = await Promise.all(
          (data || []).map(async (key) => {
            const { count } = await supabaseAdmin
              .from('frontier_api_key_usage')
              .select('*', { count: 'exact', head: true })
              .eq('api_key_id', key.id);

            return {
              ...key,
              usage_count: count || 0,
            };
          })
        );

        return {
          success: true,
          data: keysWithStats,
          meta: {
            timestamp: new Date(),
            requestId: request.id,
            latencyMs: Date.now() - start,
          },
        };
      }
    );

    // Create new API key
    this.app.post<{
      Body: { name: string; permissions?: Record<string, boolean>; rate_limit?: number };
      Reply: APIResponse<unknown>;
    }>(
      '/api/v1/api-keys',
      { preHandler: authMiddleware },
      async (request, reply) => {
        const start = Date.now();
        // authMiddleware ensures request.user is always defined

        const { name, permissions, rate_limit } = request.body;

        if (!name || name.trim().length === 0) {
          return reply.status(400).send({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'Key name is required' },
          });
        }

        // Generate a unique API key with fa_ prefix
        const rawKey = `fa_${randomBytes(32).toString('hex')}`;
        const keyHash = hashApiKey(rawKey);

        const { data, error } = await supabaseAdmin
          .from('frontier_api_keys')
          .insert({
            user_id: request.user.id,
            key_hash: keyHash,
            name: name.trim(),
            permissions: permissions || { read: true, write: false },
            rate_limit: rate_limit || 1000,
          })
          .select('id, name, permissions, rate_limit, created_at')
          .single();

        if (error) {
          logger.error({ err: error }, 'Failed to create API key');
          return reply.status(500).send({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Failed to create API key' },
          });
        }

        return {
          success: true,
          data: {
            ...data,
            // Return the raw key ONLY on creation -- it will never be shown again
            key: rawKey,
          },
          meta: {
            timestamp: new Date(),
            requestId: request.id,
            latencyMs: Date.now() - start,
          },
        };
      }
    );

    // Revoke an API key
    this.app.delete<{
      Params: { id: string };
      Reply: APIResponse<{ revoked: boolean }>;
    }>(
      '/api/v1/api-keys/:id',
      { preHandler: authMiddleware },
      async (request, reply) => {
        const start = Date.now();
        const { id } = request.params;
        // authMiddleware ensures request.user is always defined

        const { data, error } = await supabaseAdmin
          .from('frontier_api_keys')
          .update({ revoked_at: new Date().toISOString() })
          .eq('id', id)
          .eq('user_id', request.user.id)
          .is('revoked_at', null)
          .select()
          .single();

        if (error || !data) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'API key not found or already revoked' },
          });
        }

        return {
          success: true,
          data: { revoked: true },
          meta: {
            timestamp: new Date(),
            requestId: request.id,
            latencyMs: Date.now() - start,
          },
        };
      }
    );

    // ========================================
    // Portfolio Sharing Endpoints
    // ========================================

    // POST /api/v1/portfolios/share — Share a portfolio
    this.app.post<{
      Body: {
        portfolio_data: Record<string, unknown>;
        visibility?: SharedPortfolioVisibility;
      };
    }>(
      '/api/v1/portfolios/share',
      { preHandler: authMiddleware },
      async (request, reply) => {
        const start = Date.now();

        const { portfolio_data, visibility } = request.body || {};

        if (!portfolio_data || typeof portfolio_data !== 'object') {
          reply.code(400);
          return {
            data: null,
            error: 'portfolio_data is required and must be an object',
            meta: {
              timestamp: new Date(),
              requestId: request.id,
              latencyMs: Date.now() - start,
            },
          };
        }

        const shared = await sharingService.sharePortfolio(request.user!.id, {
          portfolio_data,
          visibility,
        });

        if (!shared) {
          reply.code(500);
          return {
            data: null,
            error: 'Failed to share portfolio',
            meta: {
              timestamp: new Date(),
              requestId: request.id,
              latencyMs: Date.now() - start,
            },
          };
        }

        reply.code(201);
        return {
          data: shared,
          meta: {
            timestamp: new Date(),
            requestId: request.id,
            latencyMs: Date.now() - start,
          },
        };
      }
    );

    // GET /api/v1/portfolios/shared/:token — Get a shared portfolio by token
    this.app.get<{
      Params: { token: string };
    }>(
      '/api/v1/portfolios/shared/:token',
      async (request, reply) => {
        const start = Date.now();

        const { token } = request.params;

        // Extract requester ID if authenticated (optional)
        let requesterId: string | undefined;
        const authHeader = request.headers.authorization;
        if (authHeader?.startsWith('Bearer ')) {
          // Try to get user from token — don't fail if not authenticated
          try {
            const userToken = authHeader.slice(7);
            const { data: { user } } = await supabaseAdmin.auth.getUser(userToken);
            if (user) {
              requesterId = user.id;
            }
          } catch {
            // Not authenticated — that's fine for public/private shares
          }
        }

        const shared = await sharingService.getSharedByToken(token, requesterId);

        if (!shared) {
          reply.code(404);
          return {
            data: null,
            error: 'Shared portfolio not found or access denied',
            meta: {
              timestamp: new Date(),
              requestId: request.id,
              latencyMs: Date.now() - start,
            },
          };
        }

        return {
          data: shared,
          meta: {
            timestamp: new Date(),
            requestId: request.id,
            latencyMs: Date.now() - start,
          },
        };
      }
    );

    // ========================================
    // Token-Based Portfolio Sharing (US-010)
    // POST /api/v1/portfolio/share   — create encrypted share token
    // GET  /api/v1/portfolio/shared/:token — retrieve snapshot by token
    // ========================================

    // POST /api/v1/portfolio/share
    this.app.post<{
      Body: { snapshot_json: Record<string, unknown> };
    }>(
      '/api/v1/portfolio/share',
      { preHandler: authMiddleware },
      async (request, reply) => {
        const start = Date.now();
        const { snapshot_json } = request.body || {};

        if (!snapshot_json || typeof snapshot_json !== 'object') {
          reply.code(400);
          return {
            data: null,
            error: { code: 'VALIDATION_ERROR', message: 'snapshot_json is required and must be an object' },
            meta: { timestamp: new Date(), requestId: request.id, latencyMs: Date.now() - start },
          };
        }

        const origin = `${request.protocol}://${request.hostname}`;
        const result = await createPortfolioShare(request.user!.id, snapshot_json, origin);

        if (!result) {
          reply.code(500);
          return {
            data: null,
            error: { code: 'INTERNAL_ERROR', message: 'Failed to create share link' },
            meta: { timestamp: new Date(), requestId: request.id, latencyMs: Date.now() - start },
          };
        }

        reply.code(201);
        return {
          data: result,
          meta: { timestamp: new Date(), requestId: request.id, latencyMs: Date.now() - start },
        };
      }
    );

    // GET /api/v1/portfolio/shared/:token
    this.app.get<{ Params: { token: string } }>(
      '/api/v1/portfolio/shared/:token',
      async (request, reply) => {
        const start = Date.now();
        const { token } = request.params;

        // Old base64 tokens are 88+ chars; new hex tokens are exactly 32 chars
        if (!/^[0-9a-f]{32}$/.test(token)) {
          reply.code(404);
          return {
            data: null,
            error: { code: 'NOT_FOUND', message: 'This link has expired' },
            meta: { timestamp: new Date(), requestId: request.id, latencyMs: Date.now() - start },
          };
        }

        const snapshot = await getPortfolioShareByToken(token);

        if (!snapshot) {
          reply.code(404);
          return {
            data: null,
            error: { code: 'NOT_FOUND', message: 'Shared portfolio not found or has expired' },
            meta: { timestamp: new Date(), requestId: request.id, latencyMs: Date.now() - start },
          };
        }

        return {
          data: snapshot,
          meta: { timestamp: new Date(), requestId: request.id, latencyMs: Date.now() - start },
        };
      }
    );

    // ========================================
    // Leaderboard Endpoint
    // ========================================

    const VALID_METRICS: LeaderboardMetric[] = ['sharpe', 'total_return', 'risk_adjusted_return', 'consistency'];
    const VALID_PERIODS: LeaderboardPeriod[] = ['1w', '1m', '3m', 'ytd', 'all'];

    this.app.get<{
      Querystring: { metric?: string; period?: string; user_id?: string };
    }>(
      '/api/v1/leaderboard',
      async (request, reply) => {
        const start = Date.now();

        const metric = (request.query.metric || 'sharpe') as LeaderboardMetric;
        const period = (request.query.period || '1m') as LeaderboardPeriod;
        const userId = request.query.user_id;

        if (!VALID_METRICS.includes(metric)) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: `Invalid metric. Must be one of: ${VALID_METRICS.join(', ')}`,
            },
          });
        }

        if (!VALID_PERIODS.includes(period)) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: `Invalid period. Must be one of: ${VALID_PERIODS.join(', ')}`,
            },
          });
        }

        try {
          if (userId) {
            const entry = await leaderboardService.getUserRank(userId, metric, period);
            if (!entry) {
              return reply.status(404).send({
                success: false,
                error: { code: 'NOT_FOUND', message: 'User not found on leaderboard' },
              });
            }
            return {
              success: true,
              data: entry,
              meta: {
                timestamp: new Date(),
                requestId: request.id,
                latencyMs: Date.now() - start,
              },
            };
          }

          const result = await leaderboardService.getLeaderboard(metric, period);

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
          logger.error({ err: error }, 'Leaderboard query failed');
          return reply.status(500).send({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Leaderboard query failed' },
          });
        }
      }
    );

    // ========================================
    // WebSocket for Real-time Quotes
    // ========================================

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.app.get('/ws/quotes', { websocket: true }, (connection: any, _req: any) => {
      const symbols = new Set<string>();

      connection.socket.on('message', async (message: Buffer) => {
        try {
          const data = JSON.parse(message.toString());

          if (data.type === 'subscribe') {
            for (const symbol of data.symbols || []) {
              symbols.add(symbol);
            }

            // Start streaming quotes
            const unsubscribe = await this.dataProvider.subscribeQuotes(
              Array.from(symbols),
              (quote) => {
                connection.socket.send(JSON.stringify({
                  type: 'quote',
                  data: quote,
                }));
              }
            );

            connection.socket.on('close', () => {
              unsubscribe();
            });
          }
        } catch (e) {
          logger.error({ err: e }, 'WebSocket message error');
        }
      });
    });
  }

  async start(): Promise<void> {
    try {
      await this.app.listen({
        port: this.config.port,
        host: this.config.host,
      });
      
      logger.info({
        host: this.config.host,
        port: this.config.port,
        environment: process.env.NODE_ENV || 'development',
        version: '1.0.3-debug',
      }, 'Frontier Alpha server started');

      logger.info({
        host: this.config.host,
        port: this.config.port,
        endpoints: [
          'GET  /api/v1/portfolio',
          'POST /api/v1/portfolio/optimize',
          'GET  /api/v1/portfolio/factors/:symbols',
          'GET  /api/v1/cvrf/beliefs',
          'GET  /api/v1/ml/regime',
          'GET  /api/v1/ml/attribution',
          'GET  /api/v1/ml/models',
          'GET  /api/v1/options/chain',
          'GET  /api/v1/options/greeks',
          'POST /api/v1/options/strategies',
          'GET  /api/v1/options/strategies',
          'GET  /api/v1/options/vol-surface',
          'GET  /api/v1/tax/lots',
          'GET  /api/v1/tax/harvest',
          'POST /api/v1/tax/harvest',
          'GET  /api/v1/tax/wash-sales',
          'GET  /api/v1/tax/report',
          'GET  /api/v1/leaderboard',
          'GET  /api/v1/quotes/:symbol',
          'GET  /api/v1/earnings/upcoming',
          `ws://localhost:${this.config.port}/ws/quotes`,
        ],
      }, 'Frontier Alpha startup complete — CVRF + ML + Options + Tax enabled');
    } catch (err) {
      logger.error({ err }, 'Failed to start server');
      process.exit(1);
    }
  }

  async stop(): Promise<void> {
    await this.app.close();
  }
}

// ============================================================================
// ENTRY POINT
// ============================================================================

export async function main() {
  // Validate critical environment variables on startup
  const requiredEnvVars = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_KEY',
    'POLYGON_API_KEY',
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    logger.error({ missing: missingVars }, 'Missing required environment variables');
    logger.fatal({ missing: missingVars }, 'Missing required environment variables — see .env.example');
    process.exit(1);
  }

  const server = new FrontierAlphaServer({
    port: parseInt(process.env.PORT || '3000'),
    polygonApiKey: process.env.POLYGON_API_KEY,
    alphaVantageApiKey: process.env.ALPHA_VANTAGE_API_KEY,
  });

  await server.start();

  // Graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('Shutting down (SIGINT received)');
    await server.stop();
    process.exit(0);
  });
}

// Run if executed directly
if (process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js')) {
  main().catch((err) => logger.fatal({ err }, 'Unhandled startup error'));
}

export default FrontierAlphaServer;

// ============================================================================
// CVRF MODULE EXPORTS
// ============================================================================

export * from './cvrf/index.js';
export {
  enhanceExplanationWithCVRF,
  getCVRFOptimizationConfig,
  validateOptimizationWithCVRF,
  getCVRFRiskAssessment,
  onWalkForwardWindowComplete,
  runCVRFEnhancedTradingLoop,
} from './cvrf/integration.js';
