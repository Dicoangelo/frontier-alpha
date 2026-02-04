import { useState } from 'react';
import { AlertTriangle, AlertCircle, Info, X, ChevronDown, ChevronUp, Shield, TrendingDown, BarChart3, Calendar } from 'lucide-react';
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
  bgColor: string;
  borderColor: string;
  iconBg: string;
  actions: { label: string; action: string; variant: 'primary' | 'secondary' | 'danger' }[];
}> = {
  drawdown: {
    icon: <TrendingDown className="w-5 h-5 text-red-600" />,
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    iconBg: 'bg-red-100',
    actions: [
      { label: 'Reduce Risk', action: 'reduce_risk', variant: 'danger' },
      { label: 'Add Hedge', action: 'add_hedge', variant: 'secondary' },
    ],
  },
  volatility_spike: {
    icon: <BarChart3 className="w-5 h-5 text-orange-600" />,
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    iconBg: 'bg-orange-100',
    actions: [
      { label: 'Review Positions', action: 'review', variant: 'primary' },
      { label: 'Set Stops', action: 'set_stops', variant: 'secondary' },
    ],
  },
  concentration: {
    icon: <Shield className="w-5 h-5 text-amber-600" />,
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    iconBg: 'bg-amber-100',
    actions: [
      { label: 'Rebalance', action: 'rebalance', variant: 'primary' },
      { label: 'View Details', action: 'details', variant: 'secondary' },
    ],
  },
  earnings: {
    icon: <Calendar className="w-5 h-5 text-blue-600" />,
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    iconBg: 'bg-blue-100',
    actions: [
      { label: 'View Forecast', action: 'view_forecast', variant: 'primary' },
      { label: 'Trim Position', action: 'trim', variant: 'secondary' },
    ],
  },
  factor_drift: {
    icon: <BarChart3 className="w-5 h-5 text-purple-600" />,
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
    iconBg: 'bg-purple-100',
    actions: [
      { label: 'Adjust Factors', action: 'adjust_factors', variant: 'primary' },
      { label: 'Ignore', action: 'ignore', variant: 'secondary' },
    ],
  },
};

const SEVERITY_CONFIG: Record<string, { label: string; color: string; indicator: string }> = {
  critical: { label: 'Critical', color: 'text-red-700 bg-red-100', indicator: '🔴' },
  high: { label: 'High', color: 'text-orange-700 bg-orange-100', indicator: '🟠' },
  medium: { label: 'Medium', color: 'text-yellow-700 bg-yellow-100', indicator: '🟡' },
  low: { label: 'Low', color: 'text-blue-700 bg-blue-100', indicator: '🔵' },
};

export function AlertCard({ alert, onAcknowledge, onAction }: AlertCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const config = ALERT_CONFIG[alert.type] || {
    icon: <AlertCircle className="w-5 h-5 text-gray-600" />,
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200',
    iconBg: 'bg-gray-100',
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
      className={`rounded-lg border ${config.borderColor} ${config.bgColor} overflow-hidden transition-all duration-200 ${
        alert.acknowledged ? 'opacity-60' : ''
      }`}
    >
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg ${config.iconBg}`}>
            {config.icon}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <h4 className="font-semibold text-gray-900 truncate">{alert.title}</h4>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${severity.color}`}>
                  {severity.indicator} {severity.label}
                </span>
                {!alert.acknowledged && onAcknowledge && (
                  <button
                    onClick={() => onAcknowledge(alert.id)}
                    className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded transition-colors"
                    title="Dismiss"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            <p className="text-sm text-gray-600 line-clamp-2">{alert.message}</p>

            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-gray-500">
                {formatTimestamp(alert.timestamp)}
              </span>
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
              >
                {isExpanded ? (
                  <>
                    Less <ChevronUp className="w-3 h-3" />
                  </>
                ) : (
                  <>
                    More <ChevronDown className="w-3 h-3" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Expanded content with actions */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-2 border-t border-gray-200/50">
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
      <div className="text-center py-8 text-gray-500">
        <Shield className="w-12 h-12 mx-auto mb-3 text-gray-300" />
        <p>No active alerts</p>
        <p className="text-sm mt-1">Your portfolio looks good!</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {visibleAlerts.map((alert) => (
        <AlertCard
          key={alert.id}
          alert={alert}
          onAcknowledge={onAcknowledge}
          onAction={onAction}
        />
      ))}

      {unacknowledged.length > maxVisible && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          {showAll
            ? 'Show less'
            : `Show ${unacknowledged.length - maxVisible} more alerts`}
        </button>
      )}
    </div>
  );
}
