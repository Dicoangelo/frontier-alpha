/**
 * Fastify application factory.
 *
 * Exposes `buildApp()` which returns a fully-configured Fastify instance
 * (plugins registered, routes mounted, CVRF manager initialized) ready to
 * either `.listen()` for standalone server mode or `.inject()` for
 * serverless environments (Vercel catch-all).
 *
 * This is the single source of truth for the API surface — both the
 * long-running Fastify server (`src/index.ts`) and the Vercel serverless
 * catch-all (`api/[...path].ts`) delegate to it.
 */

import { readFileSync } from 'fs';
import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';

import { FactorEngine } from './factors/FactorEngine.js';
import { PortfolioOptimizer } from './optimizer/PortfolioOptimizer.js';
import { CognitiveExplainer } from './core/CognitiveExplainer.js';
import { EarningsOracle } from './core/EarningsOracle.js';
import { MarketDataProvider } from './data/MarketDataProvider.js';
import { rateLimiterMiddleware } from './middleware/rateLimiter.js';
import { ExplanationService } from './services/ExplanationService.js';
import { logger } from './observability/logger.js';
import { metrics, recordRequest } from './observability/metrics.js';

import { RegimeDetector } from './ml/RegimeDetector.js';
import { FactorAttribution } from './ml/FactorAttribution.js';
import { TrainingPipeline } from './ml/TrainingPipeline.js';

import { TaxLotTracker } from './tax/TaxLotTracker.js';
import { HarvestingScanner } from './tax/HarvestingScanner.js';
import { WashSaleDetector } from './tax/WashSaleDetector.js';
import { TaxReportGenerator } from './tax/TaxReportGenerator.js';

import { getPersistentCVRFManager } from './cvrf/PersistentCVRFManager.js';

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
import { authRoutes } from './routes/auth.js';
import { socialRoutes } from './routes/social.js';
import { websocketRoutes } from './routes/websocket.js';

const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf-8')
) as { version: string };

export interface BuildAppOptions {
  /** Include WebSocket routes (disabled in serverless mode). Default: true. */
  websockets?: boolean;
  /** Enable Fastify's built-in logger. Default: true. */
  enableLogger?: boolean;
  /** Polygon API key override (defaults to env). */
  polygonApiKey?: string;
  /** Alpha Vantage API key override (defaults to env). */
  alphaVantageApiKey?: string;
}

/**
 * Container for all application services. Passed to every route module as
 * `server` so handlers can access shared singletons without re-importing.
 */
export interface AppServer {
  factorEngine: FactorEngine;
  optimizer: PortfolioOptimizer;
  explainer: CognitiveExplainer;
  explanationService: ExplanationService;
  earningsOracle: EarningsOracle;
  dataProvider: MarketDataProvider;
  cvrfManager: Awaited<ReturnType<typeof getPersistentCVRFManager>>;
  regimeDetector: RegimeDetector;
  factorAttribution: FactorAttribution;
  trainingPipeline: TrainingPipeline;
  taxLotTracker: TaxLotTracker;
  harvestingScanner: HarvestingScanner;
  washSaleDetector: WashSaleDetector;
  taxReportGenerator: TaxReportGenerator;
}

export async function buildApp(
  opts: BuildAppOptions = {}
): Promise<{ app: FastifyInstance; server: AppServer }> {
  const { websockets = true, enableLogger = true } = opts;

  // Initialize services
  const factorEngine = new FactorEngine();
  const optimizer = new PortfolioOptimizer(factorEngine);
  const explainer = new CognitiveExplainer();
  const explanationService = new ExplanationService(explainer);
  const earningsOracle = new EarningsOracle();
  const dataProvider = new MarketDataProvider({
    polygonApiKey: opts.polygonApiKey ?? process.env.POLYGON_API_KEY,
    alphaVantageApiKey: opts.alphaVantageApiKey ?? process.env.ALPHA_VANTAGE_API_KEY,
  });
  const cvrfManager = await getPersistentCVRFManager();
  const regimeDetector = new RegimeDetector();
  const factorAttribution = new FactorAttribution();
  const trainingPipeline = new TrainingPipeline();
  const taxLotTracker = new TaxLotTracker();
  const harvestingScanner = new HarvestingScanner();
  const washSaleDetector = new WashSaleDetector();
  const taxReportGenerator = new TaxReportGenerator();

  const server: AppServer = {
    factorEngine,
    optimizer,
    explainer,
    explanationService,
    earningsOracle,
    dataProvider,
    cvrfManager,
    regimeDetector,
    factorAttribution,
    trainingPipeline,
    taxLotTracker,
    harvestingScanner,
    washSaleDetector,
    taxReportGenerator,
  };

  const app = Fastify({ logger: enableLogger });

  // --- Plugins -------------------------------------------------------------
  await app.register(cors, { origin: true });
  if (websockets) {
    await app.register(websocket);
  }

  // --- Observability hooks -------------------------------------------------
  app.addHook('onRequest', async (request, _reply) => {
    (request as unknown as Record<string, unknown>).__startTime = process.hrtime.bigint();
    (request as unknown as Record<string, unknown>).__reqLogger = logger.child({ requestId: request.id });
    ((request as unknown as Record<string, unknown>).__reqLogger as typeof logger).info({
      method: request.method,
      url: request.url,
    }, 'incoming request');
    metrics.incGauge('active_connections');
  });

  app.addHook('onResponse', async (request, reply) => {
    metrics.decGauge('active_connections');
    const startNs = (request as unknown as Record<string, unknown>).__startTime as bigint | undefined;
    const durationMs = startNs ? Number(process.hrtime.bigint() - startNs) / 1e6 : 0;
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

  app.addHook('onError', async (request, _reply, error) => {
    const reqLogger = ((request as unknown as Record<string, unknown>).__reqLogger as typeof logger | undefined) ?? logger;
    reqLogger.error({
      method: request.method,
      url: request.url,
      err: error,
    }, 'request error');
  });

  // --- Global rate limiter (skip health + websocket) ------------------------
  app.addHook('onRequest', async (request, reply) => {
    if (request.url === '/health' || request.url.startsWith('/ws/')) {
      return;
    }
    await rateLimiterMiddleware(request, reply);
  });

  // --- Route registration --------------------------------------------------
  const ctx = { server } as any;
  app.register(healthRoutes, { server, pkg } as any);
  app.register(settingsRoutes, ctx);
  app.register(alertsRoutes, ctx);
  app.register(portfolioRoutes, ctx);
  app.register(quotesRoutes, ctx);
  app.register(earningsRoutes, ctx);
  app.register(explainRoutes, ctx);
  app.register(cvrfRoutes, ctx);
  app.register(mlRoutes, ctx);
  app.register(optionsRoutes, ctx);
  app.register(taxRoutes, ctx);
  app.register(apiKeysRoutes, ctx);
  app.register(authRoutes, ctx);
  app.register(socialRoutes, ctx);
  if (websockets) {
    app.register(websocketRoutes, ctx);
  }

  await app.ready();
  return { app, server };
}
