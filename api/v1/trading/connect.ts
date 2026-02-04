/**
 * POST /api/v1/trading/connect
 *
 * Connect to a broker account and verify credentials.
 * This endpoint tests the broker connection without storing credentials.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

interface ConnectRequest {
  broker: 'alpaca' | 'mock';
  apiKey?: string;
  apiSecret?: string;
  paperTrading?: boolean;
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
    const body = req.body as ConnectRequest;
    const { broker = 'alpaca', apiKey, apiSecret, paperTrading = true } = body;

    // Use provided credentials or fall back to environment variables
    const key = apiKey || process.env.ALPACA_API_KEY;
    const secret = apiSecret || process.env.ALPACA_API_SECRET;
    const isPaper = paperTrading ?? (process.env.ALPACA_PAPER_TRADING !== 'false');

    if (broker === 'mock') {
      // Mock broker always connects successfully
      return res.status(200).json({
        success: true,
        data: {
          connected: true,
          broker: 'mock',
          paperTrading: true,
          message: 'Connected to mock broker (demo mode)',
        },
        meta: { requestId },
      });
    }

    if (!key || !secret) {
      return res.status(400).json({
        success: false,
        error: 'API key and secret are required for Alpaca connection',
        data: {
          connected: false,
          broker: 'alpaca',
          paperTrading: isPaper,
        },
        meta: { requestId },
      });
    }

    // Test Alpaca connection
    const { default: axios } = await import('axios');
    const baseUrl = isPaper
      ? 'https://paper-api.alpaca.markets'
      : 'https://api.alpaca.markets';

    try {
      const response = await axios.get(`${baseUrl}/v2/account`, {
        headers: {
          'APCA-API-KEY-ID': key,
          'APCA-API-SECRET-KEY': secret,
        },
        timeout: 10000,
      });

      const account = response.data;

      return res.status(200).json({
        success: true,
        data: {
          connected: true,
          broker: 'alpaca',
          paperTrading: isPaper,
          account: {
            id: account.id,
            status: account.status,
            currency: account.currency,
            buyingPower: parseFloat(account.buying_power),
            cash: parseFloat(account.cash),
            portfolioValue: parseFloat(account.portfolio_value),
            patternDayTrader: account.pattern_day_trader,
            tradingBlocked: account.trading_blocked,
            multiplier: account.multiplier,
          },
          message: `Connected to Alpaca (${isPaper ? 'Paper' : 'Live'})`,
        },
        meta: { requestId },
      });
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message;

      return res.status(401).json({
        success: false,
        error: `Failed to connect to Alpaca: ${errorMessage}`,
        data: {
          connected: false,
          broker: 'alpaca',
          paperTrading: isPaper,
        },
        meta: { requestId },
      });
    }
  } catch (error: any) {
    console.error('[Trading Connect] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
      meta: { requestId },
    });
  }
}
