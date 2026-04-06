import type { FastifyInstance } from 'fastify';
import axios from 'axios';
import { authMiddleware } from '../middleware/auth.js';
import { subscriptionGate, requirePlan } from '../middleware/subscriptionGate.js';
import { optionsDataProvider } from '../options/OptionsDataProvider.js';
import { greeksCalculator } from '../options/GreeksCalculator.js';
import type { OptionPosition } from '../options/GreeksCalculator.js';
import { strategyBuilder } from '../options/StrategyBuilder.js';
import type { StrategyType } from '../options/StrategyBuilder.js';
import { ivService } from '../options/ImpliedVolatility.js';
import { logger } from '../observability/logger.js';

// IV endpoint caches
const ivCache = new Map<string, { data: any; timestamp: number }>();
const hvCache = new Map<string, { data: any; timestamp: number }>();
const IV_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const HV_CACHE_TTL = 60 * 60 * 1000; // 1 hour

function calculateHistoricalVolatility(prices: number[], days: number): number {
  if (prices.length < days + 1) return 0;
  const slice = prices.slice(0, days + 1);
  const logReturns: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    if (slice[i - 1] > 0 && slice[i] > 0) {
      logReturns.push(Math.log(slice[i] / slice[i - 1]));
    }
  }
  if (logReturns.length === 0) return 0;
  const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
  const variance = logReturns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (logReturns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}

