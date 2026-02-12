import type { VercelRequest, VercelResponse } from '@vercel/node';
import { AppError } from './errorHandler.js';

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  keyGenerator?: (req: VercelRequest) => string; // Function to generate rate limit key
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory store (for serverless, consider Redis for production)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (entry.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}, 60000); // Clean up every minute

// Default key generator (by IP or user ID)
function defaultKeyGenerator(req: VercelRequest): string {
  // Try to get user ID from auth header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    // Use a hash of the token as the key
    const token = authHeader.substring(7);
    const hash = token.split('').reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0);
    return `user:${hash}`;
  }

  // Fall back to IP address
  const forwarded = req.headers['x-forwarded-for'];
  const ip = typeof forwarded === 'string' ? forwarded.split(',')[0] : req.socket?.remoteAddress;
  return `ip:${ip || 'unknown'}`;
}

// Rate limiter factory
export function createRateLimiter(config: RateLimitConfig) {
  const { windowMs, maxRequests, keyGenerator = defaultKeyGenerator } = config;

  return function checkRateLimit(req: VercelRequest): {
    allowed: boolean;
    limit: number;
    remaining: number;
    resetAt: number;
    retryAfter?: number;
  } {
    const key = keyGenerator(req);
    const now = Date.now();

    let entry = rateLimitStore.get(key);

    // Create new entry if doesn't exist or expired
    if (!entry || entry.resetAt <= now) {
      entry = {
        count: 0,
        resetAt: now + windowMs,
      };
      rateLimitStore.set(key, entry);
    }

    // Increment count
    entry.count++;

    const remaining = Math.max(0, maxRequests - entry.count);
    const allowed = entry.count <= maxRequests;
    const retryAfter = allowed ? undefined : Math.ceil((entry.resetAt - now) / 1000);

    return {
      allowed,
      limit: maxRequests,
      remaining,
      resetAt: entry.resetAt,
      retryAfter,
    };
  };
}

// Preset rate limiters for different API tiers
export const rateLimiters = {
  // Free tier: 100 requests per minute
  free: createRateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 100,
  }),

  // Pro tier: 500 requests per minute
  pro: createRateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 500,
  }),

  // API tier: 1000 requests per minute
  api: createRateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 1000,
  }),

  // Strict: 10 requests per minute (for expensive operations)
  strict: createRateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 10,
  }),

  // Burst: 20 requests per second (for real-time data)
  burst: createRateLimiter({
    windowMs: 1000,
    maxRequests: 20,
  }),
};

// Rate limit middleware wrapper
export function withRateLimit(
  handler: (req: VercelRequest, res: VercelResponse) => Promise<void>,
  limiter: ReturnType<typeof createRateLimiter> = rateLimiters.free
) {
  return async (req: VercelRequest, res: VercelResponse): Promise<void> => {
    const result = limiter(req);

    // Set standard rate limit headers (RFC draft-ietf-httpapi-ratelimit-headers)
    res.setHeader('RateLimit-Limit', result.limit);
    res.setHeader('RateLimit-Remaining', result.remaining);
    res.setHeader('RateLimit-Reset', Math.ceil(result.resetAt / 1000));

    if (!result.allowed) {
      const retryAfterSeconds = result.retryAfter || 60;
      res.setHeader('Retry-After', retryAfterSeconds);
      throw AppError.rateLimited(retryAfterSeconds);
    }

    await handler(req, res);
  };
}

// API quota tracking for external services
interface ApiQuota {
  service: string;
  limit: number;
  used: number;
  resetAt: Date;
}

const apiQuotas = new Map<string, ApiQuota>();

// Track API quota usage
export function trackApiQuota(service: string, limit: number): ApiQuota {
  const now = new Date();
  let quota = apiQuotas.get(service);

  // Reset if day has changed
  if (!quota || quota.resetAt <= now) {
    const tomorrow = new Date();
    tomorrow.setHours(24, 0, 0, 0);

    quota = {
      service,
      limit,
      used: 0,
      resetAt: tomorrow,
    };
    apiQuotas.set(service, quota);
  }

  return quota;
}

// Check and increment API quota
export function useApiQuota(service: string, limit: number, count: number = 1): boolean {
  const quota = trackApiQuota(service, limit);

  if (quota.used + count > quota.limit) {
    console.warn(`API quota exceeded for ${service}: ${quota.used}/${quota.limit}`);
    return false;
  }

  quota.used += count;
  return true;
}

// Get current quota status
export function getQuotaStatus(service: string, limit: number): {
  remaining: number;
  used: number;
  limit: number;
  resetAt: Date;
} {
  const quota = trackApiQuota(service, limit);
  return {
    remaining: Math.max(0, quota.limit - quota.used),
    used: quota.used,
    limit: quota.limit,
    resetAt: quota.resetAt,
  };
}

// Polygon API quota (5 calls/min for free tier)
export const polygonQuota = {
  check: () => useApiQuota('polygon', 5),
  status: () => getQuotaStatus('polygon', 5),
};

// Alpha Vantage API quota (5 calls/min for free tier)
export const alphaVantageQuota = {
  check: () => useApiQuota('alphaVantage', 5),
  status: () => getQuotaStatus('alphaVantage', 5),
};

// Combined rate limit and quota check
export function withQuotaCheck(
  service: 'polygon' | 'alphaVantage',
  handler: (req: VercelRequest, res: VercelResponse) => Promise<void>
) {
  const quotaChecker = service === 'polygon' ? polygonQuota : alphaVantageQuota;

  return async (req: VercelRequest, res: VercelResponse): Promise<void> => {
    if (!quotaChecker.check()) {
      const status = quotaChecker.status();
      const retryAfter = Math.ceil((status.resetAt.getTime() - Date.now()) / 1000);

      throw new AppError(
        'RATE_LIMITED',
        `${service} API quota exceeded. Resets at ${status.resetAt.toISOString()}`,
        429,
        { service, ...status },
        retryAfter
      );
    }

    await handler(req, res);
  };
}
