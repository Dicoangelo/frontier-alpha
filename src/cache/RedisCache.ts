/**
 * RedisCache - Redis-based caching layer for Frontier Alpha
 *
 * Features:
 * - Quote caching (5 minute TTL)
 * - Factor data caching
 * - API response caching
 * - Graceful degradation when Redis unavailable
 */

import { logger } from '../lib/logger.js';

// Redis client interface (compatible with ioredis)
interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode?: string, duration?: number): Promise<string | null>;
  setex(key: string, seconds: number, value: string): Promise<string>;
  del(...keys: string[]): Promise<number>;
  keys(pattern: string): Promise<string[]>;
  exists(...keys: string[]): Promise<number>;
  ttl(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  mget(...keys: string[]): Promise<(string | null)[]>;
  ping(): Promise<string>;
  quit(): Promise<string>;
}

// Cache configuration
export interface CacheConfig {
  enabled: boolean;
  redisUrl?: string;
  defaultTtlSeconds: number;
  keyPrefix: string;
  quoteTtlSeconds: number;
  factorTtlSeconds: number;
  apiTtlSeconds: number;
}

// Cache statistics
interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  errors: number;
}

// In-memory fallback cache
class InMemoryCache {
  private cache = new Map<string, { value: string; expiresAt: number }>();
  private maxSize = 10000;

  get(key: string): string | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  set(key: string, value: string, ttlSeconds: number): void {
    // Evict oldest entries if cache is full
    if (this.cache.size >= this.maxSize) {
      const keysToDelete = Array.from(this.cache.keys()).slice(0, this.maxSize / 4);
      for (const k of keysToDelete) {
        this.cache.delete(k);
      }
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  deletePattern(pattern: string): number {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    let count = 0;

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }

    return count;
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

export class RedisCache {
  private client: RedisClient | null = null;
  private memoryCache: InMemoryCache;
  private config: CacheConfig;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    errors: 0,
  };
  private connected = false;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      redisUrl: config.redisUrl || process.env.REDIS_URL,
      defaultTtlSeconds: config.defaultTtlSeconds || 300, // 5 minutes
      keyPrefix: config.keyPrefix || 'frontier:',
      quoteTtlSeconds: config.quoteTtlSeconds || 60, // 1 minute for quotes
      factorTtlSeconds: config.factorTtlSeconds || 3600, // 1 hour for factors
      apiTtlSeconds: config.apiTtlSeconds || 300, // 5 minutes for API responses
    };

    this.memoryCache = new InMemoryCache();

    // Connect to Redis if URL provided and not local dev without Redis
    if (this.config.enabled && this.config.redisUrl && process.env.NODE_ENV === 'production') {
      this.connectRedis();
    }
  }

