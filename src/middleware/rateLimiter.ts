/**
 * FRONTIER ALPHA - Rate Limiting Middleware
 *
 * Two-tier rate limiter for Fastify. Uses Supabase as the durable shared
 * counter when SUPABASE_SERVICE_KEY is present (production / staging), and
 * falls back to an in-process Map for local dev. The Supabase path is the
 * default in production because Vercel cold starts blow away in-memory
 * state, so the in-memory store would silently leak limits across instances.
 *
 * Atomicity is enforced server-side via the `rate_limit_check(text,int,int)`
 * Postgres function — single round-trip UPSERT that increments or rolls the
 * window depending on `reset_at`. See `supabase/migrations/*frontier_rate_limits.sql`.
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { supabaseAdmin } from '../lib/supabase.js';
import { logger } from '../observability/logger.js';

// ============================================================================
// TYPES
// ============================================================================

interface RateLimitEntry {
  count: number;
  resetAt: number; // Unix timestamp in ms
}

interface RateLimitConfig {
  /** Max requests per window for unauthenticated (IP-based) */
  unauthenticatedLimit: number;
  /** Max requests per window for authenticated (API key) */
  authenticatedLimit: number;
  /** Window size in milliseconds */
  windowMs: number;
  /** How often to sweep expired entries (ms) */
  cleanupIntervalMs: number;
}

// ============================================================================
// DEFAULTS
// ============================================================================

const DEFAULT_CONFIG: RateLimitConfig = {
  unauthenticatedLimit: 100,   // 100 req/min for anonymous
  authenticatedLimit: 1000,     // 1000 req/min for API key holders
  windowMs: 60 * 1000,         // 1 minute window
  cleanupIntervalMs: 60 * 1000, // Cleanup every minute
};

// ============================================================================
// RATE LIMITER STORE
// ============================================================================

class RateLimiterStore {
  private store: Map<string, RateLimitEntry> = new Map();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private config: RateLimitConfig;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startCleanup();
  }

  /**
   * Check and increment request count for an identifier.
   * Returns { allowed, limit, remaining, resetAt }.
   */
  check(identifier: string, limit: number): {
    allowed: boolean;
    limit: number;
    remaining: number;
    resetAt: number;
  } {
    const now = Date.now();
    const entry = this.store.get(identifier);

    // No entry or window expired -- create fresh entry
    if (!entry || now >= entry.resetAt) {
      const resetAt = now + this.config.windowMs;
      this.store.set(identifier, { count: 1, resetAt });
      return {
        allowed: true,
        limit,
        remaining: limit - 1,
        resetAt,
      };
    }

    // Window still active -- increment
    entry.count += 1;

    if (entry.count > limit) {
      return {
        allowed: false,
        limit,
        remaining: 0,
        resetAt: entry.resetAt,
      };
    }

    return {
      allowed: true,
      limit,
      remaining: limit - entry.count,
      resetAt: entry.resetAt,
    };
  }

  /** Sweep expired entries to prevent memory leaks */
  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.store) {
        if (now >= entry.resetAt) {
          this.store.delete(key);
        }
      }
    }, this.config.cleanupIntervalMs);

    // Don't block Node process exit
    if (this.cleanupTimer && typeof this.cleanupTimer === 'object' && 'unref' in this.cleanupTimer) {
      this.cleanupTimer.unref();
    }
  }

  /** Stop cleanup timer (for graceful shutdown / tests) */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.store.clear();
  }

  /** Get current store size (for monitoring) */
  get size(): number {
    return this.store.size;
  }
}

// ============================================================================
// SUPABASE-BACKED STORE
// ============================================================================

/**
 * Shared rate-limit store backed by Postgres via the `rate_limit_check` RPC.
 * One round-trip per request, atomic UPSERT semantics, durable across Vercel
 * cold starts. Falls back to the in-memory store when the RPC errors so a
 * Supabase blip cannot wedge the API.
 */
class SupabaseRateLimiterStore {
  private fallback: RateLimiterStore;
  private windowMs: number;

  constructor(config: Partial<RateLimitConfig> = {}) {
    const merged = { ...DEFAULT_CONFIG, ...config };
    this.windowMs = merged.windowMs;
    // Memory fallback is used only when Supabase RPC fails.
    this.fallback = new RateLimiterStore(config);
  }

  async check(
    identifier: string,
    limit: number
  ): Promise<{ allowed: boolean; limit: number; remaining: number; resetAt: number }> {
    try {
      const { data, error } = await supabaseAdmin.rpc('rate_limit_check', {
        p_identifier: identifier,
        p_limit: limit,
        p_window_ms: this.windowMs,
      });
      if (error || !data || (Array.isArray(data) && data.length === 0)) {
        throw error ?? new Error('rate_limit_check returned no rows');
      }
      const row = (Array.isArray(data) ? data[0] : data) as {
        allowed: boolean;
        remaining: number;
        reset_at: string;
      };
      return {
        allowed: row.allowed,
        limit,
        remaining: row.remaining,
        resetAt: new Date(row.reset_at).getTime(),
      };
    } catch (err) {
      // Don't block the request on a database hiccup — degrade to in-memory.
      logger.warn(
        { err, identifier },
        'rate_limit_check RPC failed, falling back to in-memory store',
      );
      return this.fallback.check(identifier, limit);
    }
  }

  destroy(): void {
    this.fallback.destroy();
  }
}

interface SharedStore {
  check(
    identifier: string,
    limit: number,
  ):
    | { allowed: boolean; limit: number; remaining: number; resetAt: number }
    | Promise<{ allowed: boolean; limit: number; remaining: number; resetAt: number }>;
  destroy(): void;
}

