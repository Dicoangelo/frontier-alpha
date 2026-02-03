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

import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';

import { FactorEngine } from './factors/FactorEngine.js';
import { PortfolioOptimizer } from './optimizer/PortfolioOptimizer.js';
import { CognitiveExplainer } from './core/CognitiveExplainer.js';
import { EarningsOracle } from './core/EarningsOracle.js';
import { MarketDataProvider } from './data/MarketDataProvider.js';
import { authMiddleware, optionalAuthMiddleware } from './middleware/auth.js';
import { portfolioService } from './services/PortfolioService.js';
import { supabaseAdmin } from './lib/supabase.js';

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

  // In-memory portfolio state (fallback for unauthenticated requests)
  private currentPortfolio: Portfolio | null = null;
  private useDatabase: boolean = !!process.env.SUPABASE_SERVICE_KEY;

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
    // Portfolio Endpoints (Protected)
    // ========================================

    this.app.get<{ Reply: APIResponse<any> }>(
      '/api/v1/portfolio',
      { preHandler: this.useDatabase ? authMiddleware : undefined },
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
      Reply: APIResponse<any>;
    }>(
      '/api/v1/portfolio/positions',
      { preHandler: authMiddleware },
      async (request, reply) => {
        const start = Date.now();
        const { symbol, shares, avgCost } = request.body;

        if (!request.user) {
          return reply.status(401).send({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
          });
        }

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
              error: { code: 'ADD_FAILED', message: 'Failed to add position' },
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
        } catch (error: any) {
          return reply.status(500).send({
            success: false,
            error: { code: 'SERVER_ERROR', message: error.message },
          });
        }
      }
    );

    // Update position
    this.app.put<{
      Params: { id: string };
      Body: { shares: number; avgCost: number };
      Reply: APIResponse<any>;
    }>(
      '/api/v1/portfolio/positions/:id',
      { preHandler: authMiddleware },
      async (request, reply) => {
        const start = Date.now();
        const { id } = request.params;
        const { shares, avgCost } = request.body;

        if (!request.user) {
          return reply.status(401).send({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
          });
        }

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
        } catch (error: any) {
          return reply.status(500).send({
            success: false,
            error: { code: 'SERVER_ERROR', message: error.message },
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

        if (!request.user) {
          return reply.status(401).send({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
          });
        }

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
        } catch (error: any) {
          return reply.status(500).send({
            success: false,
            error: { code: 'SERVER_ERROR', message: error.message },
          });
        }
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
          // Request 300 days to ensure enough data for momentum calculations (need 252 + 21 + buffer)
          for (const symbol of [...symbols, 'SPY']) {
            const symbolPrices = await this.dataProvider.getHistoricalPrices(symbol, 300);
            prices.set(symbol, symbolPrices);
            console.log(`[FACTORS] ${symbol}: fetched ${symbolPrices.length} prices`);
          }

          const exposures = await this.factorEngine.calculateExposures(symbols, prices);
          console.log(`[FACTORS] Calculated exposures for ${exposures.size} symbols`);

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
    // User Settings Endpoints (Protected)
    // ========================================

    this.app.get<{ Reply: APIResponse<any> }>(
      '/api/v1/settings',
      { preHandler: authMiddleware },
      async (request, reply) => {
        const start = Date.now();

        if (!request.user) {
          return reply.status(401).send({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
          });
        }

        const { data, error } = await supabaseAdmin
          .from('frontier_user_settings')
          .select('*')
          .eq('user_id', request.user.id)
          .single();

        if (error && error.code !== 'PGRST116') {
          return reply.status(500).send({
            success: false,
            error: { code: 'FETCH_ERROR', message: error.message },
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
      Reply: APIResponse<any>;
    }>(
      '/api/v1/settings',
      { preHandler: authMiddleware },
      async (request, reply) => {
        const start = Date.now();

        if (!request.user) {
          return reply.status(401).send({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
          });
        }

        const { data, error } = await supabaseAdmin
          .from('frontier_user_settings')
          .upsert({
            user_id: request.user.id,
            ...request.body,
          })
          .select()
          .single();

        if (error) {
          return reply.status(500).send({
            success: false,
            error: { code: 'UPDATE_ERROR', message: error.message },
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

    this.app.get<{ Reply: APIResponse<any[]> }>(
      '/api/v1/alerts',
      { preHandler: authMiddleware },
      async (request, reply) => {
        const start = Date.now();

        if (!request.user) {
          return reply.status(401).send({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
          });
        }

        const { data, error } = await supabaseAdmin
          .from('frontier_risk_alerts')
          .select('*')
          .eq('user_id', request.user.id)
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) {
          return reply.status(500).send({
            success: false,
            error: { code: 'FETCH_ERROR', message: error.message },
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
      Reply: APIResponse<any>;
    }>(
      '/api/v1/alerts/:id/acknowledge',
      { preHandler: authMiddleware },
      async (request, reply) => {
        const start = Date.now();
        const { id } = request.params;

        if (!request.user) {
          return reply.status(401).send({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
          });
        }

        const { data, error } = await supabaseAdmin
          .from('frontier_risk_alerts')
          .update({ acknowledged_at: new Date().toISOString() })
          .eq('id', id)
          .eq('user_id', request.user.id)
          .select()
          .single();

        if (error) {
          return reply.status(500).send({
            success: false,
            error: { code: 'UPDATE_ERROR', message: error.message },
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
    // WebSocket for Real-time Quotes
    // ========================================

    this.app.get('/ws/quotes', { websocket: true }, (connection: any, req) => {
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
