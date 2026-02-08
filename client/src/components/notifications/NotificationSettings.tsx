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
      <div className={`rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-4 ${className}`}>
        <div className="flex items-center gap-3">
          <BellOff className="h-5 w-5 text-[var(--color-text-muted)]" />
          <div>
            <p className="font-medium text-[var(--color-text-secondary)]">Notifications Not Supported</p>
            <p className="text-sm text-[var(--color-text-muted)]">
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
    <div className={`rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-4 ${className}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          {isEnabled ? (
            <div className="rounded-full bg-green-500/10 p-2">
              <Bell className="h-5 w-5 text-green-600" />
            </div>
          ) : (
            <div className="rounded-full bg-[var(--color-bg-secondary)] p-2">
              <BellOff className="h-5 w-5 text-[var(--color-text-muted)]" />
            </div>
          )}
          <div>
            <h3 className="font-medium text-[var(--color-text)]">Push Notifications</h3>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
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
            isEnabled ? 'bg-sky-600' : 'bg-[var(--color-border)]'
          }`}
          role="switch"
          aria-checked={isEnabled}
          aria-label="Toggle notifications"
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-[var(--color-bg)] shadow ring-0 transition duration-200 ease-in-out ${
              isEnabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-[var(--color-text-muted)]" />
            ) : isEnabled ? (
              <Check className="h-5 w-5 text-sky-600" />
            ) : (
              <X className="h-5 w-5 text-[var(--color-text-muted)]" />
            )}
          </span>
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-md bg-red-500/10 p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {isEnabled && (
        <div className="mt-4 border-t border-[var(--color-border-light)] pt-4">
          <h4 className="text-sm font-medium text-[var(--color-text-secondary)]">Notification Types</h4>
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
        <p className="text-sm font-medium text-[var(--color-text-secondary)]">{label}</p>
        <p className="text-xs text-[var(--color-text-muted)]">{description}</p>
      </div>
      <input
        type="checkbox"
        defaultChecked={defaultChecked}
        className="h-4 w-4 rounded border-[var(--color-border)] text-sky-600 focus:ring-sky-500"
      />
    </label>
  );
}
