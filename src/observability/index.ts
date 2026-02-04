/**
 * Observability - Error tracking and metrics for Frontier Alpha
 *
 * Features:
 * - Sentry error tracking
 * - API performance metrics
 * - Custom event tracking
 * - Health check monitoring
 */

// Sentry configuration
interface SentryConfig {
  dsn: string;
  environment: string;
  release?: string;
  sampleRate?: number;
  tracesSampleRate?: number;
}

// Metric types
interface Metric {
  name: string;
  value: number;
  unit: string;
  tags?: Record<string, string>;
  timestamp: number;
}

interface SpanContext {
  traceId: string;
  spanId: string;
  operation: string;
  startTime: number;
  data?: Record<string, any>;
}

// Error context
interface ErrorContext {
  user?: { id: string; email?: string };
  tags?: Record<string, string>;
  extra?: Record<string, any>;
  fingerprint?: string[];
}

// Metrics aggregator
class MetricsCollector {
  private metrics: Metric[] = [];
  private maxMetrics = 10000;

  record(name: string, value: number, unit: string, tags?: Record<string, string>): void {
    this.metrics.push({
      name,
      value,
      unit,
      tags,
      timestamp: Date.now(),
    });

    // Prevent memory leaks
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics / 2);
    }
  }

  recordTiming(name: string, durationMs: number, tags?: Record<string, string>): void {
    this.record(name, durationMs, 'ms', tags);
  }

  recordCount(name: string, count: number = 1, tags?: Record<string, string>): void {
    this.record(name, count, 'count', tags);
  }

  getMetrics(since?: number): Metric[] {
    if (since) {
      return this.metrics.filter((m) => m.timestamp >= since);
    }
    return [...this.metrics];
  }

  getAggregated(name: string, windowMs: number = 60000): {
    count: number;
    sum: number;
    avg: number;
    min: number;
    max: number;
    p50: number;
    p95: number;
    p99: number;
  } {
    const cutoff = Date.now() - windowMs;
    const values = this.metrics
      .filter((m) => m.name === name && m.timestamp >= cutoff)
      .map((m) => m.value)
      .sort((a, b) => a - b);

    if (values.length === 0) {
      return { count: 0, sum: 0, avg: 0, min: 0, max: 0, p50: 0, p95: 0, p99: 0 };
    }

    const sum = values.reduce((a, b) => a + b, 0);
    const percentile = (p: number) => values[Math.floor(values.length * p)] || 0;

    return {
      count: values.length,
      sum,
      avg: sum / values.length,
      min: values[0],
      max: values[values.length - 1],
      p50: percentile(0.5),
      p95: percentile(0.95),
      p99: percentile(0.99),
    };
  }

  clear(): void {
    this.metrics = [];
  }
}

// Main observability class
export class Observability {
  private static instance: Observability;

  private sentryDsn: string | null = null;
  private environment: string = 'development';
  private release: string = '1.0.0';
  private initialized = false;

  private metrics = new MetricsCollector();
  private activeSpans = new Map<string, SpanContext>();
  private errorCount = 0;

  private constructor() {}

  static getInstance(): Observability {
    if (!Observability.instance) {
      Observability.instance = new Observability();
    }
    return Observability.instance;
  }

  /**
   * Initialize observability with Sentry
   */
  init(config: SentryConfig): void {
    if (this.initialized) {
      console.warn('[Observability] Already initialized');
      return;
    }

    this.sentryDsn = config.dsn;
    this.environment = config.environment;
    this.release = config.release || this.release;

    // In a real implementation, you would:
    // import * as Sentry from '@sentry/node';
    // Sentry.init({
    //   dsn: config.dsn,
    //   environment: config.environment,
    //   release: config.release,
    //   tracesSampleRate: config.tracesSampleRate || 0.1,
    // });

    console.log(`[Observability] Initialized - env: ${this.environment}, release: ${this.release}`);
    this.initialized = true;
  }

  /**
   * Capture an error
   */
  captureError(error: Error, context?: ErrorContext): string {
    this.errorCount++;

    const eventId = `err_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Log the error
    console.error('[Observability] Error captured:', {
      eventId,
      message: error.message,
      stack: error.stack,
      context,
    });

    // In production with Sentry:
    // Sentry.withScope((scope) => {
    //   if (context?.user) scope.setUser(context.user);
    //   if (context?.tags) {
    //     for (const [key, value] of Object.entries(context.tags)) {
    //       scope.setTag(key, value);
    //     }
    //   }
    //   if (context?.extra) scope.setExtras(context.extra);
    //   if (context?.fingerprint) scope.setFingerprint(context.fingerprint);
    //   Sentry.captureException(error);
    // });

    this.metrics.recordCount('errors', 1, {
      type: error.name,
      environment: this.environment,
    });

    return eventId;
  }

  /**
   * Capture a message (non-error event)
   */
  captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
    console.log(`[Observability] [${level.toUpperCase()}] ${message}`);

    // Sentry.captureMessage(message, level);

    this.metrics.recordCount(`messages.${level}`, 1);
  }

  /**
   * Start a performance span
   */
  startSpan(operation: string, data?: Record<string, any>): string {
    const spanId = `span_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    this.activeSpans.set(spanId, {
      traceId: `trace_${Math.random().toString(36).slice(2, 12)}`,
      spanId,
      operation,
      startTime: Date.now(),
      data,
    });

    return spanId;
  }

