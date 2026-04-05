/**
 * Backtest route — walk-forward engine runner.
 *
 * Ported from `api/v1/backtest/run.ts` to unify on the single Fastify surface
 * exposed via `buildApp()`.
 */

import type { FastifyInstance } from 'fastify';
import { BacktestRunner, type BacktestRunConfig } from '../backtest/BacktestRunner.js';
import { logger } from '../observability/logger.js';
import type { APIResponse } from '../types/index.js';

interface RouteContext {
  server: unknown;
}

interface BacktestBody {
  symbols?: string[];
  startDate?: string;
  endDate?: string;
  initialCapital?: number;
  episodeLengthDays?: number;
  strategy?: 'max_sharpe' | 'min_volatility' | 'risk_parity';
  useCVRF?: boolean;
  rebalanceFrequency?: 'daily' | 'weekly' | 'monthly';
}

export async function backtestRoutes(fastify: FastifyInstance, _opts: RouteContext) {
  fastify.post<{ Body: BacktestBody; Reply: APIResponse<unknown> }>(
    '/api/v1/backtest/run',
    async (request, reply) => {
      const start = Date.now();
      const body = request.body || {};

      if (!body.symbols || !Array.isArray(body.symbols) || body.symbols.length === 0) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'symbols array is required' },
        });
      }

      const config: BacktestRunConfig = {
        symbols: body.symbols,
        startDate: body.startDate || '2023-01-01',
        endDate: body.endDate || new Date().toISOString().split('T')[0],
        initialCapital: body.initialCapital ?? 100000,
        episodeLengthDays: body.episodeLengthDays ?? 21,
        strategy: body.strategy || 'max_sharpe',
        useCVRF: body.useCVRF !== false,
        rebalanceFrequency: body.rebalanceFrequency || 'monthly',
      };

      try {
        const runner = new BacktestRunner();
        const result = await runner.run(config);

        return {
          success: true,
          data: result,
          meta: { timestamp: new Date(), requestId: request.id, latencyMs: Date.now() - start },
        };
      } catch (error) {
        logger.error({ err: error }, 'Backtest run error');
        return reply.status(500).send({
          success: false,
          error: {
            code: 'BACKTEST_ERROR',
            message: error instanceof Error ? error.message : 'Backtest failed',
          },
        });
      }
    }
  );
}
