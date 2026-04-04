/**
 * Vercel serverless catch-all — routes all unmatched /api/* requests
 * through the canonical Fastify app via `fastify.inject()`.
 *
 * Vercel's file-based routing gives precedence to specific files
 * (e.g. `api/v1/cvrf/decision.ts`), so this handler only receives
 * requests that don't match a hand-written function. That means every
 * Fastify-only endpoint (tax, ml, options, leaderboard, api-keys, …)
 * is instantly available in production without per-function boilerplate.
 *
 * The Fastify app instance is cached at module scope so warm Vercel
 * invocations reuse it — services like CVRFManager, FactorEngine, and
 * Supabase clients stay initialized across requests on the same container.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

let appPromise: Promise<FastifyInstance> | null = null;

async function getApp(): Promise<FastifyInstance> {
  if (!appPromise) {
    appPromise = buildApp({ websockets: false, enableLogger: false }).then(
      ({ app }) => app
    );
  }
  return appPromise;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  // WebSocket upgrades cannot run on Vercel serverless — client uses SSE fallback.
  if (req.headers.upgrade?.toLowerCase() === 'websocket') {
    res.status(501).json({
      success: false,
      error: {
        code: 'NOT_SUPPORTED',
        message: 'WebSocket not supported on serverless runtime — use SSE fallback',
      },
    });
    return;
  }

  try {
    const app = await getApp();

    // Vercel parses JSON bodies; Fastify.inject() expects a string or buffer.
    let payload: string | Buffer | undefined;
    if (req.body !== undefined && req.body !== null) {
      payload =
        typeof req.body === 'string' || Buffer.isBuffer(req.body)
          ? req.body
          : JSON.stringify(req.body);
    }

    const response = await app.inject({
      method: req.method as any,
      url: req.url ?? '/',
      headers: req.headers as Record<string, string>,
      payload,
    });

    // Mirror Fastify response back through Vercel
    res.status(response.statusCode);
    for (const [key, value] of Object.entries(response.headers)) {
      if (value !== undefined) {
        res.setHeader(key, value as string | string[] | number);
      }
    }
    res.send(response.body);
  } catch (err: any) {
    // Last-resort error handler — Fastify's own error hook should have caught anything routable.
    console.error('[catch-all] Unhandled error', err);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Request handler failed',
      },
    });
  }
}
