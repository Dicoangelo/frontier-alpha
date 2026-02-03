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
  critical: { icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
  high: { icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-50' },
  medium: { icon: AlertCircle, color: 'text-yellow-600', bg: 'bg-yellow-50' },
  low: { icon: Info, color: 'text-blue-600', bg: 'bg-blue-50' },
  info: { icon: Info, color: 'text-gray-600', bg: 'bg-gray-50' },
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

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAcknowledge = (alertId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    acknowledgeMutation.mutate(alertId);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-xl shadow-lg border z-50">
          <div className="flex items-center justify-between p-4 border-b">
            <h3 className="font-semibold text-gray-900">Alerts</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 text-gray-400 hover:text-gray-600 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {alerts.length === 0 ? (
              <div className="p-8 text-center">
                <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
                <p className="text-gray-500">No alerts</p>
                <p className="text-sm text-gray-400">You're all caught up!</p>
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
                          <p className="font-medium text-gray-900 text-sm truncate">
                            {alert.title}
                          </p>
                          {!alert.acknowledged_at && (
                            <button
                              onClick={(e) => handleAcknowledge(alert.id, e)}
                              className="text-xs text-blue-600 hover:text-blue-700 whitespace-nowrap"
                            >
                              Dismiss
                            </button>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                          {alert.message}
                        </p>
                        <p className="text-xs text-gray-400 mt-2">
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
                className="w-full text-center text-sm text-blue-600 hover:text-blue-700 font-medium"
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
