import { useState } from 'react';
import { AlertCircle, X, ChevronDown, ChevronUp, Shield, TrendingDown, BarChart3, Calendar } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import type { RiskAlert } from '@/types';

interface AlertCardProps {
  alert: RiskAlert;
  onAcknowledge?: (id: string) => void;
  onAction?: (id: string, action: string) => void;
}

// Alert type configurations
const ALERT_CONFIG: Record<string, {
  icon: React.ReactNode;
  rail: string;
  iconTint: string;
  actions: { label: string; action: string; variant: 'primary' | 'secondary' | 'danger' }[];
}> = {
  drawdown: {
    icon: <TrendingDown className="w-5 h-5 text-[var(--color-negative)]" aria-hidden="true" />,
    rail: 'before:bg-[var(--color-negative)]',
    iconTint: 'color-mix(in srgb, var(--color-negative) 12%, transparent)',
    actions: [
      { label: 'Reduce Risk', action: 'reduce_risk', variant: 'danger' },
      { label: 'Add Hedge', action: 'add_hedge', variant: 'secondary' },
    ],
  },
  volatility_spike: {
    icon: <BarChart3 className="w-5 h-5 text-[var(--color-warning)]" aria-hidden="true" />,
    rail: 'before:bg-[var(--color-warning)]',
    iconTint: 'color-mix(in srgb, var(--color-warning) 12%, transparent)',
    actions: [
      { label: 'Review Positions', action: 'review', variant: 'primary' },
      { label: 'Set Stops', action: 'set_stops', variant: 'secondary' },
    ],
  },
  concentration: {
    icon: <Shield className="w-5 h-5 text-[var(--color-warning)]" aria-hidden="true" />,
    rail: 'before:bg-[var(--color-warning)]',
    iconTint: 'color-mix(in srgb, var(--color-warning) 12%, transparent)',
    actions: [
      { label: 'Rebalance', action: 'rebalance', variant: 'primary' },
      { label: 'View Details', action: 'details', variant: 'secondary' },
    ],
  },
  earnings: {
    icon: <Calendar className="w-5 h-5 text-[var(--color-info)]" aria-hidden="true" />,
    rail: 'before:bg-[var(--color-info)]',
    iconTint: 'color-mix(in srgb, var(--color-info) 12%, transparent)',
    actions: [
      { label: 'View Forecast', action: 'view_forecast', variant: 'primary' },
      { label: 'Trim Position', action: 'trim', variant: 'secondary' },
    ],
  },
  factor_drift: {
    icon: <BarChart3 className="w-5 h-5 text-[var(--color-accent)]" aria-hidden="true" />,
    rail: 'before:bg-[image:var(--gradient-sovereign)]',
    iconTint: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
    actions: [
      { label: 'Adjust Factors', action: 'adjust_factors', variant: 'primary' },
      { label: 'Ignore', action: 'ignore', variant: 'secondary' },
    ],
  },
};

const SEVERITY_CONFIG: Record<string, { label: string; pillClass: string }> = {
  critical: {
    label: 'Critical',
    pillClass: 'bg-[color-mix(in_srgb,var(--color-negative)_12%,transparent)] text-[var(--color-negative)]',
  },
  high: {
    label: 'High',
    pillClass: 'bg-[color-mix(in_srgb,var(--color-warning)_14%,transparent)] text-[var(--color-warning)]',
  },
  medium: {
    label: 'Medium',
    pillClass: 'bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)] text-[var(--color-warning)]',
  },
  low: {
    label: 'Low',
    pillClass: 'bg-[color-mix(in_srgb,var(--color-info)_12%,transparent)] text-[var(--color-info)]',
  },
};

