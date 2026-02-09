/**
 * FRONTIER ALPHA - Rate Limiting Middleware
 *
 * In-memory rate limiter for Fastify. Supports per-IP and per-API-key limits.
 * No external dependencies (Redis, etc.) -- uses a simple Map with cleanup.
 */

import { FastifyRequest, FastifyReply } from 'fastify';

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
// SINGLETON STORE
// ============================================================================

let store: RateLimiterStore | null = null;

function getStore(): RateLimiterStore {
  if (!store) {
    store = new RateLimiterStore();
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

// ============================================================================
// HELPERS
// ============================================================================

function getClientIp(request: FastifyRequest): string {
  // Check common proxy headers
  const forwarded = request.headers['x-forwarded-for'];
  if (forwarded) {
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return first.trim();
  }
  const realIp = request.headers['x-real-ip'];
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] : realIp;
  }
  return request.ip;
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
  const apiKeyId = (request as any).apiKeyId as string | undefined;
  const apiKeyRateLimit = (request as any).apiKeyRateLimit as number | undefined;

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

  const result = limiter.check(identifier, limit);

  // Always set rate limit headers
  const resetAtSeconds = Math.ceil(result.resetAt / 1000);
  reply.header('X-RateLimit-Limit', result.limit);
  reply.header('X-RateLimit-Remaining', Math.max(0, result.remaining));
  reply.header('X-RateLimit-Reset', resetAtSeconds);

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
  const customStore = new RateLimiterStore(config);
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  return async function customRateLimiter(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const apiKeyId = (request as any).apiKeyId as string | undefined;
    const apiKeyRateLimit = (request as any).apiKeyRateLimit as number | undefined;

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

    const result = customStore.check(identifier, limit);

    const resetAtSeconds = Math.ceil(result.resetAt / 1000);
    reply.header('X-RateLimit-Limit', result.limit);
    reply.header('X-RateLimit-Remaining', Math.max(0, result.remaining));
    reply.header('X-RateLimit-Reset', resetAtSeconds);

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
