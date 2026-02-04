import { Bell, BellOff, Check, X, Loader2 } from 'lucide-react';
import { useNotifications } from '@/hooks/useNotifications';

interface NotificationSettingsProps {
  className?: string;
}

export function NotificationSettings({ className = '' }: NotificationSettingsProps) {
  const {
    isSupported,
    permission,
    subscription,
    isLoading,
    error,
    subscribe,
    unsubscribe,
    showNotification,
  } = useNotifications();

  if (!isSupported) {
    return (
      <div className={`rounded-lg border border-gray-200 bg-gray-50 p-4 ${className}`}>
        <div className="flex items-center gap-3">
          <BellOff className="h-5 w-5 text-gray-400" />
          <div>
            <p className="font-medium text-gray-700">Notifications Not Supported</p>
            <p className="text-sm text-gray-500">
              Your browser doesn't support push notifications.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const isEnabled = permission === 'granted' && subscription !== null;
  const isDenied = permission === 'denied';

  const handleToggle = async () => {
    if (isEnabled) {
      await unsubscribe();
    } else {
      await subscribe();
    }
  };

  const handleTestNotification = () => {
    showNotification('Test Notification', {
      body: 'Push notifications are working correctly!',
      tag: 'test-notification',
    });
  };

  return (
    <div className={`rounded-lg border border-gray-200 bg-white p-4 ${className}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          {isEnabled ? (
            <div className="rounded-full bg-green-100 p-2">
              <Bell className="h-5 w-5 text-green-600" />
            </div>
          ) : (
            <div className="rounded-full bg-gray-100 p-2">
              <BellOff className="h-5 w-5 text-gray-400" />
            </div>
          )}
          <div>
            <h3 className="font-medium text-gray-900">Push Notifications</h3>
            <p className="mt-1 text-sm text-gray-500">
              {isEnabled
                ? 'You will receive alerts for portfolio changes, risk events, and earnings.'
                : isDenied
                  ? 'Notifications are blocked. Please enable them in your browser settings.'
                  : 'Get notified about important portfolio events and risk alerts.'}
            </p>
          </div>
        </div>

        <button
          onClick={handleToggle}
          disabled={isLoading || isDenied}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
            isEnabled ? 'bg-sky-600' : 'bg-gray-200'
          }`}
          role="switch"
          aria-checked={isEnabled}
          aria-label="Toggle notifications"
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              isEnabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            ) : isEnabled ? (
              <Check className="h-5 w-5 text-sky-600" />
            ) : (
              <X className="h-5 w-5 text-gray-400" />
            )}
          </span>
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-md bg-red-50 p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {isEnabled && (
        <div className="mt-4 border-t border-gray-100 pt-4">
          <h4 className="text-sm font-medium text-gray-700">Notification Types</h4>
          <div className="mt-2 space-y-2">
            <NotificationTypeToggle label="Risk Alerts" description="Drawdown, volatility spikes" defaultChecked />
            <NotificationTypeToggle label="Earnings Events" description="Upcoming earnings, post-earnings moves" defaultChecked />
            <NotificationTypeToggle label="Price Alerts" description="Position price targets" defaultChecked />
            <NotificationTypeToggle label="Portfolio Updates" description="Rebalancing suggestions, factor drift" />
          </div>

          <button
            onClick={handleTestNotification}
            className="mt-4 text-sm font-medium text-sky-600 hover:text-sky-700"
          >
            Send Test Notification
          </button>
        </div>
      )}
    </div>
  );
}

interface NotificationTypeToggleProps {
  label: string;
  description: string;
  defaultChecked?: boolean;
}

function NotificationTypeToggle({ label, description, defaultChecked = false }: NotificationTypeToggleProps) {
  return (
    <label className="flex items-center justify-between gap-4 cursor-pointer">
      <div>
        <p className="text-sm font-medium text-gray-700">{label}</p>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
      <input
        type="checkbox"
        defaultChecked={defaultChecked}
        className="h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
      />
    </label>
  );
}
