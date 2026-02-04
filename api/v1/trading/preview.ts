/**
 * POST /api/v1/trading/preview
 *
 * Preview an order before submission.
 * Returns estimated cost, fees, and validation results.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

interface OrderPreviewRequest {
  symbol: string;
  qty?: number;
  notional?: number;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop' | 'stop_limit' | 'trailing_stop';
  limitPrice?: number;
  stopPrice?: number;
}

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
  QQQ: 405.75,
};

function getDemoPrice(symbol: string): number {
  return demoPrices[symbol.toUpperCase()] || 100 + Math.random() * 200;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
    });
  }

  const requestId = `req-${Math.random().toString(36).slice(2, 8)}`;

  try {
    const orderReq = req.body as OrderPreviewRequest;

    // Validation
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!orderReq.symbol || orderReq.symbol.length === 0) {
      errors.push('Symbol is required');
    }

    if ((!orderReq.qty || orderReq.qty <= 0) && (!orderReq.notional || orderReq.notional <= 0)) {
      errors.push('Either quantity or notional amount must be positive');
    }

    if (!['buy', 'sell'].includes(orderReq.side)) {
      errors.push('Side must be "buy" or "sell"');
    }

    if (!['market', 'limit', 'stop', 'stop_limit', 'trailing_stop'].includes(orderReq.type)) {
      errors.push('Invalid order type');
    }

    if (orderReq.type === 'limit' && !orderReq.limitPrice) {
      errors.push('Limit price is required for limit orders');
    }

    if (orderReq.type === 'stop' && !orderReq.stopPrice) {
      errors.push('Stop price is required for stop orders');
    }

    if (orderReq.type === 'stop_limit' && (!orderReq.limitPrice || !orderReq.stopPrice)) {
      errors.push('Both limit and stop prices are required for stop-limit orders');
    }

    // Get quote for estimation
    const alpacaKey = process.env.ALPACA_API_KEY;
    const alpacaSecret = process.env.ALPACA_API_SECRET;

    let currentPrice = getDemoPrice(orderReq.symbol);
    let bid = currentPrice - currentPrice * 0.001;
    let ask = currentPrice + currentPrice * 0.001;
    let source = 'demo';

    if (alpacaKey && alpacaSecret && orderReq.symbol) {
      try {
        const { default: axios } = await import('axios');
        const response = await axios.get(
          `https://data.alpaca.markets/v2/stocks/${orderReq.symbol}/quotes/latest`,
          {
            headers: {
              'APCA-API-KEY-ID': alpacaKey,
              'APCA-API-SECRET-KEY': alpacaSecret,
            },
            timeout: 5000,
          }
        );

        const q = response.data.quote;
        bid = q.bp;
        ask = q.ap;
        currentPrice = (bid + ask) / 2;
        source = 'alpaca';
      } catch (e) {
        // Use demo price
        warnings.push('Could not fetch live quote, using estimated price');
      }
    }

    // Calculate estimates
    const estimatedPrice = orderReq.limitPrice || (orderReq.side === 'buy' ? ask : bid);
    const qty = orderReq.qty || (orderReq.notional ? orderReq.notional / estimatedPrice : 0);
    const estimatedCost = qty * estimatedPrice;
    const estimatedFees = 0; // Alpaca is commission-free
    const estimatedTotal = estimatedCost + estimatedFees;

    // Add warnings
    if (orderReq.type === 'market') {
      warnings.push('Market orders execute at current market price which may differ from displayed price');
    }

    if (estimatedCost > 10000) {
      warnings.push('Large order - consider using limit order for better price control');
    }

    // Determine market impact
    let marketImpact: 'low' | 'medium' | 'high' = 'low';
    if (estimatedCost > 100000) {
      marketImpact = 'high';
      warnings.push('Order size may impact market price');
    } else if (estimatedCost > 25000) {
      marketImpact = 'medium';
    }

    // Get account info for buying power check
    let buyingPower = 100000;
    let accountStatus = 'active';

    if (alpacaKey && alpacaSecret) {
      try {
        const { default: axios } = await import('axios');
        const isPaper = process.env.ALPACA_PAPER_TRADING !== 'false';
        const baseUrl = isPaper
          ? 'https://paper-api.alpaca.markets'
          : 'https://api.alpaca.markets';

        const response = await axios.get(`${baseUrl}/v2/account`, {
          headers: {
            'APCA-API-KEY-ID': alpacaKey,
            'APCA-API-SECRET-KEY': alpacaSecret,
          },
          timeout: 5000,
        });

        buyingPower = parseFloat(response.data.buying_power);
        accountStatus = response.data.status;
      } catch (e) {
        // Use default
      }
    }

    // Check buying power
    if (orderReq.side === 'buy' && estimatedTotal > buyingPower) {
      errors.push(`Insufficient buying power. Required: $${estimatedTotal.toFixed(2)}, Available: $${buyingPower.toFixed(2)}`);
    }

    // Calculate slippage estimate (for market orders)
    let slippageEstimate = 0;
    if (orderReq.type === 'market') {
      // Estimate 0.1% slippage for small orders, up to 0.5% for large ones
      const slippageRate = Math.min(0.005, 0.001 + (estimatedCost / 1000000) * 0.004);
      slippageEstimate = estimatedCost * slippageRate;
    }

    return res.status(200).json({
      success: true,
      data: {
        preview: {
          symbol: orderReq.symbol.toUpperCase(),
          side: orderReq.side,
          type: orderReq.type,
          qty: Math.floor(qty * 10000) / 10000, // Round to 4 decimal places
          currentPrice: parseFloat(currentPrice.toFixed(2)),
          bid: parseFloat(bid.toFixed(2)),
          ask: parseFloat(ask.toFixed(2)),
          estimatedPrice: parseFloat(estimatedPrice.toFixed(2)),
          estimatedCost: parseFloat(estimatedCost.toFixed(2)),
          estimatedFees,
          estimatedTotal: parseFloat(estimatedTotal.toFixed(2)),
          slippageEstimate: parseFloat(slippageEstimate.toFixed(2)),
          marketImpact,
        },
        account: {
          buyingPower: parseFloat(buyingPower.toFixed(2)),
          status: accountStatus,
          remainingBuyingPower: parseFloat((buyingPower - estimatedTotal).toFixed(2)),
        },
        validation: {
          valid: errors.length === 0,
          errors,
          warnings,
        },
        source,
      },
      meta: { requestId },
    });
  } catch (error: any) {
    console.error('[Trading Preview] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
      meta: { requestId },
    });
  }
}
