/**
 * Shared Zod schemas and validation helper for API endpoints (US-014).
 *
 * Usage:
 *   import { validateBody, schemas } from '../lib/validation.js';
 *   const parsed = validateBody(req, res, schemas.optimizePortfolio);
 *   if (!parsed) return; // 400 already sent
 */

import { z, ZodError, type ZodSchema } from 'zod';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { validationError } from './errorHandler.js';

// ============================================================================
// REUSABLE FIELD SCHEMAS
// ============================================================================

/** Uppercase ticker symbol: 1–10 chars, letters/digits/dots only */
export const symbolSchema = z.string().regex(/^[A-Z0-9.]{1,10}$/, {
  message: 'Symbol must be 1-10 uppercase letters, digits, or dots (e.g. AAPL, BRK.B)',
});

/** Positive number (> 0) */
const positiveNumber = z.number().positive();

// ============================================================================
// ENDPOINT SCHEMAS
// ============================================================================

export const schemas = {
  /** POST /api/v1/portfolio/optimize */
  optimizePortfolio: z.object({
    symbols: z.array(symbolSchema).min(1, 'At least one symbol is required').max(50, 'Maximum 50 symbols allowed'),
    config: z.object({
      objective: z.enum(['max_sharpe', 'min_volatility', 'risk_parity', 'target_volatility', 'equal_weight']).optional(),
      riskFreeRate: z.number().min(0).max(1).optional(),
      targetVolatility: z.number().positive().optional(),
      constraints: z.object({
        minWeight: z.number().min(0).max(1).optional(),
        maxWeight: z.number().min(0).max(1).optional(),
        longOnly: z.boolean().optional(),
      }).optional(),
    }).optional(),
  }),

  /** POST /api/v1/portfolio/positions */
  addPosition: z.object({
    symbol: symbolSchema,
    shares: positiveNumber,
    avgCost: positiveNumber,
  }),

  /** POST /api/v1/cvrf/episode/start */
  startEpisode: z.object({
    watchlist: z.array(symbolSchema).min(1).optional(),
    targetReturn: z.number().positive().optional(),
    maxDrawdown: z.number().positive().lt(100, 'maxDrawdown must be less than 100').optional(),
  }),

  /** POST /api/v1/cvrf/decision */
  recordDecision: z.object({
    symbol: symbolSchema,
    action: z.string().min(1, 'Action is required'),
    weightBefore: z.number().optional(),
    weightAfter: z.number().optional(),
    reason: z.string().optional(),
    confidence: z.number().min(0).max(1).optional(),
    factors: z.array(z.string()).optional(),
  }),

  /** POST /api/v1/trading/orders (place order) */
  placeOrder: z.object({
    symbol: z.string().min(1, 'Symbol is required'),
    qty: z.number().positive().optional(),
    notional: z.number().positive().optional(),
    side: z.enum(['buy', 'sell']),
    type: z.enum(['market', 'limit', 'stop', 'stop_limit', 'trailing_stop']),
    timeInForce: z.enum(['day', 'gtc', 'ioc', 'fok', 'opg', 'cls']).optional(),
    limitPrice: z.number().positive().optional(),
    stopPrice: z.number().positive().optional(),
    trailPercent: z.number().positive().optional(),
    trailPrice: z.number().positive().optional(),
    extendedHours: z.boolean().optional(),
    clientOrderId: z.string().optional(),
    orderClass: z.enum(['simple', 'bracket', 'oco', 'oto']).optional(),
    takeProfit: z.object({ limitPrice: z.number().positive() }).optional(),
    stopLoss: z.object({
      stopPrice: z.number().positive(),
      limitPrice: z.number().positive().optional(),
    }).optional(),
  })
    .refine(
      (data) => data.qty !== undefined || data.notional !== undefined,
      { message: 'Either qty or notional is required', path: ['qty'] },
    )
    .refine(
      (data) => data.type !== 'limit' || data.limitPrice !== undefined,
      { message: 'Limit price is required for limit orders', path: ['limitPrice'] },
    )
    .refine(
      (data) => data.type !== 'stop' || data.stopPrice !== undefined,
      { message: 'Stop price is required for stop orders', path: ['stopPrice'] },
    )
    .refine(
      (data) => data.type !== 'stop_limit' || (data.limitPrice !== undefined && data.stopPrice !== undefined),
      { message: 'Both limit and stop prices are required for stop-limit orders', path: ['limitPrice'] },
    )
    .refine(
      (data) => data.type !== 'trailing_stop' || data.trailPercent !== undefined || data.trailPrice !== undefined,
      { message: 'Trail percent or trail price is required for trailing stop orders', path: ['trailPercent'] },
    ),

  /** POST /api/v1/broker/trade (legacy trade endpoint) */
  legacyOrder: z.object({
    symbol: z.string().min(1, 'Symbol is required'),
    qty: positiveNumber,
    side: z.enum(['buy', 'sell']),
    type: z.enum(['market', 'limit', 'stop', 'stop_limit']),
    timeInForce: z.enum(['day', 'gtc', 'ioc', 'fok']).optional(),
    limitPrice: z.number().positive().optional(),
    stopPrice: z.number().positive().optional(),
  })
    .refine(
      (data) => data.type !== 'limit' || data.limitPrice !== undefined,
      { message: 'Limit price is required for limit orders', path: ['limitPrice'] },
    )
    .refine(
      (data) => data.type !== 'stop' || data.stopPrice !== undefined,
      { message: 'Stop price is required for stop orders', path: ['stopPrice'] },
    )
    .refine(
      (data) => data.type !== 'stop_limit' || (data.limitPrice !== undefined && data.stopPrice !== undefined),
      { message: 'Both limit and stop prices are required for stop-limit orders', path: ['limitPrice'] },
    ),
} as const;

// ============================================================================
// VALIDATION HELPER
// ============================================================================

/**
 * Parse and validate `req.body` against a Zod schema.
 * On failure, sends a 400 VALIDATION_ERROR response and returns `null`.
 * On success, returns the parsed (typed) data.
 */
export function validateBody<T>(
  req: VercelRequest,
  res: VercelResponse,
  schema: ZodSchema<T>,
): T | null {
  const result = schema.safeParse(req.body ?? {});

  if (!result.success) {
    const fieldErrors = formatZodErrors(result.error);
    validationError(res, 'Validation failed', fieldErrors);
    return null;
  }

  return result.data;
}

/**
 * Converts ZodError issues into a flat `{ field: message }` object suitable
 * for the standardized error response `details` field.
 */
function formatZodErrors(error: ZodError): Record<string, unknown> {
  const details: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.') || '_root';
    details[path] = issue.message;
  }
  return details;
}
