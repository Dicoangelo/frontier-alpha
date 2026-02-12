/**
 * Sentry Error Tracking for Frontier Alpha (Browser)
 *
 * Lazy-loaded: the @sentry/react package is imported dynamically and only
 * in production, so the module works even if the package is not yet installed.
 *
 * Exports:
 *   initSentry()     - Initialize Sentry (call once at app startup)
 *   captureError()   - Capture an error with optional context
 *   setUser()        - Set / clear user context
 *   addApiBreadcrumb() - Record an API call breadcrumb
 *
 * The module is environment-aware:
 *   - In development it logs to the console and does NOT load Sentry.
 *   - In production (with a configured DSN) it loads @sentry/react at runtime.
 */

// ---------------------------------------------------------------------------
// Types (mirror the parts of the Sentry API we use)
// ---------------------------------------------------------------------------

interface SentryLike {
  init: (options: Record<string, unknown>) => void;
  setUser: (user: { id: string; email?: string } | null) => void;
  captureException: (error: unknown) => void;
  addBreadcrumb: (breadcrumb: Record<string, unknown>) => void;
  withScope: (callback: (scope: ScopeLike) => void) => void;
  browserTracingIntegration: () => unknown;
  replayIntegration: (opts?: Record<string, unknown>) => unknown;
  ErrorBoundary?: unknown;
  startInactiveSpan?: (opts: Record<string, unknown>) => unknown;
}

interface ScopeLike {
  setExtras: (extras: Record<string, unknown>) => void;
  setTag: (key: string, value: string) => void;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const IS_PRODUCTION = import.meta.env.PROD;
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;

let sentryModule: SentryLike | null = null;
let initPromise: Promise<void> | null = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialize Sentry. Safe to call multiple times; only the first call has
 * effect.  In development (or when no DSN is configured) this is a no-op.
 */
export function initSentry(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // Skip in development or when DSN is missing
    if (!IS_PRODUCTION || !SENTRY_DSN) {
      if (IS_PRODUCTION && !SENTRY_DSN) {
        console.warn('[Sentry] No DSN configured - error tracking disabled');
      }
      return;
    }

    try {
      // Dynamic import so the app bundles fine even when @sentry/react
      // is not installed.
      const Sentry = (await import('@sentry/react')) as unknown as SentryLike;
      sentryModule = Sentry;

      const integrations: unknown[] = [];

      if (typeof Sentry.browserTracingIntegration === 'function') {
        integrations.push(Sentry.browserTracingIntegration());
      }
      if (typeof Sentry.replayIntegration === 'function') {
        integrations.push(
          Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
        );
      }

      Sentry.init({
        dsn: SENTRY_DSN,
        environment: 'production',
        release: `frontier-alpha@${import.meta.env.VITE_APP_VERSION || '1.0.0'}`,

        // Performance
        tracesSampleRate: 0.1,
        tracePropagationTargets: ['localhost', /^https:\/\/frontier-alpha\.vercel\.app/],

        // Session replay
        replaysSessionSampleRate: 0.1,
        replaysOnErrorSampleRate: 1.0,

        integrations,

        // Scrub sensitive headers before sending
        beforeSend(event: Record<string, unknown>, hint: Record<string, unknown>) {
          if (event.request?.headers) {
            delete event.request.headers['authorization'];
            delete event.request.headers['cookie'];
          }

          // Drop transient network errors
          const originalError = hint?.originalException;
          if (originalError && typeof originalError === 'object' && 'message' in originalError) {
            const message = String((originalError as { message: string }).message);
            if (
              message.includes('Network Error') ||
              message.includes('Failed to fetch') ||
              message.includes('Load failed')
            ) {
              return null;
            }
          }

          return event;
        },

        initialScope: {
          tags: { app: 'frontier-alpha', platform: 'web' },
        },
      });

      console.log('[Sentry] Initialized for production');
    } catch (err) {
      // @sentry/react is not installed — gracefully degrade
      console.warn('[Sentry] @sentry/react not available, error tracking disabled', err);
    }
  })();

  return initPromise;
}

/**
 * Capture an error with optional structured context.
 * In development, logs to the console.
 */
export function captureError(
  error: Error,
  context?: Record<string, unknown>,
): void {
  if (sentryModule) {
    sentryModule.withScope((scope) => {
      if (context) {
        scope.setExtras(context);
      }
      sentryModule!.captureException(error);
    });
  } else {
    console.error('[Sentry:dev] captureError', error, context);
  }
}

/**
 * Set or clear the current user context for error attribution.
 * Pass `null` to clear.
 */
export function setUser(user: { id: string; email?: string } | null): void {
  if (sentryModule) {
    sentryModule.setUser(user);
  }
}

/**
 * Add a breadcrumb for an API call. Useful for tracing what happened before
 * an error.
 */
export function addApiBreadcrumb(
  endpoint: string,
  method: string,
  status: number,
  durationMs: number,
): void {
  const breadcrumb = {
    message: `${method} ${endpoint} ${status}`,
    category: 'api',
    level: status >= 400 ? 'error' : 'info',
    data: { endpoint, method, status, durationMs },
    timestamp: Date.now() / 1000,
  };

  if (sentryModule) {
    sentryModule.addBreadcrumb(breadcrumb);
  } else if (!IS_PRODUCTION) {
    console.debug('[Sentry:dev] breadcrumb', breadcrumb);
  }
}

/**
 * Helper: Sentry ErrorBoundary component (only available after init resolves
 * and @sentry/react is loaded). Returns `null` when Sentry is not available
 * so the caller can provide a fallback.
 */
export function getErrorBoundary(): unknown {
  return sentryModule?.ErrorBoundary ?? null;
}

/**
 * Start an inactive performance span (only when Sentry is loaded).
 */
export function startTransaction(name: string, op: string): unknown {
  if (sentryModule?.startInactiveSpan) {
    return sentryModule.startInactiveSpan({ name, op });
  }
  return null;
}

/**
 * Track an API call (breadcrumb + optional perf span).
 */
export function trackApiCall(endpoint: string, duration: number, success: boolean): void {
  addApiBreadcrumb(endpoint, 'GET', success ? 200 : 500, duration);
}

/**
 * Set portfolio context for error grouping.
 */
export function setPortfolioContext(portfolioId: string, totalValue: number): void {
  if (sentryModule) {
    sentryModule.withScope((scope) => {
      scope.setTag('portfolio_id', portfolioId);
      scope.setExtras({
        portfolio_id: portfolioId,
        portfolio_total_value: totalValue,
        portfolio_context_ts: new Date().toISOString(),
      });
    });
  }
}