export function AlertCard({ alert, onAcknowledge, onAction }: AlertCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const config = ALERT_CONFIG[alert.type] || {
    icon: <AlertCircle className="w-5 h-5 text-theme-secondary" aria-hidden="true" />,
    rail: 'before:bg-[var(--color-border)]',
    iconTint: 'color-mix(in srgb, var(--color-text-muted) 10%, transparent)',
    actions: [{ label: 'Dismiss', action: 'dismiss', variant: 'secondary' as const }],
  };

  const severity = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.medium;

  const formatTimestamp = (timestamp: Date | string) => {
    const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div
      className={`
        glass-slab-floating relative overflow-hidden rounded-xl pl-5
        before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px]
        ${config.rail}
        transition-[transform,box-shadow] duration-200
        ${alert.acknowledged ? 'opacity-60' : ''}
      `}
    >
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div
            className="p-2 rounded-lg flex-shrink-0"
            style={{ backgroundColor: config.iconTint }}
          >
            {config.icon}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="min-w-0">
                <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">
                  {alert.type.replace(/_/g, ' ')}
                </p>
                <h4 className="font-semibold text-theme truncate mt-0.5">{alert.title}</h4>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`mono text-[10px] tracking-[0.2em] uppercase px-2 py-0.5 rounded-full font-semibold ${severity.pillClass}`}>
                  {severity.label}
                </span>
                {!alert.acknowledged && onAcknowledge && (
                  <button
                    onClick={() => onAcknowledge(alert.id)}
                    className="p-1 text-theme-muted hover:text-theme-secondary hover:bg-theme-tertiary rounded transition-colors duration-200 animate-press"
                    title="Dismiss"
                    aria-label="Dismiss alert"
                  >
                    <X className="w-4 h-4" aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>

            <p className="text-sm text-theme-secondary line-clamp-2 leading-relaxed">{alert.message}</p>

            <div className="flex items-center justify-between mt-2">
              <span className="mono tabular-nums text-[10px] text-theme-muted">
                {formatTimestamp(alert.timestamp)}
              </span>
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-1 mono text-[10px] tracking-[0.2em] uppercase text-theme-muted hover:text-theme-secondary transition-colors duration-200 animate-press"
                aria-expanded={isExpanded}
              >
                {isExpanded ? (
                  <>
                    Less <ChevronUp className="w-3 h-3" aria-hidden="true" />
                  </>
                ) : (
                  <>
                    More <ChevronDown className="w-3 h-3" aria-hidden="true" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Expanded content with actions */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-2 border-t border-theme-light animate-enter">
          <div className="flex flex-wrap gap-2">
            {config.actions.map((action) => (
              <Button
                key={action.action}
                size="sm"
                variant={action.variant}
                onClick={() => onAction?.(alert.id, action.action)}
              >
                {action.label}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Alert list component
interface AlertListProps {
  alerts: RiskAlert[];
  onAcknowledge?: (id: string) => void;
  onAction?: (id: string, action: string) => void;
  maxVisible?: number;
}

export function AlertList({ alerts, onAcknowledge, onAction, maxVisible = 5 }: AlertListProps) {
  const [showAll, setShowAll] = useState(false);

  // Sort by severity and timestamp
  const sortedAlerts = [...alerts].sort((a, b) => {
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const severityDiff = (severityOrder[a.severity] || 3) - (severityOrder[b.severity] || 3);
    if (severityDiff !== 0) return severityDiff;

    const aTime = typeof a.timestamp === 'string' ? new Date(a.timestamp) : a.timestamp;
    const bTime = typeof b.timestamp === 'string' ? new Date(b.timestamp) : b.timestamp;
    return bTime.getTime() - aTime.getTime();
  });

  // Filter unacknowledged
  const unacknowledged = sortedAlerts.filter(a => !a.acknowledged);
  const visibleAlerts = showAll ? unacknowledged : unacknowledged.slice(0, maxVisible);

  if (unacknowledged.length === 0) {
    return (
      <div className="glass-slab gradient-brand-subtle rounded-2xl p-8 text-center">
        <div
          className="inline-flex p-3 rounded-full mb-3"
          style={{ backgroundColor: 'color-mix(in srgb, var(--color-positive) 12%, transparent)' }}
        >
          <Shield className="w-8 h-8 text-[var(--color-positive)]" aria-hidden="true" />
        </div>
        <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">All clear</p>
        <p className="text-sm text-theme-secondary mt-1">No active alerts. Your portfolio looks good.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 animate-stagger">
      {visibleAlerts.map((alert) => (
        <div key={alert.id} className="animate-enter">
          <AlertCard
            alert={alert}
            onAcknowledge={onAcknowledge}
            onAction={onAction}
          />
        </div>
      ))}

      {unacknowledged.length > maxVisible && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full py-2 mono text-[10px] tracking-[0.3em] uppercase text-theme-muted hover:text-theme-secondary transition-colors duration-200 animate-press"
        >
          {showAll
            ? 'Show less'
            : `Show ${unacknowledged.length - maxVisible} more alerts`}
        </button>
      )}
    </div>
  );
}
