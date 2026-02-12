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

      // Default error UI
      return (
        <div className="min-h-screen bg-[var(--color-bg-tertiary)] flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-[var(--color-bg)] rounded-xl shadow-lg p-8 text-center">
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>

            <h1 className="text-2xl font-bold text-[var(--color-text)] mb-2">
              Something went wrong
            </h1>

            <p className="text-[var(--color-text-secondary)] mb-6">
              We apologize for the inconvenience. Our team has been notified and
              is working to fix the issue.
            </p>

            {this.state.eventId && (
              <p className="text-xs text-[var(--color-text-muted)] mb-6 font-mono">
                Error ID: {this.state.eventId}
              </p>
            )}

            <div className="space-y-3">
              <button
                onClick={this.handleReset}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </button>

              <button
                onClick={this.handleGoHome}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors"
              >
                <Home className="w-4 h-4" />
                Go to Dashboard
              </button>
            </div>

            {import.meta.env.DEV && this.state.error && (
              <details className="mt-6 text-left">
                <summary className="text-sm text-[var(--color-text-muted)] cursor-pointer hover:text-[var(--color-text-secondary)]">
                  Technical Details
                </summary>
                <div className="mt-2 p-3 bg-[var(--color-bg-secondary)] rounded text-xs font-mono overflow-auto max-h-48">
                  <p className="text-red-600 font-semibold">
                    {this.state.error.name}: {this.state.error.message}
                  </p>
                  {this.state.error.stack && (
                    <pre className="mt-2 text-[var(--color-text-secondary)] whitespace-pre-wrap">
                      {this.state.error.stack}
                    </pre>
                  )}
                  {this.state.errorInfo?.componentStack && (
                    <pre className="mt-2 text-[var(--color-text-muted)] whitespace-pre-wrap">
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

// Simple error boundary for sections
interface SectionErrorBoundaryProps {
  children: ReactNode;
  sectionName?: string;
}

export function SectionErrorBoundary({ children, sectionName }: SectionErrorBoundaryProps) {
  return (
    <ErrorBoundary
      fallback={
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-6 text-center">
          <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-3" />
          <p className="text-red-700 font-medium">
            Failed to load {sectionName || 'this section'}
          </p>
          <p className="text-red-600 text-sm mt-1">
            Please refresh the page or try again later.
          </p>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}
