import type { ReactNode } from 'react';
import {
  TrendingUp,
  AlertCircle,
  Search,
  Wifi,
  RefreshCw,
  FileText
} from 'lucide-react';
import { Button } from './Button';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'secondary' | 'outline';
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  className = '',
}: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 px-4 text-center ${className}`}>
      {icon && (
        <div className="w-16 h-16 rounded-full bg-[var(--color-bg-secondary)] flex items-center justify-center mb-4 animate-fade-in">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-[var(--color-text)] mb-2 animate-fade-in-up">
        {title}
      </h3>
      <p className="text-[var(--color-text-muted)] max-w-sm mb-6 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
        {description}
      </p>
      {(action || secondaryAction) && (
        <div className="flex flex-col sm:flex-row gap-3 animate-fade-in-up" style={{ animationDelay: '200ms' }}>
          {action && (
            <Button
              onClick={action.onClick}
              variant={action.variant || 'primary'}
              className="min-w-[140px]"
            >
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button
              onClick={secondaryAction.onClick}
              variant="outline"
              className="min-w-[140px]"
            >
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// Pre-built empty states
export function EmptyPortfolio({ onAddPosition }: { onAddPosition: () => void }) {
  return (
    <EmptyState
      icon={<TrendingUp className="w-8 h-8 text-[var(--color-text-muted)]" />}
      title="No positions yet"
      description="Start building your portfolio by adding your first position. Track performance, analyze factors, and get AI-powered insights."
      action={{
        label: 'Add Position',
        onClick: onAddPosition,
      }}
      secondaryAction={{
        label: 'Try Demo Portfolio',
        onClick: () => window.location.href = '/dashboard?demo=true',
      }}
    />
  );
}

export function EmptyAlerts() {
  return (
    <EmptyState
      icon={<AlertCircle className="w-8 h-8 text-[var(--color-text-muted)]" />}
      title="No alerts"
      description="You're all caught up! Risk alerts will appear here when your portfolio needs attention."
    />
  );
}

export function EmptySearchResults({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <EmptyState
      icon={<Search className="w-8 h-8 text-[var(--color-text-muted)]" />}
      title="No results found"
      description={`We couldn't find anything matching "${query}". Try adjusting your search terms.`}
      action={{
        label: 'Clear Search',
        onClick: onClear,
        variant: 'outline',
      }}
    />
  );
}

export function EmptyEarnings() {
  return (
    <EmptyState
      icon={<FileText className="w-8 h-8 text-[var(--color-text-muted)]" />}
      title="No upcoming earnings"
      description="None of your portfolio holdings have earnings announcements scheduled in the next 30 days."
    />
  );
}

export function NetworkError({ onRetry }: { onRetry: () => void }) {
  return (
    <EmptyState
      icon={<Wifi className="w-8 h-8 text-red-400" />}
      title="Connection issue"
      description="We're having trouble connecting to our servers. Please check your internet connection and try again."
      action={{
        label: 'Try Again',
        onClick: onRetry,
      }}
    />
  );
}

export function DataLoadError({ onRetry, error }: { onRetry: () => void; error?: string }) {
  return (
    <EmptyState
      icon={<RefreshCw className="w-8 h-8 text-amber-400" />}
      title="Couldn't load data"
      description={error || "Something went wrong while loading. This might be temporary."}
      action={{
        label: 'Retry',
        onClick: onRetry,
      }}
    />
  );
}

export function NoFactorData() {
  return (
    <EmptyState
      icon={<TrendingUp className="w-8 h-8 text-[var(--color-text-muted)]" />}
      title="Factor analysis unavailable"
      description="Add positions to your portfolio to see factor exposures and risk analysis."
    />
  );
}
