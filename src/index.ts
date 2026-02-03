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

import type {
  APIResponse,
  Portfolio,
  OptimizationConfig,
  OptimizationResult,
  Quote,
  EarningsImpactForecast,
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
  private earningsOracle: EarningsOracle;
  private dataProvider: MarketDataProvider;
  private config: ServerConfig;

  // In-memory portfolio state (in production: use database)
  private currentPortfolio: Portfolio | null = null;

  constructor(config: Partial<ServerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Initialize components
    this.factorEngine = new FactorEngine();
    this.optimizer = new PortfolioOptimizer(this.factorEngine);
    this.explainer = new CognitiveExplainer();
    this.earningsOracle = new EarningsOracle();
    this.dataProvider = new MarketDataProvider({
      polygonApiKey: this.config.polygonApiKey,
      alphaVantageApiKey: this.config.alphaVantageApiKey,
    });

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
  }

  private setupRoutes() {
    // ========================================
    // Health Check
    // ========================================
    this.app.get('/health', async () => {
      return { status: 'ok', timestamp: new Date().toISOString() };
    });

    // ========================================
    // Portfolio Endpoints
    // ========================================
    
    this.app.get<{ Reply: APIResponse<Portfolio> }>(
      '/api/v1/portfolio',
      async (request, reply) => {
        const start = Date.now();
        
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

    this.app.post<{
      Body: { symbols: string[]; config: OptimizationConfig };
      Reply: APIResponse<OptimizationResult>;
    }>(
      '/api/v1/portfolio/optimize',
      async (request, reply) => {
        const start = Date.now();
        const { symbols, config } = request.body;

        try {
          // Fetch prices for all symbols
          const prices = new Map<string, any[]>();
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
              weights: Object.fromEntries(result.weights) as any,
            },
            meta: {
              timestamp: new Date(),
              requestId: request.id,
              latencyMs: Date.now() - start,
            },
          };
        } catch (error: any) {
          return reply.status(500).send({
            success: false,
            error: { code: 'OPTIMIZATION_ERROR', message: error.message },
          });
        }
      }
    );

    this.app.get<{
      Params: { symbols: string };
      Reply: APIResponse<any>;
    }>(
      '/api/v1/portfolio/factors/:symbols',
      async (request, reply) => {
        const start = Date.now();
        const symbols = request.params.symbols.split(',');

        try {
          const prices = new Map<string, any[]>();
          for (const symbol of [...symbols, 'SPY']) {
            const symbolPrices = await this.dataProvider.getHistoricalPrices(symbol, 252);
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
        } catch (error: any) {
          return reply.status(500).send({
            success: false,
            error: { code: 'FACTOR_ERROR', message: error.message },
          });
        }
      }
    );

    // ========================================
    // Quote Endpoints
    // ========================================

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
      Reply: APIResponse<any[]>;
    }>(
      '/api/v1/earnings/upcoming',
      async (request, reply) => {
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
          const prices = new Map<string, any[]>();
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
        } catch (error: any) {
          return reply.status(500).send({
            success: false,
            error: { code: 'FORECAST_ERROR', message: error.message },
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
      Reply: APIResponse<any>;
    }>(
      '/api/v1/portfolio/explain',
      async (request, reply) => {
        const start = Date.now();
        const { symbol, oldWeight, newWeight } = request.body;

        try {
          // Get factor exposures
          const prices = new Map<string, any[]>();
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
        } catch (error: any) {
          return reply.status(500).send({
            success: false,
            error: { code: 'EXPLAIN_ERROR', message: error.message },
          });
        }
      }
    );

    // ========================================
    // WebSocket for Real-time Quotes
    // ========================================

    this.app.get('/ws/quotes', { websocket: true }, (connection, req) => {
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
          console.error('WebSocket message error:', e);
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
      
      console.log(`
╔══════════════════════════════════════════════════════════════════╗
║  🚀 FRONTIER ALPHA - Cognitive Factor Intelligence Platform       ║
╠══════════════════════════════════════════════════════════════════╣
║  Server running on http://${this.config.host}:${this.config.port}
║  
║  API Endpoints:
║    GET  /api/v1/portfolio
║    POST /api/v1/portfolio/optimize
║    GET  /api/v1/portfolio/factors/:symbols
║    POST /api/v1/portfolio/explain
║    GET  /api/v1/quotes/:symbol
║    GET  /api/v1/earnings/upcoming
║    GET  /api/v1/earnings/forecast/:symbol
║  
║  WebSocket:
║    ws://localhost:${this.config.port}/ws/quotes
╚══════════════════════════════════════════════════════════════════╝
      `);
    } catch (err) {
      this.app.log.error(err);
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
  const server = new FrontierAlphaServer({
    port: parseInt(process.env.PORT || '3000'),
    polygonApiKey: process.env.POLYGON_API_KEY,
    alphaVantageApiKey: process.env.ALPHA_VANTAGE_API_KEY,
  });

  await server.start();

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await server.stop();
    process.exit(0);
  });
}

// Run if executed directly
if (process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js')) {
  main().catch(console.error);
}

export default FrontierAlphaServer;
