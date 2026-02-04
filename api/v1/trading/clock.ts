/**
 * GET /api/v1/trading/clock
 *
 * Get market clock information including open/close status.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

function getDemoMarketClock() {
  const now = new Date();
  const hour = now.getUTCHours();
  const day = now.getUTCDay();

  // US Market hours: 9:30 AM - 4:00 PM ET (14:30 - 21:00 UTC)
  const isWeekday = day >= 1 && day <= 5;
  const isDuringHours = hour >= 14 && hour < 21;
  const isOpen = isWeekday && isDuringHours;

  const nextOpen = new Date(now);
  nextOpen.setUTCHours(14, 30, 0, 0);
  if (now >= nextOpen) {
    nextOpen.setDate(nextOpen.getDate() + 1);
  }
  while (nextOpen.getUTCDay() === 0 || nextOpen.getUTCDay() === 6) {
    nextOpen.setDate(nextOpen.getDate() + 1);
  }

  const nextClose = new Date(now);
  nextClose.setUTCHours(21, 0, 0, 0);

  return {
    isOpen,
    nextOpen: nextOpen.toISOString(),
    nextClose: nextClose.toISOString(),
    timestamp: now.toISOString(),
  };
}

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
      return res.status(200).json({
        success: true,
        data: {
          ...getDemoMarketClock(),
          source: 'demo',
        },
        meta: { requestId },
      });
    }

    // Fetch from Alpaca
    const { default: axios } = await import('axios');
    const baseUrl = isPaper
      ? 'https://paper-api.alpaca.markets'
      : 'https://api.alpaca.markets';

    try {
      const response = await axios.get(`${baseUrl}/v2/clock`, {
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
          isOpen: data.is_open,
          nextOpen: data.next_open,
          nextClose: data.next_close,
          timestamp: data.timestamp,
          source: 'alpaca',
        },
        meta: { requestId },
      });
    } catch (error: any) {
      console.error('[Trading Clock] Alpaca error:', error.response?.data || error.message);

      // Fall back to demo clock
      return res.status(200).json({
        success: true,
        data: {
          ...getDemoMarketClock(),
          source: 'demo',
          error: error.response?.data?.message || error.message,
        },
        meta: { requestId },
      });
    }
  } catch (error: any) {
    console.error('[Trading Clock] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
      meta: { requestId },
    });
  }
}
