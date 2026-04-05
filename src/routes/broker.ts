/**
 * Legacy broker routes — `/api/v1/broker/trade`.
 *
 * Ported from `api/v1/broker/trade.ts` to unify on the single Fastify surface
 * exposed via `buildApp()`. Preserves demo fallbacks and the in-memory order
 * map used when ALPACA credentials are absent. The newer per-verb endpoints
 * live under `/api/v1/trading/*` (see `routes/trading.ts`); this module is
 * kept for backward compatibility with older clients.
 */

import type { FastifyInstance } from 'fastify';
import axios from 'axios';
import { authMiddleware } from '../middleware/auth.js';
import { logger } from '../observability/logger.js';
import type { APIResponse } from '../types/index.js';

interface RouteContext {
  server: unknown;
}

interface OrderRequest {
  symbol: string;
  qty: number;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop' | 'stop_limit';
  timeInForce?: 'day' | 'gtc' | 'ioc' | 'fok';
  limitPrice?: number;
  stopPrice?: number;
}

interface Order {
  id: string;
  symbol: string;
  qty: number;
  side: string;
  type: string;
  status: string;
  filledQty: number;
  filledAvgPrice?: number;
  createdAt: string;
}

// In-memory order storage for demo mode
const orders = new Map<string, Order>();

const demoPrices: Record<string, number> = {
  AAPL: 175.5,
  MSFT: 378.25,
  GOOGL: 140.8,
  NVDA: 495.2,
  TSLA: 245.6,
  AMZN: 178.9,
  META: 485.3,
  SPY: 478.5,
};

function brokerConfig() {
  const alpacaKey = process.env.ALPACA_API_KEY;
  const alpacaSecret = process.env.ALPACA_API_SECRET;
  const isPaper = process.env.ALPACA_PAPER_TRADING !== 'false';
  const configured = !!(alpacaKey && alpacaSecret);
  const baseUrl = isPaper
    ? 'https://paper-api.alpaca.markets'
    : 'https://api.alpaca.markets';
  return { alpacaKey, alpacaSecret, isPaper, configured, baseUrl };
}

const alpacaHeaders = (key?: string, secret?: string) => ({
  'APCA-API-KEY-ID': key ?? '',
  'APCA-API-SECRET-KEY': secret ?? '',
});

function validateOrder(order: Partial<OrderRequest>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!order.symbol || order.symbol.length === 0) errors.push('Symbol is required');
  if (!order.qty || order.qty <= 0) errors.push('Quantity must be positive');
  if (!order.side || !['buy', 'sell'].includes(order.side)) {
    errors.push('Side must be "buy" or "sell"');
  }
  if (!order.type || !['market', 'limit', 'stop', 'stop_limit'].includes(order.type)) {
    errors.push('Invalid order type');
  }
  if (order.type === 'limit' && !order.limitPrice) errors.push('Limit price is required for limit orders');
  if (order.type === 'stop' && !order.stopPrice) errors.push('Stop price is required for stop orders');
  return { valid: errors.length === 0, errors };
}

