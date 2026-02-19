import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, X, AlertTriangle, AlertCircle, Info, CheckCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { api } from '@/api/client';
import { useAuthStore } from '@/stores/authStore';

interface Alert {
  id: string;
  alert_type: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  message: string;
  acknowledged_at: string | null;
  created_at: string;
}

const severityConfig = {
  critical: { icon: AlertTriangle, color: 'text-[var(--color-negative)]', bg: 'bg-[rgba(239, 68, 68,0.1)]' },
  high: { icon: AlertTriangle, color: 'text-[var(--color-warning)]', bg: 'bg-[rgba(249, 115, 22,0.1)]' },
  medium: { icon: AlertCircle, color: 'text-[var(--color-warning)]', bg: 'bg-[rgba(234, 179, 8,0.1)]' },
  low: { icon: Info, color: 'text-[var(--color-info)]', bg: 'bg-[rgba(59, 130, 246,0.1)]' },
  info: { icon: Info, color: 'text-[var(--color-text-secondary)]', bg: 'bg-[var(--color-bg-tertiary)]' },
};

export function AlertDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const { data: alertsData } = useQuery<{ data: Alert[] }>({
    queryKey: ['alerts'],
    queryFn: () => api.get('/alerts'),
    enabled: !!user,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (alertId: string) => api.put(`/alerts/${alertId}/acknowledge`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });

  const alerts = alertsData?.data || [];
  const unacknowledged = alerts.filter((a) => !a.acknowledged_at);
  const unreadCount = unacknowledged.length;

  // Close dropdown when clicking outside or pressing Escape
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleAcknowledge = (alertId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    acknowledgeMutation.mutate(alertId);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] rounded-lg"
        aria-label={`Alerts${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <Bell className="w-5 h-5" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 w-5 h-5 bg-[var(--color-negative)] text-white text-xs rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-[var(--color-bg)] rounded-xl shadow-lg border z-50">
          <div className="flex items-center justify-between p-4 border-b">
            <h3 className="font-semibold text-[var(--color-text)]">Alerts</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] rounded"
              aria-label="Close alerts"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {alerts.length === 0 ? (
              <div className="p-8 text-center">
                <CheckCircle className="w-12 h-12 text-[var(--color-positive)] mx-auto mb-3" />
                <p className="text-[var(--color-text-muted)]">No alerts</p>
                <p className="text-sm text-[var(--color-text-muted)]">You're all caught up!</p>
              </div>
            ) : (
              alerts.slice(0, 20).map((alert) => {
                const config = severityConfig[alert.severity];
                const Icon = config.icon;

                return (
                  <div
                    key={alert.id}
                    className={`p-4 border-b last:border-0 ${
                      alert.acknowledged_at ? 'opacity-60' : ''
                    }`}
                  >
                    <div className="flex gap-3">
                      <div className={`p-2 rounded-lg ${config.bg}`}>
                        <Icon className={`w-4 h-4 ${config.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium text-[var(--color-text)] text-sm truncate">
                            {alert.title}
                          </p>
                          {!alert.acknowledged_at && (
                            <button
                              onClick={(e) => handleAcknowledge(alert.id, e)}
                              className="text-xs text-[var(--color-info)] hover:text-[var(--color-info)] whitespace-nowrap"
                            >
                              Dismiss
                            </button>
                          )}
                        </div>
                        <p className="text-sm text-[var(--color-text-muted)] mt-1 line-clamp-2">
                          {alert.message}
                        </p>
                        <p className="text-xs text-[var(--color-text-muted)] mt-2">
                          {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {alerts.length > 0 && (
            <div className="p-3 border-t">
              <button
                onClick={() => setIsOpen(false)}
                className="w-full text-center text-sm text-[var(--color-info)] hover:text-[var(--color-info)] font-medium"
              >
                View all alerts
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
