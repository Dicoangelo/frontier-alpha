import React, { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { captureError, addApiBreadcrumb } from '@/lib/sentry';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  eventId: string | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      eventId: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Generate event ID
    const eventId = `ui_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    this.setState({ errorInfo, eventId });

    // Log to console
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);

    // Report to observability service
    this.reportError(error, errorInfo, eventId);

    // Call optional error handler
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  private reportError(error: Error, errorInfo: React.ErrorInfo, eventId: string): void {
    // Add breadcrumb for error context
    addApiBreadcrumb('error-boundary', 'ERROR', 500, 0);

    // Report to Sentry
    captureError(error, {
      eventId,
      componentStack: errorInfo.componentStack,
      errorBoundary: 'ErrorBoundary',
      url: window.location.href,
    });

    // Also log to API endpoint as backup
    fetch('/api/v1/errors/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId,
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
        componentStack: errorInfo.componentStack,
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
      }),
    }).catch((err) => {
      console.error('[ErrorBoundary] Failed to report error to API:', err);
    });
  }

  private handleGoHome = (): void => {
    window.location.href = '/';
  };

  private handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      eventId: null,
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI — sovereign aesthetic
      return (
        <div className="min-h-screen bg-theme grid-bg flex items-center justify-center p-4">
          <div className="glass-slab-floating relative overflow-hidden rounded-2xl max-w-md w-full p-8 text-center shadow-[0_30px_80px_-20px_rgba(123,44,255,0.35)]">
            <div className="sovereign-bar absolute top-0 left-0 right-0" />

            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 bg-[color-mix(in_srgb,var(--color-negative)_12%,transparent)] shadow-[0_0_40px_rgba(239,68,68,0.35)]">
              <AlertTriangle className="w-8 h-8 text-[var(--color-negative)]" />
            </div>

            <h1 className="text-2xl font-bold mb-2 text-gradient-brand">
              Something went wrong
            </h1>

            <p className="text-theme-secondary mb-6 leading-relaxed">
              We apologize for the inconvenience. Our team has been notified and
              is working to fix the issue.
            </p>

            {this.state.eventId && (
              <div className="inline-block mb-6 px-3 py-1.5 rounded-md border border-theme bg-[color-mix(in_srgb,var(--color-bg-secondary)_60%,transparent)]">
                <span className="text-xs text-theme-muted font-mono">
                  Error ID: {this.state.eventId}
                </span>
              </div>
            )}

            <div className="space-y-3">
              <button
                onClick={this.handleReset}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-[image:var(--gradient-sovereign)] text-white font-medium animate-press animate-lift shadow-[0_4px_30px_rgba(123,44,255,0.35)] hover:brightness-110 hover:shadow-[0_6px_40px_rgba(123,44,255,0.5)]"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </button>

              <button
                onClick={this.handleGoHome}
                className="glass-slab w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-theme animate-press animate-lift hover:border-[color:var(--color-border-hover)]"
              >
                <Home className="w-4 h-4" />
                Go to Dashboard
              </button>
            </div>

            {import.meta.env.DEV && this.state.error && (
              <details className="mt-6 text-left">
                <summary className="text-sm text-theme-muted cursor-pointer hover:text-theme-secondary transition-colors">
                  Technical Details
                </summary>
                <div className="glass-slab mt-2 p-3 rounded-lg text-xs font-mono overflow-auto max-h-48">
                  <p className="text-[var(--color-negative)] font-semibold">
                    {this.state.error.name}: {this.state.error.message}
                  </p>
                  {this.state.error.stack && (
                    <pre className="mt-2 text-theme-secondary whitespace-pre-wrap">
                      {this.state.error.stack}
                    </pre>
                  )}
                  {this.state.errorInfo?.componentStack && (
                    <pre className="mt-2 text-theme-muted whitespace-pre-wrap">
                      Component Stack:
                      {this.state.errorInfo.componentStack}
                    </pre>
                  )}
                </div>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Higher-order component for wrapping components with error boundary
// eslint-disable-next-line react-refresh/only-export-components
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  fallback?: ReactNode
): React.FC<P> {
  return function WithErrorBoundary(props: P) {
    return (
      <ErrorBoundary fallback={fallback}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    );
  };
}

// Simple error boundary for sections — Toast family aesthetic
interface SectionErrorBoundaryProps {
  children: ReactNode;
  sectionName?: string;
}

export function SectionErrorBoundary({ children, sectionName }: SectionErrorBoundaryProps) {
  return (
    <ErrorBoundary
      fallback={
        <div
          className="
            glass-slab-floating relative overflow-hidden
            rounded-xl pl-5 pr-4 py-4
            shadow-[0_18px_60px_-20px_rgba(239,68,68,0.45)]
            before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px]
            before:bg-[var(--color-negative)]
          "
          role="alert"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-[var(--color-negative)]" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-theme">
                Failed to load {sectionName || 'this section'}
              </p>
              <p className="text-sm mt-1 text-theme-secondary leading-relaxed">
                Please refresh the page or try again later.
              </p>
            </div>
          </div>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}