  /**
   * End a performance span
   */
  endSpan(spanId: string, status: 'ok' | 'error' = 'ok'): number {
    const span = this.activeSpans.get(spanId);
    if (!span) {
      console.warn(`[Observability] Span not found: ${spanId}`);
      return 0;
    }

    const duration = Date.now() - span.startTime;
    this.activeSpans.delete(spanId);

    // Record timing metric
    this.metrics.recordTiming(`span.${span.operation}`, duration, {
      status,
      environment: this.environment,
    });

    return duration;
  }

  /**
   * Wrap an async function with performance tracking
   */
  async trace<T>(
    operation: string,
    fn: () => Promise<T>,
    data?: Record<string, any>
  ): Promise<T> {
    const spanId = this.startSpan(operation, data);

    try {
      const result = await fn();
      this.endSpan(spanId, 'ok');
      return result;
    } catch (error) {
      this.endSpan(spanId, 'error');
      if (error instanceof Error) {
        this.captureError(error, { extra: data });
      }
      throw error;
    }
  }

  /**
   * Record a custom metric
   */
  recordMetric(name: string, value: number, unit: string, tags?: Record<string, string>): void {
    this.metrics.record(name, value, unit, {
      ...tags,
      environment: this.environment,
    });
  }

  /**
   * Record API latency
   */
  recordApiLatency(endpoint: string, method: string, statusCode: number, durationMs: number): void {
    this.metrics.recordTiming('api.latency', durationMs, {
      endpoint,
      method,
      status: String(statusCode),
      environment: this.environment,
    });

    this.metrics.recordCount('api.requests', 1, {
      endpoint,
      method,
      status: String(statusCode),
    });
  }

  /**
   * Get health status
   */
  getHealth(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    errorRate: number;
    apiLatencyP95: number;
    activeSpans: number;
    uptime: number;
  } {
    const recentErrors = this.metrics.getAggregated('errors', 300000); // 5 min
    const recentRequests = this.metrics.getAggregated('api.requests', 300000);
    const latency = this.metrics.getAggregated('api.latency', 300000);

    const errorRate = recentRequests.count > 0 ? recentErrors.count / recentRequests.count : 0;

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (errorRate > 0.1 || latency.p95 > 5000) {
      status = 'unhealthy';
    } else if (errorRate > 0.01 || latency.p95 > 2000) {
      status = 'degraded';
    }

    return {
      status,
      errorRate,
      apiLatencyP95: latency.p95,
      activeSpans: this.activeSpans.size,
      uptime: process.uptime ? process.uptime() : 0,
    };
  }

  /**
   * Get metrics summary
   */
  getMetricsSummary(): Record<string, any> {
    return {
      errors: this.metrics.getAggregated('errors', 3600000), // 1 hour
      apiLatency: this.metrics.getAggregated('api.latency', 3600000),
      apiRequests: this.metrics.getAggregated('api.requests', 3600000),
      totalErrorCount: this.errorCount,
      environment: this.environment,
      release: this.release,
    };
  }

  /**
   * Set user context for error tracking
   */
  setUser(user: { id: string; email?: string; username?: string }): void {
    // Sentry.setUser(user);
    console.log('[Observability] User context set:', user.id);
  }

  /**
   * Clear user context
   */
  clearUser(): void {
    // Sentry.setUser(null);
    console.log('[Observability] User context cleared');
  }

  /**
   * Add breadcrumb for debugging
   */
  addBreadcrumb(message: string, category: string, data?: Record<string, any>): void {
    // Sentry.addBreadcrumb({
    //   message,
    //   category,
    //   data,
    //   level: 'info',
    // });

    console.log(`[Observability] Breadcrumb: [${category}] ${message}`, data || '');
  }
}

// Singleton instance
export const observability = Observability.getInstance();

// Express/Vercel middleware for API instrumentation
export function observabilityMiddleware(
  req: any,
  res: any,
  next: () => void
): void {
  const startTime = Date.now();
  const endpoint = req.url?.split('?')[0] || '/unknown';
  const method = req.method || 'GET';

  // Add breadcrumb
  observability.addBreadcrumb(`${method} ${endpoint}`, 'http.request');

  // Capture response
  const originalEnd = res.end;
  res.end = function (...args: any[]) {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode || 200;

    observability.recordApiLatency(endpoint, method, statusCode, duration);

    return originalEnd.apply(res, args);
  };

  next();
}

// Error handler middleware
export function errorHandlerMiddleware(
  error: Error,
  req: any,
  res: any,
  next: () => void
): void {
  const eventId = observability.captureError(error, {
    tags: {
      endpoint: req.url,
      method: req.method,
    },
    extra: {
      query: req.query,
      body: req.body,
      headers: req.headers,
    },
  });

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      eventId,
    },
  });
}