async function fetchHistoricalPrices(symbol: string): Promise<number[]> {
  const cached = hvCache.get(symbol);
  if (cached && Date.now() - cached.timestamp < HV_CACHE_TTL) {
    return cached.data;
  }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`;
    const response = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 10000,
    });

    const result = response.data?.chart?.result?.[0];
    if (!result?.indicators?.quote?.[0]?.close) {
      return [];
    }

    const closes: number[] = result.indicators.quote[0].close.filter((p: any) => p != null);
    hvCache.set(symbol, { data: closes, timestamp: Date.now() });
    return closes;
  } catch (error) {
    logger.warn({ err: error, symbol }, 'Failed to fetch historical prices from Yahoo');
    return [];
  }
}

interface IVResult {
  symbol: string;
  currentPrice: number;
  iv: number;
  ivRank: number;
  ivPercentile: number;
  hv30: number;
  hv60: number;
  hv90: number;
  ivvsHV: number;
  putCallRatio: number;
  skew: number;
  termStructure: Array<{ expiration: string; iv: number }>;
  expectedMoves: {
    weekly: number;
    monthly: number;
    quarterly: number;
    earnings: number;
  };
  signal: string;
  recommendation: string;
  source: string;
}

async function fetchIVData(symbol: string): Promise<IVResult> {
  const cached = ivCache.get(symbol);
  if (cached && Date.now() - cached.timestamp < IV_CACHE_TTL) {
    return cached.data;
  }

  try {
    // Parallel fetch: options chain + historical prices
    const [optionsResponse, historicalPrices] = await Promise.all([
      axios.get(
        `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}`,
        { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 }
      ).catch(() => null),
      fetchHistoricalPrices(symbol),
    ]);

    const optionsData = optionsResponse?.data?.optionChain?.result?.[0];
    const currentPrice = optionsData?.quote?.regularMarketPrice || 0;

    if (!optionsData?.options?.[0]) {
      // No options data — fall back to HV-based estimate
      if (historicalPrices.length > 30) {
        return getHVBasedIVData(symbol, historicalPrices, currentPrice);
      }
      return getDefaultIVData(symbol, currentPrice);
    }

    const options = optionsData.options[0];
    const calls = options.calls || [];
    const puts = options.puts || [];

    // Calculate ATM IV
    let atmIV = 0.25;
    if (calls.length > 0 && currentPrice > 0) {
      const sortedCalls = [...calls].sort(
        (a: any, b: any) => Math.abs(a.strike - currentPrice) - Math.abs(b.strike - currentPrice)
      );
      const atmCall = sortedCalls[0];
      if (atmCall?.impliedVolatility) {
        atmIV = atmCall.impliedVolatility;
      }
    }

    // Historical volatility at multiple windows
    const hv30 = historicalPrices.length > 31 ? calculateHistoricalVolatility(historicalPrices, 30) : atmIV * 0.85;
    const hv60 = historicalPrices.length > 61 ? calculateHistoricalVolatility(historicalPrices, 60) : atmIV * 0.82;
    const hv90 = historicalPrices.length > 91 ? calculateHistoricalVolatility(historicalPrices, 90) : atmIV * 0.80;

    // Put/Call ratio
    const totalCallOI = calls.reduce((sum: number, c: any) => sum + (c.openInterest || 0), 0);
    const totalPutOI = puts.reduce((sum: number, p: any) => sum + (p.openInterest || 0), 0);
    const putCallRatio = totalCallOI > 0 ? Math.round((totalPutOI / totalCallOI) * 100) / 100 : 1.0;

    // Skew: OTM put IV vs OTM call IV
    let skew = 0;
    if (currentPrice > 0) {
      const otmPuts = puts.filter((p: any) => p.strike < currentPrice * 0.95 && p.impliedVolatility > 0);
      const otmCalls = calls.filter((c: any) => c.strike > currentPrice * 1.05 && c.impliedVolatility > 0);
      const avgPutIV = otmPuts.length > 0
        ? otmPuts.reduce((s: number, p: any) => s + p.impliedVolatility, 0) / otmPuts.length
        : atmIV;
      const avgCallIV = otmCalls.length > 0
        ? otmCalls.reduce((s: number, c: any) => s + c.impliedVolatility, 0) / otmCalls.length
        : atmIV;
      skew = Math.round((avgPutIV - avgCallIV) * 10000) / 10000;
    }

    // Term structure from available expirations
    const termStructure: Array<{ expiration: string; iv: number }> = [];
    const expirationDates = optionsData.expirationDates || [];
    for (const expTimestamp of expirationDates.slice(0, 6)) {
      const expDate = new Date(expTimestamp * 1000).toISOString().split('T')[0];
      // Find ATM IV for this expiration from calls
      const expCalls = calls.filter((c: any) => {
        const cExpDate = new Date(c.expiration * 1000).toISOString().split('T')[0];
        return cExpDate === expDate;
      });
      if (expCalls.length > 0 && currentPrice > 0) {
        const sorted = [...expCalls].sort(
          (a: any, b: any) => Math.abs(a.strike - currentPrice) - Math.abs(b.strike - currentPrice)
        );
        if (sorted[0]?.impliedVolatility) {
          termStructure.push({ expiration: expDate, iv: Math.round(sorted[0].impliedVolatility * 10000) / 10000 });
        }
      }
    }

    // IV Rank (simplified: compare current ATM IV against 1-year HV range)
    const ivRange = Math.max(hv90 * 1.5, 0.5) - Math.max(hv90 * 0.5, 0.05);
    const ivRank = ivRange > 0
      ? Math.min(100, Math.max(0, Math.round(((atmIV - hv90 * 0.5) / ivRange) * 100)))
      : 50;

    // Expected moves from straddle pricing
    const atmPut = puts.length > 0
      ? [...puts].sort((a: any, b: any) => Math.abs(a.strike - currentPrice) - Math.abs(b.strike - currentPrice))[0]
      : null;
    const atmCallPrice = calls.length > 0
      ? [...calls].sort((a: any, b: any) => Math.abs(a.strike - currentPrice) - Math.abs(b.strike - currentPrice))[0]?.lastPrice || 0
      : 0;
    const atmPutPrice = atmPut?.lastPrice || 0;
    const straddlePrice = atmCallPrice + atmPutPrice;

    const weeklyMove = currentPrice > 0 ? Math.round((straddlePrice / currentPrice * Math.sqrt(5 / 252)) * 10000) / 100 : atmIV * Math.sqrt(5 / 252) * 100;
    const monthlyMove = currentPrice > 0 ? Math.round((straddlePrice / currentPrice * Math.sqrt(21 / 252)) * 10000) / 100 : atmIV * Math.sqrt(21 / 252) * 100;
    const quarterlyMove = currentPrice > 0 ? Math.round((straddlePrice / currentPrice * Math.sqrt(63 / 252)) * 10000) / 100 : atmIV * Math.sqrt(63 / 252) * 100;
    const earningsMove = currentPrice > 0 ? Math.round((straddlePrice / currentPrice) * 10000) / 100 : atmIV * 100 * 0.06;

    // Signal and recommendation
    const ivvsHV = hv30 > 0 ? Math.round((atmIV / hv30) * 100) / 100 : 1.0;
    let signal: string;
    let recommendation: string;

    if (ivRank > 80) {
      signal = 'IV_HIGH';
      recommendation = 'Consider selling premium (covered calls, credit spreads)';
    } else if (ivRank < 20) {
      signal = 'IV_LOW';
      recommendation = 'Consider buying premium (long straddles, debit spreads)';
    } else if (ivvsHV > 1.3) {
      signal = 'IV_RICH';
      recommendation = 'IV elevated vs realized — premium selling opportunities';
    } else if (ivvsHV < 0.8) {
      signal = 'IV_CHEAP';
      recommendation = 'IV compressed vs realized — premium buying opportunities';
    } else if (putCallRatio > 1.5) {
      signal = 'BEARISH_SENTIMENT';
      recommendation = 'High put/call ratio suggests hedging demand — contrarian bullish signal';
    } else if (putCallRatio < 0.5) {
      signal = 'BULLISH_SENTIMENT';
      recommendation = 'Low put/call ratio — complacency, consider protective puts';
    } else {
      signal = 'NEUTRAL';
      recommendation = 'IV in normal range — no strong directional signal';
    }

    const result: IVResult = {
      symbol: symbol.toUpperCase(),
      currentPrice,
      iv: Math.round(atmIV * 10000) / 10000,
      ivRank,
      ivPercentile: ivRank, // simplified
      hv30: Math.round(hv30 * 10000) / 10000,
      hv60: Math.round(hv60 * 10000) / 10000,
      hv90: Math.round(hv90 * 10000) / 10000,
      ivvsHV,
      putCallRatio,
      skew,
      termStructure,
      expectedMoves: {
        weekly: weeklyMove,
        monthly: monthlyMove,
        quarterly: quarterlyMove,
        earnings: earningsMove,
      },
      signal,
      recommendation,
      source: 'live',
    };

    ivCache.set(symbol, { data: result, timestamp: Date.now() });
    return result;
  } catch (error) {
    logger.warn({ err: error, symbol }, 'IV data fetch failed, using fallback');
    const historicalPrices = await fetchHistoricalPrices(symbol).catch(() => []);
    if (historicalPrices.length > 30) {
      return getHVBasedIVData(symbol, historicalPrices, 0);
    }
    return getDefaultIVData(symbol, 0);
  }
}

function getHVBasedIVData(symbol: string, prices: number[], currentPrice: number): IVResult {
  const hv30 = calculateHistoricalVolatility(prices, 30);
  const hv60 = calculateHistoricalVolatility(prices, 60);
  const hv90 = calculateHistoricalVolatility(prices, 90);
  const estimatedIV = hv30 * 1.1; // 10% IV premium over HV
  const price = currentPrice || prices[prices.length - 1] || 100;

  return {
    symbol: symbol.toUpperCase(),
    currentPrice: price,
    iv: Math.round(estimatedIV * 10000) / 10000,
    ivRank: 50,
    ivPercentile: 50,
    hv30: Math.round(hv30 * 10000) / 10000,
    hv60: Math.round(hv60 * 10000) / 10000,
    hv90: Math.round(hv90 * 10000) / 10000,
    ivvsHV: hv30 > 0 ? Math.round((estimatedIV / hv30) * 100) / 100 : 1.1,
    putCallRatio: 1.0,
    skew: 0,
    termStructure: [],
    expectedMoves: {
      weekly: Math.round(estimatedIV * Math.sqrt(5 / 252) * 10000) / 100,
      monthly: Math.round(estimatedIV * Math.sqrt(21 / 252) * 10000) / 100,
      quarterly: Math.round(estimatedIV * Math.sqrt(63 / 252) * 10000) / 100,
      earnings: Math.round(estimatedIV * 0.06 * 10000) / 100,
    },
    signal: 'HV_BASED',
    recommendation: 'IV estimated from historical volatility — options data unavailable',
    source: 'hv_estimate',
  };
}

function getDefaultIVData(symbol: string, currentPrice: number): IVResult {
  const defaultIV = 0.25;
  return {
    symbol: symbol.toUpperCase(),
    currentPrice: currentPrice || 100,
    iv: defaultIV,
    ivRank: 50,
    ivPercentile: 50,
    hv30: 0.22,
    hv60: 0.21,
    hv90: 0.20,
    ivvsHV: 1.14,
    putCallRatio: 1.0,
    skew: 0,
    termStructure: [],
    expectedMoves: {
      weekly: Math.round(defaultIV * Math.sqrt(5 / 252) * 10000) / 100,
      monthly: Math.round(defaultIV * Math.sqrt(21 / 252) * 10000) / 100,
      quarterly: Math.round(defaultIV * Math.sqrt(63 / 252) * 10000) / 100,
      earnings: Math.round(defaultIV * 0.06 * 10000) / 100,
    },
    signal: 'DEFAULT',
    recommendation: 'Using default IV estimates — no market data available',
    source: 'default',
  };
}

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

  // GET /api/v1/options/iv — Full implied volatility analysis
  fastify.get<{
    Querystring: { symbols?: string };
  }>(
    '/api/v1/options/iv',
    async (request, reply) => {
      const start = Date.now();
      const symbolsParam = (request.query.symbols || '').trim();

      if (!symbolsParam) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'symbols query parameter is required (comma-separated, max 10)' },
        });
      }

      const symbols = symbolsParam.split(',').map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 10);

      if (symbols.length === 0) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'At least one valid symbol is required' },
        });
      }

      try {
        const results: IVResult[] = [];
        let hasLiveData = false;

        for (let i = 0; i < symbols.length; i++) {
          if (i > 0) {
            // 200ms delay between symbols to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 200));
          }

          const ivData = await fetchIVData(symbols[i]);
          results.push(ivData);
          if (ivData.source === 'live') {
            hasLiveData = true;
          }
        }

        // Portfolio-level averages
        const avgIV = results.length > 0
          ? Math.round((results.reduce((s, r) => s + r.iv, 0) / results.length) * 10000) / 10000
          : 0;
        const avgIVRank = results.length > 0
          ? Math.round(results.reduce((s, r) => s + r.ivRank, 0) / results.length)
          : 0;
        const avgHV = results.length > 0
          ? Math.round((results.reduce((s, r) => s + r.hv30, 0) / results.length) * 10000) / 10000
          : 0;
        const avgIVvsHV = results.length > 0
          ? Math.round((results.reduce((s, r) => s + r.ivvsHV, 0) / results.length) * 100) / 100
          : 0;

        // Notable positions
        const highIV = results.filter(r => r.ivRank > 70).map(r => ({ symbol: r.symbol, ivRank: r.ivRank, iv: r.iv }));
        const lowIV = results.filter(r => r.ivRank < 30).map(r => ({ symbol: r.symbol, ivRank: r.ivRank, iv: r.iv }));
        const highSkew = results.filter(r => Math.abs(r.skew) > 0.03).map(r => ({ symbol: r.symbol, skew: r.skew }));
        const backwardation = results.filter(r => {
          if (r.termStructure.length < 2) return false;
          return r.termStructure[0].iv > r.termStructure[r.termStructure.length - 1].iv;
        }).map(r => ({ symbol: r.symbol, nearIV: r.termStructure[0]?.iv, farIV: r.termStructure[r.termStructure.length - 1]?.iv }));

        const dataSource = hasLiveData ? 'live' : 'mock';
        reply.header('X-Data-Source', dataSource);

        return {
          success: true,
          data: {
            symbols: results,
            portfolio: {
              avgIV,
              avgIVRank,
              avgHV,
              avgIVvsHV,
            },
            notable: {
              highIV,
              lowIV,
              highSkew,
              backwardation,
            },
          },
          meta: {
            source: dataSource,
            symbolCount: results.length,
            timestamp: new Date(),
            requestId: request.id,
            latencyMs: Date.now() - start,
          },
        };
      } catch (error) {
        logger.error({ err: error }, 'IV analysis failed');
        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'IV analysis failed' },
        });
      }
    }
  );
}
