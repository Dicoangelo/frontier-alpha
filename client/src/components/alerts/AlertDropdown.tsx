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
  critical: {
    icon: AlertTriangle,
    color: 'text-[var(--color-negative)]',
    iconTint: 'color-mix(in srgb, var(--color-negative) 12%, transparent)',
    rail: 'before:bg-[var(--color-negative)]',
  },
  high: {
    icon: AlertTriangle,
    color: 'text-[var(--color-warning)]',
    iconTint: 'color-mix(in srgb, var(--color-warning) 12%, transparent)',
    rail: 'before:bg-[var(--color-warning)]',
  },
  medium: {
    icon: AlertCircle,
    color: 'text-[var(--color-warning)]',
    iconTint: 'color-mix(in srgb, var(--color-warning) 10%, transparent)',
    rail: 'before:bg-[var(--color-warning)]',
  },
  low: {
    icon: Info,
    color: 'text-[var(--color-info)]',
    iconTint: 'color-mix(in srgb, var(--color-info) 10%, transparent)',
    rail: 'before:bg-[var(--color-info)]',
  },
  info: {
    icon: Info,
    color: 'text-theme-secondary',
    iconTint: 'color-mix(in srgb, var(--color-info) 8%, transparent)',
    rail: 'before:bg-[image:var(--gradient-sovereign)]',
  },
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
        className="relative p-2 text-theme-muted hover:text-theme-secondary hover:bg-theme-secondary rounded-lg transition-colors duration-200 animate-press"
        aria-label={`Alerts${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <Bell className="w-5 h-5" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 min-w-5 h-5 px-1 mono tabular-nums bg-[var(--color-negative)] text-white text-[10px] font-semibold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="glass-slab-floating absolute right-0 mt-2 w-96 rounded-xl overflow-hidden z-50 shadow-[0_18px_60px_-20px_rgba(0,0,0,0.25)] animate-enter">
          <div className="sovereign-bar" />
          <div className="flex items-center justify-between p-4 border-b border-theme-light">
            <div>
              <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Notifications</p>
              <h3 className="font-semibold text-theme mt-0.5">Alerts</h3>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 text-theme-muted hover:text-theme-secondary rounded transition-colors duration-200 animate-press"
              aria-label="Close alerts"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto animate-stagger">
            {alerts.length === 0 ? (
              <div className="gradient-brand-subtle p-8 text-center animate-enter">
                <div
                  className="inline-flex p-3 rounded-full mb-3"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--color-positive) 12%, transparent)' }}
                >
                  <CheckCircle className="w-8 h-8 text-[var(--color-positive)]" aria-hidden="true" />
                </div>
                <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">All clear</p>
                <p className="text-sm text-theme-secondary mt-1">You're all caught up</p>
              </div>
            ) : (
              alerts.slice(0, 20).map((alert) => {
                const config = severityConfig[alert.severity];
                const Icon = config.icon;

                return (
                  <div
                    key={alert.id}
                    className={`
                      glass-slab-floating relative overflow-hidden mx-2 my-2 p-4 pl-5 rounded-lg animate-enter animate-press
                      before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px]
                      ${config.rail}
                      ${alert.acknowledged_at ? 'opacity-60' : ''}
                    `}
                  >
                    <div className="flex gap-3">
                      <div
                        className="p-2 rounded-lg flex-shrink-0"
                        style={{ backgroundColor: config.iconTint }}
                      >
                        <Icon className={`w-4 h-4 ${config.color}`} aria-hidden="true" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className={`mono text-[10px] tracking-[0.3em] uppercase ${config.color}`}>
                              {alert.severity}
                            </p>
                            <p className="font-semibold text-theme text-sm truncate mt-0.5">
                              {alert.title}
                            </p>
                          </div>
                          {!alert.acknowledged_at && (
                            <button
                              onClick={(e) => handleAcknowledge(alert.id, e)}
                              className="mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-info)] hover:opacity-80 whitespace-nowrap transition-opacity duration-200 animate-press"
                            >
                              Dismiss
                            </button>
                          )}
                        </div>
                        <p className="text-sm text-theme-secondary mt-1 line-clamp-2 leading-relaxed">
                          {alert.message}
                        </p>
                        <p className="mono tabular-nums text-[10px] text-theme-muted mt-2">
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
            <div className="p-3 border-t border-theme-light">
              <button
                onClick={() => setIsOpen(false)}
                className="w-full py-2 mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-info)] hover:opacity-80 font-semibold transition-opacity duration-200 animate-press"
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
