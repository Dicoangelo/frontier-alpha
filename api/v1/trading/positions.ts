/**
 * GET /api/v1/trading/positions
 *
 * Get current positions from the connected broker.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

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

  const requestId = `req-${Math.random().toString(36).slice(2, 8)}`;

  try {
    const alpacaKey = process.env.ALPACA_API_KEY;
    const alpacaSecret = process.env.ALPACA_API_SECRET;
    const isPaper = process.env.ALPACA_PAPER_TRADING !== 'false';

    // Check if broker is configured
    if (!alpacaKey || !alpacaSecret) {
      // Return empty positions for demo mode
      return res.status(200).json({
        success: true,
        data: {
          positions: [],
          brokerConnected: false,
          brokerType: 'demo',
          paperTrading: true,
        },
        meta: { requestId },
      });
    }

    // Fetch from Alpaca
    const { default: axios } = await import('axios');
    const baseUrl = isPaper
      ? 'https://paper-api.alpaca.markets'
      : 'https://api.alpaca.markets';

    const response = await axios.get(`${baseUrl}/v2/positions`, {
      headers: {
        'APCA-API-KEY-ID': alpacaKey,
        'APCA-API-SECRET-KEY': alpacaSecret,
      },
      timeout: 10000,
    });

    const positions = response.data.map((p: any) => {
      const qty = parseFloat(p.qty);
      return {
        symbol: p.symbol,
        qty: Math.abs(qty),
        side: qty >= 0 ? 'long' : 'short',
        marketValue: parseFloat(p.market_value),
        costBasis: parseFloat(p.cost_basis),
        unrealizedPnL: parseFloat(p.unrealized_pl),
        unrealizedPnLPercent: parseFloat(p.unrealized_plpc) * 100,
        currentPrice: parseFloat(p.current_price),
        avgEntryPrice: parseFloat(p.avg_entry_price),
        changeToday: parseFloat(p.change_today) * 100,
        assetId: p.asset_id,
        assetClass: p.asset_class,
        exchange: p.exchange,
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        positions,
        count: positions.length,
        brokerConnected: true,
        brokerType: 'alpaca',
        paperTrading: isPaper,
      },
      meta: { requestId },
    });
  } catch (error: any) {
    console.error('[Trading Positions] Error:', error.response?.data || error.message);

    return res.status(200).json({
      success: true,
      data: {
        positions: [],
        brokerConnected: false,
        brokerType: 'demo',
        paperTrading: true,
        error: error.response?.data?.message || error.message,
      },
      meta: { requestId },
    });
  }
}
