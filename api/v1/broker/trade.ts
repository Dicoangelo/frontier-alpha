/**
 * Legacy Broker Trade Endpoint
 *
 * This endpoint maintains backward compatibility with the old API structure.
 * It delegates to the new trading endpoints:
 * - GET ?action=account  -> /api/v1/trading/account
 * - GET ?action=orders   -> /api/v1/trading/orders
 * - POST                 -> /api/v1/trading/orders
 * - DELETE               -> /api/v1/trading/orders?id=...
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

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

// In-memory order storage for demo
const orders = new Map<string, Order>();

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

  if (!order.qty || order.qty <= 0) {
    errors.push('Quantity must be positive');
  }

  if (!['buy', 'sell'].includes(order.side)) {
    errors.push('Side must be "buy" or "sell"');
  }

  if (!['market', 'limit', 'stop', 'stop_limit'].includes(order.type)) {
    errors.push('Invalid order type');
  }

  if (order.type === 'limit' && !order.limitPrice) {
    errors.push('Limit price is required for limit orders');
  }

  if (order.type === 'stop' && !order.stopPrice) {
    errors.push('Stop price is required for stop orders');
  }

  return { valid: errors.length === 0, errors };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const requestId = `req-${Math.random().toString(36).slice(2, 8)}`;

  // Check for broker credentials
  const alpacaKey = process.env.ALPACA_API_KEY;
  const alpacaSecret = process.env.ALPACA_API_SECRET;
  const brokerConfigured = alpacaKey && alpacaSecret;
  const isPaper = process.env.ALPACA_PAPER_TRADING !== 'false';

  try {
    // GET - Get orders or account info
    if (req.method === 'GET') {
      const { action } = req.query;

      if (action === 'account') {
        // Check if Alpaca is configured
        if (!brokerConfigured) {
          return res.status(200).json({
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
            meta: { requestId },
          });
        }

        // Fetch from Alpaca
        try {
          const { default: axios } = await import('axios');
          const baseUrl = isPaper
            ? 'https://paper-api.alpaca.markets'
            : 'https://api.alpaca.markets';

          const response = await axios.get(`${baseUrl}/v2/account`, {
            headers: {
              'APCA-API-KEY-ID': alpacaKey,
              'APCA-API-SECRET-KEY': alpacaSecret,
            },
            timeout: 10000,
          });

          const data = response.data;

          return res.status(200).json({
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
              paperTrading: isPaper,
            },
            meta: { requestId },
          });
        } catch (error: any) {
          return res.status(200).json({
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
              error: error.response?.data?.message || error.message,
            },
            meta: { requestId },
          });
        }
      }

      if (action === 'orders') {
        if (!brokerConfigured) {
          return res.status(200).json({
            success: true,
            data: {
              orders: Array.from(orders.values()),
            },
            meta: { requestId },
          });
        }

        // Fetch from Alpaca
        try {
          const { default: axios } = await import('axios');
          const baseUrl = isPaper
            ? 'https://paper-api.alpaca.markets'
            : 'https://api.alpaca.markets';

          const response = await axios.get(`${baseUrl}/v2/orders`, {
            headers: {
              'APCA-API-KEY-ID': alpacaKey,
              'APCA-API-SECRET-KEY': alpacaSecret,
            },
            params: { limit: 100 },
            timeout: 10000,
          });

          const alpacaOrders = response.data.map((o: any) => ({
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

          return res.status(200).json({
            success: true,
            data: {
              orders: alpacaOrders,
            },
            meta: { requestId },
          });
        } catch (error: any) {
          return res.status(200).json({
            success: true,
            data: {
              orders: Array.from(orders.values()),
              error: error.response?.data?.message || error.message,
            },
            meta: { requestId },
          });
        }
      }

      return res.status(400).json({
        success: false,
        error: 'action parameter required (account or orders)',
        meta: { requestId },
      });
    }

    // POST - Submit order
    if (req.method === 'POST') {
      const orderReq = req.body as OrderRequest;

      // Validate order
      const validation = validateOrder(orderReq);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: validation.errors.join(', '),
          meta: { requestId },
        });
      }

      // If broker is configured, use real API
      if (brokerConfigured) {
        try {
          const { default: axios } = await import('axios');
          const baseUrl = isPaper
            ? 'https://paper-api.alpaca.markets'
            : 'https://api.alpaca.markets';

          const response = await axios.post(
            `${baseUrl}/v2/orders`,
            {
              symbol: orderReq.symbol.toUpperCase(),
              qty: orderReq.qty.toString(),
              side: orderReq.side,
              type: orderReq.type,
              time_in_force: orderReq.timeInForce || 'day',
              limit_price: orderReq.limitPrice?.toString(),
              stop_price: orderReq.stopPrice?.toString(),
            },
            {
              headers: {
                'APCA-API-KEY-ID': alpacaKey,
                'APCA-API-SECRET-KEY': alpacaSecret,
                'Content-Type': 'application/json',
              },
              timeout: 10000,
            }
          );

          const alpacaOrder = response.data;

          return res.status(200).json({
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
              paperTrading: isPaper,
            },
            meta: { requestId },
          });
        } catch (error: any) {
          console.error('[Broker] Alpaca order failed:', error.response?.data || error.message);
          return res.status(500).json({
            success: false,
            error: error.response?.data?.message || 'Order submission failed',
            meta: { requestId },
          });
        }
      }

      // Demo mode - simulate order
      const orderId = `demo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const now = new Date();

      // Get demo price
      const demoPrice = demoPrices[orderReq.symbol.toUpperCase()] || 100 + Math.random() * 100;
      const fillPrice = orderReq.limitPrice || demoPrice;

      // Simulate market order fill
      const isFilled = orderReq.type === 'market';

      const order: Order = {
        id: orderId,
        symbol: orderReq.symbol.toUpperCase(),
        qty: orderReq.qty,
        side: orderReq.side,
        type: orderReq.type,
        status: isFilled ? 'filled' : 'new',
        filledQty: isFilled ? orderReq.qty : 0,
        filledAvgPrice: isFilled ? fillPrice : undefined,
        createdAt: now.toISOString(),
      };

      orders.set(orderId, order);

      return res.status(200).json({
        success: true,
        data: {
          order,
          broker: 'demo',
          paperTrading: true,
          message: 'Demo order submitted. Configure ALPACA_API_KEY for real trading.',
        },
        meta: { requestId },
      });
    }

    // DELETE - Cancel order
    if (req.method === 'DELETE') {
      const { orderId } = req.query;

      if (!orderId) {
        return res.status(400).json({
          success: false,
          error: 'orderId parameter required',
          meta: { requestId },
        });
      }

      if (brokerConfigured) {
        try {
          const { default: axios } = await import('axios');
          const baseUrl = isPaper
            ? 'https://paper-api.alpaca.markets'
            : 'https://api.alpaca.markets';

          await axios.delete(`${baseUrl}/v2/orders/${orderId}`, {
            headers: {
              'APCA-API-KEY-ID': alpacaKey,
              'APCA-API-SECRET-KEY': alpacaSecret,
            },
            timeout: 10000,
          });

          return res.status(200).json({
            success: true,
            data: { canceled: true, orderId },
            meta: { requestId },
          });
        } catch (error: any) {
          return res.status(500).json({
            success: false,
            error: error.response?.data?.message || 'Order cancellation failed',
            meta: { requestId },
          });
        }
      }

      // Demo mode
      const order = orders.get(orderId as string);
      if (order) {
        order.status = 'canceled';
        return res.status(200).json({
          success: true,
          data: { canceled: true, orderId },
          meta: { requestId },
        });
      }

      return res.status(404).json({
        success: false,
        error: 'Order not found',
        meta: { requestId },
      });
    }

    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
      meta: { requestId },
    });
  } catch (error) {
    console.error('Trade endpoint error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      meta: { requestId },
    });
  }
}
