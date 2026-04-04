import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth.js';
import { subscriptionGate, requirePlan } from '../middleware/subscriptionGate.js';
import { optionsDataProvider } from '../options/OptionsDataProvider.js';
import { greeksCalculator } from '../options/GreeksCalculator.js';
import type { OptionPosition } from '../options/GreeksCalculator.js';
import { strategyBuilder } from '../options/StrategyBuilder.js';
import type { StrategyType } from '../options/StrategyBuilder.js';
import { ivService } from '../options/ImpliedVolatility.js';
import { logger } from '../observability/logger.js';

interface RouteContext {
  server: {
    dataProvider: { getQuote(symbol: string): Promise<{ last: number } | null> };
  };
}

export async function optionsRoutes(fastify: FastifyInstance, opts: RouteContext) {
  const { server } = opts;

  // Pro-only: auth + subscription gate for all options routes
  fastify.addHook('preHandler', authMiddleware);
  fastify.addHook('preHandler', subscriptionGate);
  fastify.addHook('preHandler', requirePlan('pro'));

  // GET /api/v1/options/chain
  fastify.get<{
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

  // GET /api/v1/options/greeks
  fastify.get<{
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
            const quote = await server.dataProvider.getQuote(symbol);
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
        const quote = await server.dataProvider.getQuote(symbol);
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

  fastify.post<{
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
        const quote = await server.dataProvider.getQuote(symbol.toUpperCase());
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
  fastify.get<{
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

  // GET /api/v1/options/vol-surface
  fastify.get<{
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
        const quote = await server.dataProvider.getQuote(symbol);
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
}
