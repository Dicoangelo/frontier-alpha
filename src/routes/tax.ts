import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth.js';
import { subscriptionGate, requirePlan } from '../middleware/subscriptionGate.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { logger } from '../observability/logger.js';
import type { TaxLotTracker } from '../tax/TaxLotTracker.js';
import type { HarvestingScanner } from '../tax/HarvestingScanner.js';
import type { WashSaleDetector } from '../tax/WashSaleDetector.js';
import type { TaxReportGenerator } from '../tax/TaxReportGenerator.js';

interface RouteContext {
  server: {
    dataProvider: { getQuote(symbol: string): Promise<{ last: number } | null> };
    taxLotTracker: TaxLotTracker;
    harvestingScanner: HarvestingScanner;
    washSaleDetector: WashSaleDetector;
    taxReportGenerator: TaxReportGenerator;
    useDatabase: boolean;
  };
}

export async function taxRoutes(fastify: FastifyInstance, opts: RouteContext) {
  const { server } = opts;

  // Pro-only: subscription gate for all tax routes (auth already per-route)
  fastify.addHook('preHandler', authMiddleware);
  fastify.addHook('preHandler', subscriptionGate);
  fastify.addHook('preHandler', requirePlan('pro'));

  // GET /api/v1/tax/lots
  fastify.get<{
    Querystring: { symbol?: string };
  }>(
    '/api/v1/tax/lots',

    async (request, reply) => {
      const start = Date.now();
      const symbol = request.query.symbol?.trim().toUpperCase();

      try {
        // If using database, fetch from Supabase
        if (server.useDatabase) {
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
        const openLots = server.taxLotTracker.getOpenLots(request.user.id, symbol);
        const allLots = symbol
          ? server.taxLotTracker.getAllLots(request.user.id).filter(l => l.symbol === symbol)
          : server.taxLotTracker.getAllLots(request.user.id);

        return {
          success: true,
          data: {
            lots: allLots.map(lot => ({
              ...lot,
              purchaseDate: lot.purchaseDate.toISOString(),
              soldDate: lot.soldDate?.toISOString() ?? null,
              isOpen: openLots.some(o => o.id === lot.id),
              holdingDays: server.taxLotTracker.getHoldingPeriodDays(lot),
              isShortTerm: lot.soldDate
                ? server.taxLotTracker.isShortTermHolding(lot.purchaseDate, lot.soldDate)
                : server.taxLotTracker.isShortTermHolding(lot.purchaseDate, new Date()),
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

  // GET /api/v1/tax/harvest
  fastify.get<{
    Querystring: { symbols?: string };
  }>(
    '/api/v1/tax/harvest',

    async (request, reply) => {
      const start = Date.now();

      try {
        // Build current prices from quotes
        const symbolsParam = request.query.symbols || 'AAPL,MSFT,GOOGL,NVDA,AMZN';
        const symbols = symbolsParam.split(',').map((s: string) => s.trim().toUpperCase()).filter(Boolean);
        const currentPrices = new Map<string, number>();

        for (const sym of symbols) {
          const quote = await server.dataProvider.getQuote(sym);
          if (quote) {
            currentPrices.set(sym, quote.last);
          }
        }

        const result = server.harvestingScanner.scan(
          server.taxLotTracker,
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

  // POST /api/v1/tax/harvest
  fastify.post<{
    Body: {
      symbol: string;
      shares: number;
      salePrice: number;
      method?: 'fifo' | 'lifo' | 'specific';
      lotIds?: string[];
    };
  }>(
    '/api/v1/tax/harvest',

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
        const result = server.taxLotTracker.sellShares(
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

  // GET /api/v1/tax/wash-sales
  fastify.get(
    '/api/v1/tax/wash-sales',

    async (request, reply) => {
      const start = Date.now();

      try {
        const result = server.washSaleDetector.scanTransactionHistory(
          server.taxLotTracker,
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

  // GET /api/v1/tax/report
  fastify.get<{
    Querystring: { year?: string; format?: string };
  }>(
    '/api/v1/tax/report',

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
        const openLots = server.taxLotTracker.getOpenLots(request.user.id);
        const openSymbols = [...new Set(openLots.map(l => l.symbol))];

        for (const sym of openSymbols) {
          const quote = await server.dataProvider.getQuote(sym);
          if (quote) {
            currentPrices.set(sym, quote.last);
          }
        }

        const report = server.taxReportGenerator.generateReport(
          server.taxLotTracker,
          request.user.id,
          taxYear,
          server.washSaleDetector,
          server.harvestingScanner,
          currentPrices
        );

        // Export in requested format
        if (format === 'csv') {
          const csv = server.taxReportGenerator.exportCSV(report);
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
}
