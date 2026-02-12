/**
 * GET /api/v1/trading/account
 *
 * Get broker account information including buying power, equity, and positions.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../../lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
    });
  }

  // Require authentication
  const user = await requireAuth(req, res);
  if (!user) {
    return; // requireAuth already sent 401 response
  }

  const requestId = `req-${Math.random().toString(36).slice(2, 8)}`;

  try {
    const alpacaKey = process.env.ALPACA_API_KEY;
    const alpacaSecret = process.env.ALPACA_API_SECRET;
    const isPaper = process.env.ALPACA_PAPER_TRADING !== 'false';

    // Check if broker is configured
    if (!alpacaKey || !alpacaSecret) {
      res.setHeader('X-Data-Source', 'mock');
      return res.status(503).json({
        success: false,
        error: { code: 'BROKER_UNAVAILABLE', message: 'Broker not configured. Set ALPACA_API_KEY and ALPACA_API_SECRET.' },
        meta: { requestId },
      });
    }

    // Fetch from Alpaca
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

    res.setHeader('X-Data-Source', 'live');
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
          dayTradeCount: data.daytrade_count || 0,
          patternDayTrader: data.pattern_day_trader,
          tradingBlocked: data.trading_blocked,
          transfersBlocked: data.transfers_blocked,
          accountBlocked: data.account_blocked,
          multiplier: parseInt(data.multiplier),
          shortingEnabled: data.shorting_enabled,
          equity: parseFloat(data.equity),
          lastEquity: parseFloat(data.last_equity),
          longMarketValue: parseFloat(data.long_market_value),
          shortMarketValue: parseFloat(data.short_market_value),
          initialMargin: parseFloat(data.initial_margin),
          maintenanceMargin: parseFloat(data.maintenance_margin),
          dayTradingBuyingPower: parseFloat(data.daytrading_buying_power),
          regtBuyingPower: parseFloat(data.regt_buying_power),
        },
        brokerConnected: true,
        brokerType: 'alpaca',
        paperTrading: isPaper,
      },
      dataSource: 'live' as const,
      meta: { requestId },
    });
  } catch (error: any) {
    console.error('[Trading Account] Error:', error.response?.data || error.message);

    res.setHeader('X-Data-Source', 'mock');
    return res.status(503).json({
      success: false,
      error: { code: 'BROKER_UNAVAILABLE', message: error.response?.data?.message || error.message },
      meta: { requestId },
    });
  }
}
