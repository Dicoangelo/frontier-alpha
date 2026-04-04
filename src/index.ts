/**
 * FRONTIER ALPHA - API Server (standalone Fastify mode)
 *
 * Delegates application construction to `src/app.ts::buildApp()` — the
 * single source of truth shared with the Vercel serverless catch-all.
 *
 * REST + WebSocket API for the cognitive factor intelligence platform.
 */

import { readFileSync } from 'fs';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { logger } from './observability/logger.js';

const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf-8')
) as { version: string };

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

export class FrontierAlphaServer {
  private app: FastifyInstance | null = null;
  private config: ServerConfig;

  constructor(config: Partial<ServerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async start(): Promise<void> {
    try {
      const { app } = await buildApp({
        websockets: true,
        polygonApiKey: this.config.polygonApiKey,
        alphaVantageApiKey: this.config.alphaVantageApiKey,
      });
      this.app = app;

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
    } catch (err) {
      logger.error({ err }, 'Failed to start server');
      process.exit(1);
    }
  }

  async stop(): Promise<void> {
    if (this.app) {
      await this.app.close();
    }
  }
}

export async function main() {
  const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'POLYGON_API_KEY'];
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    logger.fatal({ missing: missingVars }, 'Missing required environment variables — see .env.example');
    process.exit(1);
  }

  const server = new FrontierAlphaServer({
    port: parseInt(process.env.PORT || '3000'),
    polygonApiKey: process.env.POLYGON_API_KEY,
    alphaVantageApiKey: process.env.ALPHA_VANTAGE_API_KEY,
  });

  await server.start();

  process.on('SIGINT', async () => {
    logger.info('Shutting down (SIGINT received)');
    await server.stop();
    process.exit(0);
  });
}

if (process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js')) {
  main().catch((err) => logger.fatal({ err }, 'Unhandled startup error'));
}

export default FrontierAlphaServer;

// CVRF module re-exports (consumed by tests + SDK)
export * from './cvrf/index.js';
export {
  enhanceExplanationWithCVRF,
  getCVRFOptimizationConfig,
  validateOptimizationWithCVRF,
  getCVRFRiskAssessment,
  onWalkForwardWindowComplete,
  runCVRFEnhancedTradingLoop,
} from './cvrf/integration.js';
