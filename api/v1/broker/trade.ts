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

  try {
    // GET - Get orders or account info
    if (req.method === 'GET') {
      const { action } = req.query;

      if (action === 'account') {
        // Return account info
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
            brokerConnected: brokerConfigured,
            brokerType: brokerConfigured ? 'alpaca' : 'demo',
            paperTrading: true,
          },
          meta: { requestId },
        });
      }

      if (action === 'orders') {
        // Return orders
        return res.status(200).json({
          success: true,
          data: {
            orders: Array.from(orders.values()),
          },
          meta: { requestId },
        });
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

          const response = await axios.post(
            'https://paper-api.alpaca.markets/v2/orders',
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
              paperTrading: true,
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
        filledAvgPrice: isFilled ? (orderReq.limitPrice || 100) : undefined,
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

          await axios.delete(
            `https://paper-api.alpaca.markets/v2/orders/${orderId}`,
            {
              headers: {
                'APCA-API-KEY-ID': alpacaKey,
                'APCA-API-SECRET-KEY': alpacaSecret,
              },
              timeout: 10000,
            }
          );

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
