/**
 * Trading Orders API
 *
 * GET  /api/v1/trading/orders         - List orders
 * POST /api/v1/trading/orders         - Place order
 * DELETE /api/v1/trading/orders/:id   - Cancel order (via query param)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { validationError, badRequest, notFound, methodNotAllowed, internalError } from '../../lib/errorHandler.js';
import { validateBody, schemas } from '../../lib/validation.js';

interface OrderRequest {
  symbol: string;
  qty?: number;
  notional?: number;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop' | 'stop_limit' | 'trailing_stop';
  timeInForce?: 'day' | 'gtc' | 'ioc' | 'fok' | 'opg' | 'cls';
  limitPrice?: number;
  stopPrice?: number;
  trailPercent?: number;
  trailPrice?: number;
  extendedHours?: boolean;
  clientOrderId?: string;
  orderClass?: 'simple' | 'bracket' | 'oco' | 'oto';
  takeProfit?: { limitPrice: number };
  stopLoss?: { stopPrice: number; limitPrice?: number };
}

interface Order {
  id: string;
  symbol: string;
  qty: number;
  side: string;
  type: string;
  status: string;
  timeInForce: string;
  limitPrice?: number;
  stopPrice?: number;
  filledQty: number;
  filledAvgPrice?: number;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  filledAt?: string;
  canceledAt?: string;
  extendedHours?: boolean;
}

// In-memory order storage for demo mode
const demoOrders = new Map<string, Order>();

// Demo prices for simulation
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

function validateOrder(order: OrderRequest): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!order.symbol || order.symbol.length === 0) {
    errors.push('Symbol is required');
  }

  if ((!order.qty || order.qty <= 0) && (!order.notional || order.notional <= 0)) {
    errors.push('Either quantity or notional amount must be positive');
  }

  if (!['buy', 'sell'].includes(order.side)) {
    errors.push('Side must be "buy" or "sell"');
  }

  if (!['market', 'limit', 'stop', 'stop_limit', 'trailing_stop'].includes(order.type)) {
    errors.push('Invalid order type');
  }

  if (order.type === 'limit' && !order.limitPrice) {
    errors.push('Limit price is required for limit orders');
  }

  if (order.type === 'stop' && !order.stopPrice) {
    errors.push('Stop price is required for stop orders');
  }

  if (order.type === 'stop_limit' && (!order.limitPrice || !order.stopPrice)) {
    errors.push('Both limit and stop prices are required for stop-limit orders');
  }

  if (order.type === 'trailing_stop' && !order.trailPercent && !order.trailPrice) {
    errors.push('Trail percent or trail price is required for trailing stop orders');
  }

  return { valid: errors.length === 0, errors };
}

function mapAlpacaOrder(data: any): Order {
  return {
    id: data.id,
    symbol: data.symbol,
    qty: parseFloat(data.qty),
    side: data.side,
    type: data.type,
    status: data.status.toLowerCase(),
    timeInForce: data.time_in_force,
    limitPrice: data.limit_price ? parseFloat(data.limit_price) : undefined,
    stopPrice: data.stop_price ? parseFloat(data.stop_price) : undefined,
    filledQty: parseFloat(data.filled_qty),
    filledAvgPrice: data.filled_avg_price ? parseFloat(data.filled_avg_price) : undefined,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    submittedAt: data.submitted_at,
    filledAt: data.filled_at,
    canceledAt: data.canceled_at,
    extendedHours: data.extended_hours,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const requestId = `req-${Math.random().toString(36).slice(2, 8)}`;
  const alpacaKey = process.env.ALPACA_API_KEY;
  const alpacaSecret = process.env.ALPACA_API_SECRET;
  const isPaper = process.env.ALPACA_PAPER_TRADING !== 'false';
  const brokerConfigured = alpacaKey && alpacaSecret;

  try {
    // ========================================
    // GET - List orders
    // ========================================
    if (req.method === 'GET') {
      const { status, limit = '100', after, until, direction = 'desc', nested } = req.query;

      if (!brokerConfigured) {
        // Return demo orders
        const orders = Array.from(demoOrders.values())
          .filter((o) => !status || o.status === status)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, parseInt(limit as string));

        res.setHeader('X-Data-Source', 'mock');
        return res.status(200).json({
          success: true,
          data: {
            orders,
            count: orders.length,
            brokerConnected: false,
            brokerType: 'demo',
            paperTrading: true,
          },
          dataSource: 'mock' as const,
          meta: { requestId },
        });
      }

      // Fetch from Alpaca
      const { default: axios } = await import('axios');
      const baseUrl = isPaper
        ? 'https://paper-api.alpaca.markets'
        : 'https://api.alpaca.markets';

      const params: any = {
        limit,
        direction,
      };
      if (status) params.status = status;
      if (after) params.after = after;
      if (until) params.until = until;
      if (nested === 'true') params.nested = true;

      const response = await axios.get(`${baseUrl}/v2/orders`, {
        headers: {
          'APCA-API-KEY-ID': alpacaKey,
          'APCA-API-SECRET-KEY': alpacaSecret,
        },
        params,
        timeout: 10000,
      });

      const orders = response.data.map(mapAlpacaOrder);

      res.setHeader('X-Data-Source', 'live');
      return res.status(200).json({
        success: true,
        data: {
          orders,
          count: orders.length,
          brokerConnected: true,
          brokerType: 'alpaca',
          paperTrading: isPaper,
        },
        dataSource: 'live' as const,
        meta: { requestId },
      });
    }

    // ========================================
    // POST - Place order
    // ========================================
    if (req.method === 'POST') {
      // Validate & parse input with Zod
      const orderReq = validateBody(req, res, schemas.placeOrder);
      if (!orderReq) return;

      if (!brokerConfigured) {
        // Demo mode - simulate order
        const orderId = `demo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const now = new Date();

        // Get demo price
        const demoPrice = demoPrices[orderReq.symbol.toUpperCase()] || 100 + Math.random() * 100;
        const fillPrice = orderReq.limitPrice || demoPrice;
        const qty = orderReq.qty || (orderReq.notional ? Math.floor(orderReq.notional / fillPrice) : 0);

        // Simulate market order fill
        const isFilled = orderReq.type === 'market';

        const order: Order = {
          id: orderId,
          symbol: orderReq.symbol.toUpperCase(),
          qty,
          side: orderReq.side,
          type: orderReq.type,
          status: isFilled ? 'filled' : 'new',
          timeInForce: orderReq.timeInForce || 'day',
          limitPrice: orderReq.limitPrice,
          stopPrice: orderReq.stopPrice,
          filledQty: isFilled ? qty : 0,
          filledAvgPrice: isFilled ? fillPrice : undefined,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          submittedAt: now.toISOString(),
          filledAt: isFilled ? now.toISOString() : undefined,
          extendedHours: orderReq.extendedHours,
        };

        demoOrders.set(orderId, order);

        res.setHeader('X-Data-Source', 'mock');
        return res.status(200).json({
          success: true,
          data: {
            order,
            broker: 'demo',
            paperTrading: true,
            message: 'Demo order submitted. Configure ALPACA_API_KEY for real trading.',
          },
          dataSource: 'mock' as const,
          meta: { requestId },
        });
      }

      // Real Alpaca order
      const { default: axios } = await import('axios');
      const baseUrl = isPaper
        ? 'https://paper-api.alpaca.markets'
        : 'https://api.alpaca.markets';

      const payload: any = {
        symbol: orderReq.symbol.toUpperCase(),
        side: orderReq.side,
        type: orderReq.type,
        time_in_force: orderReq.timeInForce || 'day',
      };

      if (orderReq.qty) {
        payload.qty = orderReq.qty.toString();
      } else if (orderReq.notional) {
        payload.notional = orderReq.notional.toString();
      }

      if (orderReq.limitPrice) {
        payload.limit_price = orderReq.limitPrice.toString();
      }

      if (orderReq.stopPrice) {
        payload.stop_price = orderReq.stopPrice.toString();
      }

      if (orderReq.trailPercent) {
        payload.trail_percent = orderReq.trailPercent.toString();
      }

      if (orderReq.trailPrice) {
        payload.trail_price = orderReq.trailPrice.toString();
      }

      if (orderReq.extendedHours !== undefined) {
        payload.extended_hours = orderReq.extendedHours;
      }

      if (orderReq.clientOrderId) {
        payload.client_order_id = orderReq.clientOrderId;
      }

      // Bracket/OCO/OTO orders
      if (orderReq.orderClass && orderReq.orderClass !== 'simple') {
        payload.order_class = orderReq.orderClass;

        if (orderReq.takeProfit) {
          payload.take_profit = {
            limit_price: orderReq.takeProfit.limitPrice.toString(),
          };
        }

        if (orderReq.stopLoss) {
          payload.stop_loss = {
            stop_price: orderReq.stopLoss.stopPrice.toString(),
            limit_price: orderReq.stopLoss.limitPrice?.toString(),
          };
        }
      }

      try {
        const response = await axios.post(`${baseUrl}/v2/orders`, payload, {
          headers: {
            'APCA-API-KEY-ID': alpacaKey,
            'APCA-API-SECRET-KEY': alpacaSecret,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        });

        const order = mapAlpacaOrder(response.data);

        res.setHeader('X-Data-Source', 'live');
        return res.status(200).json({
          success: true,
          data: {
            order,
            broker: 'alpaca',
            paperTrading: isPaper,
          },
          dataSource: 'live' as const,
          meta: { requestId },
        });
      } catch (error: any) {
        console.error('[Trading Orders] Alpaca error:', error.response?.data);
        if (error.response?.status === 403) {
          return badRequest(res, 'Order rejected by broker');
        }
        if (error.response?.status === 422) {
          return badRequest(res, 'Order rejected — check order parameters');
        }
        return internalError(res, 'Order submission failed');
      }
    }

    // ========================================
    // DELETE - Cancel order
    // ========================================
    if (req.method === 'DELETE') {
      const { id, cancelAll } = req.query;

      if (cancelAll === 'true') {
        // Cancel all open orders
        if (!brokerConfigured) {
          let canceled = 0;
          for (const order of demoOrders.values()) {
            if (!['filled', 'canceled', 'expired'].includes(order.status)) {
              order.status = 'canceled';
              order.canceledAt = new Date().toISOString();
              order.updatedAt = new Date().toISOString();
              canceled++;
            }
          }

          return res.status(200).json({
            success: true,
            data: { canceled },
            meta: { requestId },
          });
        }

        const { default: axios } = await import('axios');
        const baseUrl = isPaper
          ? 'https://paper-api.alpaca.markets'
          : 'https://api.alpaca.markets';

        try {
          const response = await axios.delete(`${baseUrl}/v2/orders`, {
            headers: {
              'APCA-API-KEY-ID': alpacaKey,
              'APCA-API-SECRET-KEY': alpacaSecret,
            },
            timeout: 10000,
          });

          return res.status(200).json({
            success: true,
            data: {
              canceled: Array.isArray(response.data) ? response.data.length : 0,
              orders: response.data,
            },
            meta: { requestId },
          });
        } catch (error: any) {
          console.error('[Trading Orders] Cancel all error:', error.response?.data);
          return internalError(res, 'Failed to cancel orders');
        }
      }

      if (!id) {
        return validationError(res, 'Order ID is required', { id: 'Required' });
      }

      if (!brokerConfigured) {
        const order = demoOrders.get(id as string);
        if (order && !['filled', 'canceled', 'expired'].includes(order.status)) {
          order.status = 'canceled';
          order.canceledAt = new Date().toISOString();
          order.updatedAt = new Date().toISOString();

          return res.status(200).json({
            success: true,
            data: { canceled: true, orderId: id },
            meta: { requestId },
          });
        }

        return notFound(res, 'Order');
      }

      const { default: axios } = await import('axios');
      const baseUrl = isPaper
        ? 'https://paper-api.alpaca.markets'
        : 'https://api.alpaca.markets';

      try {
        await axios.delete(`${baseUrl}/v2/orders/${id}`, {
          headers: {
            'APCA-API-KEY-ID': alpacaKey,
            'APCA-API-SECRET-KEY': alpacaSecret,
          },
          timeout: 10000,
        });

        return res.status(200).json({
          success: true,
          data: { canceled: true, orderId: id },
          meta: { requestId },
        });
      } catch (error: any) {
        if (error.response?.status === 404) {
          return notFound(res, 'Order');
        }
        console.error('[Trading Orders] Cancel error:', error.response?.data);
        return internalError(res, 'Order cancellation failed');
      }
    }

    return methodNotAllowed(res);
  } catch (error) {
    console.error('[Trading Orders] Error:', error);
    return internalError(res);
  }
}