export async function brokerRoutes(fastify: FastifyInstance, _opts: RouteContext) {
  // GET /api/v1/broker/trade?action=account|orders
  fastify.get<{ Querystring: { action?: string }; Reply: APIResponse<unknown> }>(
    '/api/v1/broker/trade',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const start = Date.now();
      const { action } = request.query;
      const cfg = brokerConfig();

      if (action === 'account') {
        if (!cfg.configured) {
          return {
            success: true,
            data: {
              account: {
                id: 'demo-account',
                status: 'active',
                currency: 'USD',
                buyingPower: 100000,
                cash: 100000,
                portfolioValue: 100000,
              },
              brokerConnected: false,
              brokerType: 'demo',
              paperTrading: true,
            },
            meta: { timestamp: new Date(), requestId: request.id, latencyMs: Date.now() - start },
          };
        }

        try {
          const response = await axios.get(`${cfg.baseUrl}/v2/account`, {
            headers: alpacaHeaders(cfg.alpacaKey, cfg.alpacaSecret),
            timeout: 10000,
          });
          const data = response.data as Record<string, string>;
          return {
            success: true,
            data: {
              account: {
                id: data.id,
                status: data.status === 'ACTIVE' ? 'active' : 'inactive',
                currency: data.currency,
                buyingPower: parseFloat(data.buying_power),
                cash: parseFloat(data.cash),
                portfolioValue: parseFloat(data.portfolio_value),
              },
              brokerConnected: true,
              brokerType: 'alpaca',
              paperTrading: cfg.isPaper,
            },
            meta: { timestamp: new Date(), requestId: request.id, latencyMs: Date.now() - start },
          };
        } catch (error) {
          logger.warn({ err: error }, 'Alpaca account fetch failed, falling back to demo');
          return {
            success: true,
            data: {
              account: {
                id: 'demo-account',
                status: 'active',
                currency: 'USD',
                buyingPower: 100000,
                cash: 100000,
                portfolioValue: 100000,
              },
              brokerConnected: false,
              brokerType: 'demo',
              paperTrading: true,
            },
            meta: { timestamp: new Date(), requestId: request.id, latencyMs: Date.now() - start },
          };
        }
      }

      if (action === 'orders') {
        if (!cfg.configured) {
          return {
            success: true,
            data: { orders: Array.from(orders.values()) },
            meta: { timestamp: new Date(), requestId: request.id, latencyMs: Date.now() - start },
          };
        }

        try {
          const response = await axios.get(`${cfg.baseUrl}/v2/orders`, {
            headers: alpacaHeaders(cfg.alpacaKey, cfg.alpacaSecret),
            params: { limit: 100 },
            timeout: 10000,
          });
          const alpacaOrders = (response.data as Array<Record<string, string>>).map((o) => ({
            id: o.id,
            symbol: o.symbol,
            qty: parseFloat(o.qty),
            side: o.side,
            type: o.type,
            status: o.status.toLowerCase(),
            filledQty: parseFloat(o.filled_qty),
            filledAvgPrice: o.filled_avg_price ? parseFloat(o.filled_avg_price) : undefined,
            createdAt: o.created_at,
          }));
          return {
            success: true,
            data: { orders: alpacaOrders },
            meta: { timestamp: new Date(), requestId: request.id, latencyMs: Date.now() - start },
          };
        } catch (error) {
          logger.warn({ err: error }, 'Alpaca orders fetch failed, falling back to demo');
          return {
            success: true,
            data: { orders: Array.from(orders.values()) },
            meta: { timestamp: new Date(), requestId: request.id, latencyMs: Date.now() - start },
          };
        }
      }

      return reply.status(400).send({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'action parameter required (account or orders)' },
      });
    }
  );

  // POST /api/v1/broker/trade — submit order
  fastify.post<{ Body: OrderRequest; Reply: APIResponse<unknown> }>(
    '/api/v1/broker/trade',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const start = Date.now();
      const body = request.body || ({} as OrderRequest);

      const { valid, errors } = validateOrder(body);
      if (!valid) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: errors.join('; ') },
        });
      }

      const cfg = brokerConfig();

      if (cfg.configured) {
        try {
          const response = await axios.post(
            `${cfg.baseUrl}/v2/orders`,
            {
              symbol: body.symbol.toUpperCase(),
              qty: body.qty.toString(),
              side: body.side,
              type: body.type,
              time_in_force: body.timeInForce || 'day',
              limit_price: body.limitPrice?.toString(),
              stop_price: body.stopPrice?.toString(),
            },
            {
              headers: {
                ...alpacaHeaders(cfg.alpacaKey, cfg.alpacaSecret),
                'Content-Type': 'application/json',
              },
              timeout: 10000,
            }
          );
          const alpacaOrder = response.data as Record<string, string>;
          return {
            success: true,
            data: {
              order: {
                id: alpacaOrder.id,
                symbol: alpacaOrder.symbol,
                qty: parseFloat(alpacaOrder.qty),
                side: alpacaOrder.side,
                type: alpacaOrder.type,
                status: alpacaOrder.status.toLowerCase(),
                filledQty: parseFloat(alpacaOrder.filled_qty),
                filledAvgPrice: alpacaOrder.filled_avg_price
                  ? parseFloat(alpacaOrder.filled_avg_price)
                  : undefined,
                createdAt: alpacaOrder.created_at,
              },
              broker: 'alpaca',
              paperTrading: cfg.isPaper,
            },
            meta: { timestamp: new Date(), requestId: request.id, latencyMs: Date.now() - start },
          };
        } catch (error) {
          logger.error({ err: error }, 'Alpaca order submission failed');
          return reply.status(500).send({
            success: false,
            error: { code: 'BROKER_ERROR', message: 'Failed to submit order to broker' },
          });
        }
      }

      // Demo mode — simulate order fill
      const orderId = `demo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const now = new Date();
      const demoPrice = demoPrices[body.symbol.toUpperCase()] || 100 + Math.random() * 100;
      const fillPrice = body.limitPrice || demoPrice;
      const isFilled = body.type === 'market';

      const order: Order = {
        id: orderId,
        symbol: body.symbol.toUpperCase(),
        qty: body.qty,
        side: body.side,
        type: body.type,
        status: isFilled ? 'filled' : 'new',
        filledQty: isFilled ? body.qty : 0,
        filledAvgPrice: isFilled ? fillPrice : undefined,
        createdAt: now.toISOString(),
      };
      orders.set(orderId, order);

      return {
        success: true,
        data: {
          order,
          broker: 'demo',
          paperTrading: true,
          message: 'Demo order submitted. Configure ALPACA_API_KEY for real trading.',
        },
        meta: { timestamp: new Date(), requestId: request.id, latencyMs: Date.now() - start },
      };
    }
  );

  // DELETE /api/v1/broker/trade?orderId=… — cancel
  fastify.delete<{ Querystring: { orderId?: string }; Reply: APIResponse<unknown> }>(
    '/api/v1/broker/trade',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const start = Date.now();
      const { orderId } = request.query;

      if (!orderId) {
        return reply.status(400).send({
          success: false,
          error: { code: 'BAD_REQUEST', message: 'orderId parameter required' },
        });
      }

      const cfg = brokerConfig();

      if (cfg.configured) {
        try {
          await axios.delete(`${cfg.baseUrl}/v2/orders/${orderId}`, {
            headers: alpacaHeaders(cfg.alpacaKey, cfg.alpacaSecret),
            timeout: 10000,
          });
          return {
            success: true,
            data: { canceled: true, orderId },
            meta: { timestamp: new Date(), requestId: request.id, latencyMs: Date.now() - start },
          };
        } catch (error) {
          logger.error({ err: error }, 'Alpaca order cancel failed');
          return reply.status(500).send({
            success: false,
            error: { code: 'BROKER_ERROR', message: 'Failed to cancel order' },
          });
        }
      }

      const order = orders.get(orderId);
      if (order) {
        order.status = 'canceled';
        return {
          success: true,
          data: { canceled: true, orderId },
          meta: { timestamp: new Date(), requestId: request.id, latencyMs: Date.now() - start },
        };
      }

      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Order not found' },
      });
    }
  );
}
