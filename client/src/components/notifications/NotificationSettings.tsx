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
      <div className={`glass-slab-floating rounded-xl p-4 ${className}`}>
        <div className="flex items-center gap-3">
          <BellOff className="h-5 w-5 text-theme-muted" aria-hidden="true" />
          <div>
            <p className="font-medium text-theme-secondary">Notifications Not Supported</p>
            <p className="mt-0.5 text-sm leading-relaxed text-theme-muted">
              Your browser doesn&apos;t support push notifications.
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
    <div className={`glass-slab rounded-2xl p-4 sm:p-5 ${className}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          {isEnabled ? (
            <div
              className="rounded-full p-2"
              style={{ backgroundColor: 'color-mix(in srgb, var(--color-positive) 12%, transparent)' }}
              aria-hidden="true"
            >
              <Bell className="h-5 w-5 text-[var(--color-positive)]" />
            </div>
          ) : (
            <div className="rounded-full glass-slab-floating p-2" aria-hidden="true">
              <BellOff className="h-5 w-5 text-theme-muted" />
            </div>
          )}
          <div>
            <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Notifications</p>
            <h3 className="mt-0.5 font-medium text-theme">Push Notifications</h3>
            <p className="mt-1 text-sm leading-relaxed text-theme-muted">
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
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent animate-press transition-[background-color] duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--color-info)] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
            isEnabled ? 'bg-[var(--color-info)]' : 'bg-[var(--color-border)]'
          }`}
          role="switch"
          aria-checked={isEnabled}
          aria-label="Toggle notifications"
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-[var(--color-bg)] shadow ring-0 transition-transform duration-200 ease-in-out ${
              isEnabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-theme-muted" aria-hidden="true" />
            ) : isEnabled ? (
              <Check className="h-5 w-5 text-[var(--color-info)]" aria-hidden="true" />
            ) : (
              <X className="h-5 w-5 text-theme-muted" aria-hidden="true" />
            )}
          </span>
        </button>
      </div>

      {error && (
        <div
          className="mt-3 glass-slab-floating relative overflow-hidden rounded-xl p-3 pl-5 before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] bg-[var(--color-negative)]/8"
        >
          <span aria-hidden="true" className="absolute left-0 top-0 bottom-0 w-[3px] bg-[var(--color-negative)]" />
          <p className="text-sm leading-relaxed text-[var(--color-negative)]">{error}</p>
        </div>
      )}

      {isEnabled && (
        <div className="mt-4 border-t border-theme-light pt-4">
          <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Notification Types</p>
          <div className="mt-2 space-y-2">
            <NotificationTypeToggle label="Risk Alerts" description="Drawdown, volatility spikes" defaultChecked />
            <NotificationTypeToggle label="Earnings Events" description="Upcoming earnings, post-earnings moves" defaultChecked />
            <NotificationTypeToggle label="Price Alerts" description="Position price targets" defaultChecked />
            <NotificationTypeToggle label="Portfolio Updates" description="Rebalancing suggestions, factor drift" />
          </div>

          <button
            onClick={handleTestNotification}
            className="mt-4 mono text-[10px] tracking-[0.2em] uppercase font-medium text-[var(--color-info)] hover:opacity-80 animate-press transition-[opacity] duration-200"
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
    <label className="flex items-center justify-between gap-4 cursor-pointer animate-press">
      <div>
        <p className="text-sm font-medium text-theme-secondary">{label}</p>
        <p className="text-xs leading-relaxed text-theme-muted">{description}</p>
      </div>
      <input
        type="checkbox"
        defaultChecked={defaultChecked}
        className="h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-info)] focus:ring-2 focus:ring-[var(--color-info)]"
      />
    </label>
  );
}