// ============================================================================
// SINGLETON STORE
// ============================================================================

let store: SharedStore | null = null;

function getStore(): SharedStore {
  if (!store) {
    // Prefer the Supabase-backed store when the service key is present,
    // which is the case for both Vercel production and Railway. Local dev
    // without SUPABASE_SERVICE_KEY transparently falls back to in-memory.
    store = process.env.SUPABASE_SERVICE_KEY
      ? new SupabaseRateLimiterStore()
      : new RateLimiterStore();
  }
  return store;
}

/** Reset the store (useful for tests) */
export function resetRateLimiterStore(): void {
  if (store) {
    store.destroy();
    store = null;
  }
}

/** Identify which mode is active — used by /health/integrations. */
export function getRateLimiterMode(): 'supabase' | 'memory' {
  return process.env.SUPABASE_SERVICE_KEY ? 'supabase' : 'memory';
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Resolve the originating client IP behind Vercel / Railway / direct Fastify.
 *
 * Vercel rewrites `x-forwarded-for` with a chain that often puts a Vercel
 * PoP IP first (216.73.162.x range), so reading [0] silently rate-limits
 * the wrong identifier — every request looks like a fresh client. Prefer
 * Vercel's stable `x-vercel-forwarded-for` and Cloudflare's `cf-connecting-ip`
 * header when present, then `x-real-ip`, then the LAST entry of XFF (the
 * one closest to our service, most reliable behind a proxy chain we trust),
 * and finally Fastify's own `request.ip`.
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
 * Rate limiting middleware for Fastify preHandler hook.
 *
 * - Unauthenticated requests: limited by IP (100 req/min)
 * - Authenticated via API key: limited by key identifier (1000 req/min or custom)
 * - Authenticated via Bearer JWT: limited by user ID (1000 req/min)
 *
 * Sets standard rate limit headers on every response.
 * Returns 429 with retry-after when limit exceeded.
 */
export async function rateLimiterMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const limiter = getStore();

  // Determine the identifier and limit
  let identifier: string;
  let limit: number;

  // Check if request was authenticated via API key (set by apiKeyAuthMiddleware)
  const apiKeyId = (request as unknown as Record<string, unknown>).apiKeyId as string | undefined;
  const apiKeyRateLimit = (request as unknown as Record<string, unknown>).apiKeyRateLimit as number | undefined;

  if (apiKeyId) {
    // Authenticated via API key
    identifier = `apikey:${apiKeyId}`;
    limit = apiKeyRateLimit || DEFAULT_CONFIG.authenticatedLimit;
  } else if (request.user) {
    // Authenticated via JWT Bearer token
    identifier = `user:${request.user.id}`;
    limit = DEFAULT_CONFIG.authenticatedLimit;
  } else {
    // Unauthenticated -- rate limit by IP
    identifier = `ip:${getClientIp(request)}`;
    limit = DEFAULT_CONFIG.unauthenticatedLimit;
  }

  const result = await Promise.resolve(limiter.check(identifier, limit));

  // Always set standard rate limit headers (RFC draft-ietf-httpapi-ratelimit-headers)
  const resetAtSeconds = Math.ceil(result.resetAt / 1000);
  reply.header('RateLimit-Limit', result.limit);
  reply.header('RateLimit-Remaining', Math.max(0, result.remaining));
  reply.header('RateLimit-Reset', resetAtSeconds);

  if (!result.allowed) {
    const retryAfterSeconds = Math.ceil((result.resetAt - Date.now()) / 1000);
    reply.header('Retry-After', Math.max(1, retryAfterSeconds));

    return reply.status(429).send({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please try again later.',
        retryAfter: Math.max(1, retryAfterSeconds),
      },
    });
  }
}

/**
 * Create a rate limiter with custom configuration.
 * Returns a Fastify preHandler-compatible function.
 */
export function createRateLimiter(config: Partial<RateLimitConfig> = {}) {
  const customStore: SharedStore = process.env.SUPABASE_SERVICE_KEY
    ? new SupabaseRateLimiterStore(config)
    : new RateLimiterStore(config);
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  return async function customRateLimiter(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const apiKeyId = (request as unknown as Record<string, unknown>).apiKeyId as string | undefined;
    const apiKeyRateLimit = (request as unknown as Record<string, unknown>).apiKeyRateLimit as number | undefined;

    let identifier: string;
    let limit: number;

    if (apiKeyId) {
      identifier = `apikey:${apiKeyId}`;
      limit = apiKeyRateLimit || mergedConfig.authenticatedLimit;
    } else if (request.user) {
      identifier = `user:${request.user.id}`;
      limit = mergedConfig.authenticatedLimit;
    } else {
      identifier = `ip:${getClientIp(request)}`;
      limit = mergedConfig.unauthenticatedLimit;
    }

    const result = await Promise.resolve(customStore.check(identifier, limit));

    const resetAtSeconds = Math.ceil(result.resetAt / 1000);
    reply.header('RateLimit-Limit', result.limit);
    reply.header('RateLimit-Remaining', Math.max(0, result.remaining));
    reply.header('RateLimit-Reset', resetAtSeconds);

    if (!result.allowed) {
      const retryAfterSeconds = Math.ceil((result.resetAt - Date.now()) / 1000);
      reply.header('Retry-After', Math.max(1, retryAfterSeconds));

      return reply.status(429).send({
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Please try again later.',
          retryAfter: Math.max(1, retryAfterSeconds),
        },
      });
    }
  };
}
