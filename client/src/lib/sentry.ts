import * as Sentry from '@sentry/react';

/**
 * Sentry Error Tracking Configuration
 *
 * Initialize Sentry for production error monitoring with:
 * - Automatic error capturing
 * - Performance monitoring
 * - Session replay (optional)
 * - Custom context enrichment
 */

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;
const IS_PRODUCTION = import.meta.env.PROD;

export function initSentry() {
  if (!SENTRY_DSN) {
    if (IS_PRODUCTION) {
      console.warn('[Sentry] No DSN configured - error tracking disabled');
    }
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: IS_PRODUCTION ? 'production' : 'development',
    release: `frontier-alpha@${import.meta.env.VITE_APP_VERSION || '1.0.0'}`,

    // Performance monitoring
    tracesSampleRate: IS_PRODUCTION ? 0.1 : 1.0, // 10% in prod, 100% in dev
    tracePropagationTargets: ['localhost', /^https:\/\/frontier-alpha\.vercel\.app/],

    // Session replay for debugging
    replaysSessionSampleRate: 0.1, // 10% of sessions
    replaysOnErrorSampleRate: 1.0, // 100% of sessions with errors

    // Integrations
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],

    // Before sending, filter sensitive data
    beforeSend(event, hint) {
      // Don't send events in development unless testing Sentry
      if (!IS_PRODUCTION && !import.meta.env.VITE_SENTRY_DEBUG) {
        console.log('[Sentry] Would send event:', event);
        return null;
      }

      // Filter out sensitive headers
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
      }

      // Don't send events for network errors (usually temporary)
      const error = hint.originalException;
      if (error && typeof error === 'object' && 'message' in error) {
        const message = String(error.message);
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

    // Custom tags for filtering
    initialScope: {
      tags: {
        app: 'frontier-alpha',
        platform: 'web',
      },
    },
  });

  console.log('[Sentry] Initialized for', IS_PRODUCTION ? 'production' : 'development');
}

/**
 * Set user context for error tracking
 */
export function setSentryUser(user: { id: string; email?: string } | null) {
  if (user) {
    Sentry.setUser({
      id: user.id,
      email: user.email,
    });
  } else {
    Sentry.setUser(null);
  }
}

/**
 * Add breadcrumb for user actions
 */
export function addBreadcrumb(
  message: string,
  category: string = 'user',
  level: Sentry.SeverityLevel = 'info',
  data?: Record<string, unknown>
) {
  Sentry.addBreadcrumb({
    message,
    category,
    level,
    data,
    timestamp: Date.now() / 1000,
  });
}

/**
 * Capture custom error with context
 */
export function captureError(
  error: Error,
  context?: Record<string, unknown>
) {
  Sentry.withScope((scope) => {
    if (context) {
      scope.setExtras(context);
    }
    Sentry.captureException(error);
  });
}

/**
 * Capture custom message
 */
export function captureMessage(
  message: string,
  level: Sentry.SeverityLevel = 'info',
  context?: Record<string, unknown>
) {
  Sentry.withScope((scope) => {
    if (context) {
      scope.setExtras(context);
    }
    Sentry.captureMessage(message, level);
  });
}

/**
 * Start a performance transaction
 */
export function startTransaction(name: string, op: string) {
  return Sentry.startInactiveSpan({ name, op });
}

/**
 * Tag for specific portfolio context
 */
export function setPortfolioContext(portfolioId: string, totalValue: number) {
  Sentry.setTag('portfolio_id', portfolioId);
  Sentry.setContext('portfolio', {
    id: portfolioId,
    totalValue,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Track API call performance
 */
export function trackApiCall(endpoint: string, duration: number, success: boolean) {
  addBreadcrumb(`API ${success ? 'success' : 'error'}: ${endpoint}`, 'api', success ? 'info' : 'error', {
    endpoint,
    duration,
    success,
  });
}

// Re-export ErrorBoundary for use in components
export const ErrorBoundary = Sentry.ErrorBoundary;
export { Sentry };
