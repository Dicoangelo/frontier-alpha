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

import { readFileSync } from 'fs';
import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8')) as { version: string };

import { FactorEngine } from './factors/FactorEngine.js';
import { PortfolioOptimizer } from './optimizer/PortfolioOptimizer.js';
import { CognitiveExplainer } from './core/CognitiveExplainer.js';
import { EarningsOracle } from './core/EarningsOracle.js';
import { MarketDataProvider } from './data/MarketDataProvider.js';
import { rateLimiterMiddleware } from './middleware/rateLimiter.js';
import { ExplanationService } from './services/ExplanationService.js';
import { logger } from './observability/logger.js';
import { metrics, recordRequest } from './observability/metrics.js';

// ML Engine
import { RegimeDetector } from './ml/RegimeDetector.js';
import { FactorAttribution } from './ml/FactorAttribution.js';
import { TrainingPipeline } from './ml/TrainingPipeline.js';

// Tax Optimization
import { TaxLotTracker } from './tax/TaxLotTracker.js';
import { HarvestingScanner } from './tax/HarvestingScanner.js';
import { WashSaleDetector } from './tax/WashSaleDetector.js';
import { TaxReportGenerator } from './tax/TaxReportGenerator.js';

// CVRF (Conceptual Verbal Reinforcement Framework)
import { CVRFManager } from './cvrf/CVRFManager.js';

import type { Portfolio } from './types/index.js';

// Route modules
import { healthRoutes } from './routes/health.js';
import { settingsRoutes } from './routes/settings.js';
import { alertsRoutes } from './routes/alerts.js';
import { portfolioRoutes } from './routes/portfolio.js';
import { quotesRoutes } from './routes/quotes.js';
import { earningsRoutes } from './routes/earnings.js';
import { explainRoutes } from './routes/explain.js';
import { cvrfRoutes } from './routes/cvrf.js';
import { mlRoutes } from './routes/ml.js';
import { optionsRoutes } from './routes/options.js';
import { taxRoutes } from './routes/tax.js';
import { apiKeysRoutes } from './routes/api-keys.js';
import { socialRoutes } from './routes/social.js';
import { websocketRoutes } from './routes/websocket.js';

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
    // Register route modules
    // ========================================
    const server = this as any;

    this.app.register(healthRoutes, { server, pkg } as any);
    this.app.register(settingsRoutes, { server } as any);
    this.app.register(alertsRoutes, { server } as any);
    this.app.register(portfolioRoutes, { server } as any);
    this.app.register(quotesRoutes, { server } as any);
    this.app.register(earningsRoutes, { server } as any);
    this.app.register(explainRoutes, { server } as any);
    this.app.register(cvrfRoutes, { server } as any);
    this.app.register(mlRoutes, { server } as any);
    this.app.register(optionsRoutes, { server } as any);
    this.app.register(taxRoutes, { server } as any);
    this.app.register(apiKeysRoutes, { server } as any);
    this.app.register(socialRoutes, { server } as any);
    this.app.register(websocketRoutes, { server } as any);
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
        version: pkg.version,
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