  /**
   * Connect to Redis
   */
  private async connectRedis(): Promise<void> {
    try {
      // Dynamic import to avoid issues if ioredis not installed
      const ioredis = await import('ioredis');
      const Redis = ioredis.default || ioredis;

      this.client = new (Redis as unknown as new (url: string, opts: Record<string, unknown>) => RedisClient)(this.config.redisUrl!, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => {
          if (times > 3) return null; // Stop retrying
          return Math.min(times * 200, 3000);
        },
        lazyConnect: true,
      });

      await this.client.ping();
      this.connected = true;
      logger.info('RedisCache connected');
    } catch (error) {
      logger.warn({ err: error }, 'RedisCache failed to connect, using in-memory fallback');
      this.client = null;
      this.connected = false;
    }
  }

  /**
   * Build cache key with prefix
   */
  private buildKey(key: string): string {
    return `${this.config.keyPrefix}${key}`;
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    const fullKey = this.buildKey(key);

    try {
      let value: string | null = null;

      if (this.client && this.connected) {
        value = await this.client.get(fullKey);
      } else {
        value = this.memoryCache.get(fullKey);
      }

      if (value) {
        this.stats.hits++;
        return JSON.parse(value) as T;
      }

      this.stats.misses++;
      return null;
    } catch (error) {
      this.stats.errors++;
      logger.error({ err: error }, 'RedisCache get error');
      return null;
    }
  }

  /**
   * Set value in cache
   */
  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<boolean> {
    const fullKey = this.buildKey(key);
    const ttl = ttlSeconds || this.config.defaultTtlSeconds;

    try {
      const serialized = JSON.stringify(value);

      if (this.client && this.connected) {
        await this.client.setex(fullKey, ttl, serialized);
      } else {
        this.memoryCache.set(fullKey, serialized, ttl);
      }

      this.stats.sets++;
      return true;
    } catch (error) {
      this.stats.errors++;
      logger.error({ err: error }, 'RedisCache set error');
      return false;
    }
  }

  /**
   * Delete value from cache
   */
  async delete(key: string): Promise<boolean> {
    const fullKey = this.buildKey(key);

    try {
      if (this.client && this.connected) {
        await this.client.del(fullKey);
      } else {
        this.memoryCache.delete(fullKey);
      }

      this.stats.deletes++;
      return true;
    } catch (error) {
      this.stats.errors++;
      logger.error({ err: error }, 'RedisCache delete error');
      return false;
    }
  }

  /**
   * Delete all keys matching pattern
   */
  async deletePattern(pattern: string): Promise<number> {
    const fullPattern = this.buildKey(pattern);

    try {
      if (this.client && this.connected) {
        const keys = await this.client.keys(fullPattern);
        if (keys.length > 0) {
          return await this.client.del(...keys);
        }
        return 0;
      } else {
        return this.memoryCache.deletePattern(fullPattern);
      }
    } catch (error) {
      this.stats.errors++;
      logger.error({ err: error }, 'RedisCache delete pattern error');
      return 0;
    }
  }

  // ============================================================================
  // SPECIALIZED CACHE METHODS
  // ============================================================================

  /**
   * Cache a quote
   */
  async cacheQuote(symbol: string, quote: unknown): Promise<boolean> {
    return this.set(`quote:${symbol}`, quote, this.config.quoteTtlSeconds);
  }

  /**
   * Get cached quote
   */
  async getQuote(symbol: string): Promise<unknown | null> {
    return this.get(`quote:${symbol}`);
  }

  /**
   * Cache multiple quotes
   */
  async cacheQuotes(quotes: Record<string, unknown>): Promise<void> {
    const promises = Object.entries(quotes).map(([symbol, quote]) =>
      this.cacheQuote(symbol, quote)
    );
    await Promise.all(promises);
  }

  /**
   * Get multiple quotes
   */
  async getQuotes(symbols: string[]): Promise<Map<string, unknown>> {
    const result = new Map<string, unknown>();

    for (const symbol of symbols) {
      const quote = await this.getQuote(symbol);
      if (quote) {
        result.set(symbol, quote);
      }
    }

    return result;
  }

  /**
   * Cache factor data
   */
  async cacheFactors(symbol: string, factors: unknown): Promise<boolean> {
    return this.set(`factors:${symbol}`, factors, this.config.factorTtlSeconds);
  }

  /**
   * Get cached factors
   */
  async getFactors(symbol: string): Promise<unknown | null> {
    return this.get(`factors:${symbol}`);
  }

  /**
   * Cache API response
   */
  async cacheApiResponse(endpoint: string, params: Record<string, unknown>, response: unknown): Promise<boolean> {
    const paramsHash = this.hashParams(params);
    return this.set(`api:${endpoint}:${paramsHash}`, response, this.config.apiTtlSeconds);
  }

  /**
   * Get cached API response
   */
  async getApiResponse(endpoint: string, params: Record<string, unknown>): Promise<unknown | null> {
    const paramsHash = this.hashParams(params);
    return this.get(`api:${endpoint}:${paramsHash}`);
  }

  /**
   * Invalidate all quotes
   */
  async invalidateQuotes(): Promise<number> {
    return this.deletePattern('quote:*');
  }

  /**
   * Invalidate all factors
   */
  async invalidateFactors(): Promise<number> {
    return this.deletePattern('factors:*');
  }

  /**
   * Invalidate all API cache
   */
  async invalidateApiCache(): Promise<number> {
    return this.deletePattern('api:*');
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Hash parameters for cache key
   */
  private hashParams(params: Record<string, unknown>): string {
    const sorted = Object.keys(params)
      .sort()
      .map((k) => `${k}:${params[k]}`)
      .join('|');
    return Buffer.from(sorted).toString('base64').replace(/[/+=]/g, '').slice(0, 16);
  }

  /**
   * Get or set (cache-aside pattern)
   */
  async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttlSeconds?: number
  ): Promise<T> {
    // Try cache first
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Fetch and cache
    const value = await fetchFn();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats & { hitRate: number; connected: boolean; memorySize: number } {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      connected: this.connected,
      memorySize: this.memoryCache.size(),
    };
  }

  /**
   * Check if cache is available
   */
  isAvailable(): boolean {
    return this.config.enabled;
  }

  /**
   * Check if Redis is connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Clear all cache
   */
  async clear(): Promise<void> {
    try {
      if (this.client && this.connected) {
        await this.deletePattern('*');
      }
      this.memoryCache.clear();
    } catch (error) {
      logger.error({ err: error }, 'RedisCache clear error');
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
        this.connected = false;
        logger.info('RedisCache disconnected');
      } catch (error) {
        logger.error({ err: error }, 'RedisCache disconnect error');
      }
    }
  }
}

// Singleton instance
let cacheInstance: RedisCache | null = null;

export function getCache(): RedisCache {
  if (!cacheInstance) {
    cacheInstance = new RedisCache();
  }
  return cacheInstance;
}

// Express middleware request/response shapes
interface MiddlewareRequest {
  method?: string;
  path?: string;
  url?: string;
  query?: Record<string, unknown>;
}

interface MiddlewareResponse {
  statusCode?: number;
  setHeader(name: string, value: string): void;
  json(body: unknown): unknown;
}

// Express middleware for API caching
export function cacheMiddleware(_ttlSeconds: number = 300) {
  return async function (req: MiddlewareRequest, res: MiddlewareResponse, next: () => void) {
    const cache = getCache();

    // Skip if cache disabled or not a GET request
    if (!cache.isAvailable() || req.method !== 'GET') {
      return next();
    }

    const endpoint = req.path || req.url?.split('?')[0] || '/';
    const params = req.query || {};

    // Try to get from cache
    const cached = await cache.getApiResponse(endpoint, params);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached);
    }

    // Capture response for caching
    const originalJson = res.json.bind(res);
    res.json = function (body: unknown) {
      // Cache successful responses
      if (res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300) {
        cache.cacheApiResponse(endpoint, params, body).catch((err: unknown) => logger.error({ err }, 'RedisCache cacheApiResponse error'));
      }
      res.setHeader('X-Cache', 'MISS');
      return originalJson(body);
    };

    next();
  };
}
