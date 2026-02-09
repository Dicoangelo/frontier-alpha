/**
 * POST /api/v1/backtest/run - Run a walk-forward backtest
 *
 * Accepts backtest configuration and returns results including
 * equity curve, episode returns, and factor attribution.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { BacktestRunner } from '../../../src/backtest/BacktestRunner.js';
import type { BacktestRunConfig } from '../../../src/backtest/BacktestRunner.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST' } });
  }

  const start = Date.now();

  try {
    const body = req.body as Partial<BacktestRunConfig>;

    // Validate required fields
    if (!body.symbols || body.symbols.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'symbols array is required' },
      });
    }

    const config: BacktestRunConfig = {
      symbols: body.symbols,
      startDate: body.startDate || '2023-01-01',
      endDate: body.endDate || new Date().toISOString().split('T')[0],
      initialCapital: body.initialCapital || 100000,
      episodeLengthDays: body.episodeLengthDays || 21,
      strategy: body.strategy || 'max_sharpe',
      useCVRF: body.useCVRF ?? true,
      rebalanceFrequency: body.rebalanceFrequency || 'monthly',
    };

    const runner = new BacktestRunner();
    const result = await runner.run(config);

    return res.status(200).json({
      success: true,
      data: result,
      meta: {
        timestamp: new Date(),
        latencyMs: Date.now() - start,
        persistent: false,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'BACKTEST_ERROR', message: error.message },
    });
  }
}
