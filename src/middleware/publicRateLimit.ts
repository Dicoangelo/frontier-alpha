/**
 * FRONTIER ALPHA - Public Route Rate Limiter (in-memory)
 *
 * A deliberately lightweight, in-process fixed-window limiter for the PUBLIC
 * quote REST endpoints (`/api/v1/quotes/:symbol` and `/:symbol/history`).
 * These routes have no auth preHandler and, now that the app is public, are
 * reachable by anonymous internet traffic that proxies Polygon.
 *
 * Why not reuse `rateLimiterMiddleware` here: that limiter is Supabase-backed
 * in production (an RPC round-trip per request) which is too heavy for these
 * hot, unauthenticated read paths. This limiter adds zero latency and makes
 * no external calls — a plain Map keyed by client IP with a periodic sweep.
 *
 * The limit is intentionally generous so a normal dashboard load never trips
 * it: one load fires quotes + history for ~5-8 symbols, sometimes twice, so
 * ~16-32 requests per load. 120 req/min/IP leaves several loads of headroom.
 */

import { FastifyRequest, FastifyReply } from 'fastify';

// ============================================================================
// CONFIG
// ============================================================================

/** Max requests per window, per client IP. */
const PUBLIC_LIMIT = 120;
/** Fixed-window size in milliseconds. */
const WINDOW_MS = 60 * 1000;
/** How often to sweep expired buckets to keep the Map bounded. */
const CLEANUP_INTERVAL_MS = 60 * 1000;

// ============================================================================
// STORE
// ============================================================================

interface Bucket {
  count: number;
  resetAt: number; // Unix timestamp in ms
}

const buckets = new Map<string, Bucket>();

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) {
      buckets.delete(key);
    }
  }
}, CLEANUP_INTERVAL_MS);

// Don't keep the Node process alive just for the sweep.
if (typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
  cleanupTimer.unref();
}

// ============================================================================
// CLIENT IP RESOLUTION
// ============================================================================

/**
 * Resolve the originating client IP behind Vercel / Railway / direct Fastify.
 * Mirrors the header preference used by the Supabase-backed limiter so the two
 * paths key the same anonymous client to the same identifier: prefer Vercel's
 * stable `x-vercel-forwarded-for` and Cloudflare's `cf-connecting-ip`, then
 * `x-real-ip`, then the first hop of XFF, and finally Fastify's `request.ip`.
 */
function pickHeader(value: string | string[] | undefined): string | null {
  if (!value) return null;
  const v = Array.isArray(value) ? value[0] : value;
  return v.split(',')[0].trim() || null;
}

function getClientIp(request: FastifyRequest): string {
  return (
    pickHeader(request.headers['x-vercel-forwarded-for']) ||
    pickHeader(request.headers['cf-connecting-ip']) ||
    pickHeader(request.headers['x-real-ip']) ||
    pickHeader(request.headers['x-forwarded-for']) ||
    request.ip
  );
}

// ============================================================================
// MIDDLEWARE
// ============================================================================

/**
 * Fastify preHandler for the public quote REST routes. Pure in-memory, no
 * external calls. On exceed, returns 429 with the repo's standard error
 * envelope and a `Retry-After` header; otherwise sets standard RateLimit-*
 * headers and lets the request through unchanged.
 */
export async function publicRateLimit(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const now = Date.now();
  const key = getClientIp(request);
  const bucket = buckets.get(key);

  let count: number;
  let resetAt: number;

  if (!bucket || now >= bucket.resetAt) {
    // No bucket or window expired — start a fresh window.
    resetAt = now + WINDOW_MS;
    count = 1;
    buckets.set(key, { count, resetAt });
  } else {
    bucket.count += 1;
    count = bucket.count;
    resetAt = bucket.resetAt;
  }

  reply.header('RateLimit-Limit', PUBLIC_LIMIT);
  reply.header('RateLimit-Remaining', Math.max(0, PUBLIC_LIMIT - count));
  reply.header('RateLimit-Reset', Math.ceil(resetAt / 1000));

  if (count > PUBLIC_LIMIT) {
    const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000));
    reply.header('Retry-After', retryAfterSeconds);

    return reply.status(429).send({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please try again later.',
        retryAfter: retryAfterSeconds,
      },
    });
  }
}

/** Reset the in-memory store (for tests). */
export function resetPublicRateLimit(): void {
  buckets.clear();
}
