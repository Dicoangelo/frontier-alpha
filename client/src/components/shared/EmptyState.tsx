import type { ReactNode } from 'react';
import {
  TrendingUp,
  AlertCircle,
  Search,
  Wifi,
  WifiOff,
  RefreshCw,
  FileText,
  Lock,
  Server,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from './Button';

export type EmptyStateTone = 'info' | 'warning' | 'celebration';

const toneStyles: Record<
  EmptyStateTone,
  {
    rail: string;
    glow: string;
    halo: string;
    iconColor: string;
    kicker: string;
  }
> = {
  info: {
    rail: "before:bg-[image:var(--gradient-sovereign)]",
    glow: 'shadow-[0_18px_60px_-20px_rgba(123,44,255,0.35)]',
    halo: '0 0 40px rgba(123,44,255,0.25)',
    iconColor: 'var(--color-accent)',
    kicker: 'text-theme-muted',
  },
  warning: {
    rail: 'before:bg-[var(--color-warning)]',
    glow: 'shadow-[0_18px_60px_-20px_rgba(245,158,11,0.40)]',
    halo: '0 0 40px rgba(245,158,11,0.30)',
    iconColor: 'var(--color-warning)',
    kicker: 'text-[var(--color-warning)]',
  },
  celebration: {
    rail: "before:bg-[image:var(--gradient-sovereign)]",
    glow: 'shadow-[0_24px_80px_-20px_rgba(255,61,242,0.45)]',
    halo: '0 0 50px rgba(255,61,242,0.35)',
    iconColor: 'var(--color-accent-secondary)',
    kicker: 'text-[var(--color-accent-secondary)]',
  },
};

interface EmptyStateProps {
  icon?: ReactNode;
  kicker?: string;
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
  tone?: EmptyStateTone;
  className?: string;
}

export function EmptyState({
  icon,
  kicker,
  title,
  description,
  action,
  secondaryAction,
  tone = 'info',
  className = '',
}: EmptyStateProps) {
  const style = toneStyles[tone];
  return (
    <div
      className={`
        glass-slab-floating relative overflow-hidden
        rounded-2xl py-12 px-6 sm:px-8 text-center
        ${style.glow}
        before:content-[''] before:absolute before:left-0 before:top-0 before:right-0 before:h-[3px]
        ${style.rail}
        animate-fade-in-up
        ${className}
      `}
    >
      <div className="flex flex-col items-center justify-center">
        {icon && (
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5 animate-fade-in"
            style={{
              backgroundColor: `color-mix(in srgb, ${style.iconColor} 12%, transparent)`,
              boxShadow: style.halo,
            }}
            aria-hidden="true"
          >
            <span style={{ color: style.iconColor }}>{icon}</span>
          </div>
        )}
        {kicker && (
          <p
            className={`mono text-[10px] tracking-[0.3em] uppercase mb-3 ${style.kicker}`}
          >
            {kicker}
          </p>
        )}
        <h3
          className="text-lg sm:text-xl font-bold mb-2 animate-fade-in-up text-gradient-brand"
          style={{ animationDelay: '50ms', animationFillMode: 'both' }}
        >
          {title}
        </h3>
        <p
          className="text-sm text-theme-secondary max-w-md mx-auto leading-relaxed mb-6 animate-fade-in-up"
          style={{ animationDelay: '100ms', animationFillMode: 'both' }}
        >
          {description}
        </p>
        {(action || secondaryAction) && (
          <div
            className="flex flex-col sm:flex-row gap-3 animate-fade-in-up"
            style={{ animationDelay: '200ms', animationFillMode: 'both' }}
          >
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
    </div>
  );
}

// Pre-built empty states
export function EmptyPortfolio({ onAddPosition }: { onAddPosition: () => void }) {
  return (
    <EmptyState
      icon={<TrendingUp className="w-8 h-8" />}
      kicker="PORTFOLIO · Empty"
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
  const navigate = useNavigate();
  return (
    <EmptyState
      icon={<AlertCircle className="w-8 h-8" />}
      kicker="ALERTS · All Clear"
      title="No alerts"
      description="You're all caught up. Risk alerts will appear here when your portfolio needs attention."
      action={{
        label: 'Create Alert',
        onClick: () => navigate('/alerts'),
      }}
    />
  );
}

export function EmptySearchResults({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <EmptyState
      icon={<Search className="w-8 h-8" />}
      kicker="SEARCH"
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
  const navigate = useNavigate();
  return (
    <EmptyState
      icon={<FileText className="w-8 h-8" />}
      kicker="EARNINGS · Quiet Window"
      title="No upcoming earnings"
      description="None of your portfolio holdings have earnings announcements scheduled in the next 30 days."
      action={{
        label: 'Add Holdings',
        onClick: () => navigate('/portfolio'),
      }}
    />
  );
}

export function NetworkError({ onRetry }: { onRetry: () => void }) {
  return (
    <EmptyState
      icon={<Wifi className="w-8 h-8" />}
      kicker="CONNECTION"
      title="Connection issue"
      description="We're having trouble connecting to our servers. Please check your internet connection and try again."
      action={{
        label: 'Try Again',
        onClick: onRetry,
      }}
      tone="warning"
    />
  );
}

export function DataLoadError({ onRetry, error }: { onRetry: () => void; error?: string }) {
  const errorLower = (error || '').toLowerCase();

  let icon = <RefreshCw className="w-8 h-8" />;
  let title = "Couldn't load data";
  let description = error || "Something went wrong while loading. This might be temporary.";
  let kicker = 'ERROR · Retry Available';

  if (errorLower.includes('network') || errorLower.includes('offline')) {
    icon = <WifiOff className="w-8 h-8" />;
    title = 'Connection issue';
    description = 'Please check your internet connection and try again.';
    kicker = 'CONNECTION · Offline';
  } else if (errorLower.includes('401') || errorLower.includes('unauthorized')) {
    icon = <Lock className="w-8 h-8" />;
    title = 'Authentication required';
    description = 'Your session may have expired. Please sign in again.';
    kicker = 'AUTH · Session Expired';
  } else if (errorLower.includes('500') || errorLower.includes('server')) {
    icon = <Server className="w-8 h-8" />;
    title = 'Server error';
    description = 'Our servers are having trouble. Please try again in a moment.';
    kicker = 'SERVER · Transient';
  }

  return (
    <EmptyState
      icon={icon}
      kicker={kicker}
      title={title}
      description={description}
      action={{
        label: 'Retry',
        onClick: onRetry,
      }}
      tone="warning"
    />
  );
}

export function NoFactorData() {
  return (
    <EmptyState
      icon={<TrendingUp className="w-8 h-8" />}
      kicker="FACTORS · Awaiting Positions"
      title="Factor analysis unavailable"
      description="Add positions to your portfolio to see factor exposures and risk analysis."
    />
  );
}
