import { useState, useEffect } from 'react';
import { Card } from '@/components/shared/Card';
import { Bell, Mail, Clock, AlertTriangle, Check, Loader2 } from 'lucide-react';

interface NotificationSettings {
  userId: string;
  email: string;
  emailEnabled: boolean;
  severityThreshold: 'critical' | 'high' | 'medium' | 'low';
  alertTypes: string[];
  digestFrequency: 'immediate' | 'hourly' | 'daily';
}

const ALERT_TYPES = [
  { id: 'drawdown', label: 'Drawdown Alerts', description: 'Portfolio drawdown exceeds threshold' },
  { id: 'volatility', label: 'Volatility Alerts', description: 'Unusual volatility detected' },
  { id: 'concentration', label: 'Concentration Alerts', description: 'Position concentration too high' },
  { id: 'factor_drift', label: 'Factor Drift', description: 'Factor exposure changed significantly' },
  { id: 'earnings', label: 'Earnings Alerts', description: 'Upcoming earnings announcements' },
  { id: 'sec_filing', label: 'SEC Filings', description: 'Important regulatory filings' },
];

const SEVERITY_LEVELS = [
  { id: 'low', label: 'All Alerts', description: 'Receive all notifications' },
  { id: 'medium', label: 'Medium & Above', description: 'Skip low-priority alerts' },
  { id: 'high', label: 'High & Critical', description: 'Only important alerts' },
  { id: 'critical', label: 'Critical Only', description: 'Only urgent alerts' },
];

const DIGEST_OPTIONS = [
  { id: 'immediate', label: 'Immediate', description: 'Send alerts as they occur' },
  { id: 'hourly', label: 'Hourly Digest', description: 'Bundle alerts every hour' },
  { id: 'daily', label: 'Daily Digest', description: 'Summary once per day' },
];

export function NotificationSettings() {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('supabase_token');
      const response = await fetch('/api/v1/settings/notifications', {
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load settings');
      }

      const data = await response.json();
      setSettings(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    if (!settings) return;

    try {
      setSaving(true);
      setError(null);
      setSuccess(false);

      const token = localStorage.getItem('supabase_token');
      const response = await fetch('/api/v1/settings/notifications', {
        method: 'PUT',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.message || 'Failed to save settings');
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const sendTestAlert = async () => {
    if (!settings?.email) {
      setError('Please enter an email address first');
      return;
    }

    try {
      setSaving(true);
      const response = await fetch('/api/v1/alerts/notify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: settings.email,
          alerts: [{
            id: 'test-alert',
            type: 'test',
            severity: 'medium',
            title: 'Test Alert',
            message: 'This is a test notification from Frontier Alpha. Your alerts are working!',
            timestamp: new Date(),
          }],
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send test alert');
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send test');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card title="Notification Settings">
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--color-info)]" />
        </div>
      </Card>
    );
  }

  if (!settings) {
    return (
      <Card title="Notification Settings">
        <div className="text-center py-8 text-[var(--color-negative)]">
          Failed to load settings. Please try again.
        </div>
      </Card>
    );
  }

  return (
    <Card title="Notification Settings">
      <div className="space-y-6">
        {/* Status Messages */}
        {error && (
          <div className="p-3 bg-[rgba(239, 68, 68,0.1)] border border-[rgba(239, 68, 68,0.2)] rounded-lg text-[var(--color-negative)] text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            {error}
          </div>
        )}

        {success && (
          <div className="p-3 bg-[rgba(16, 185, 129,0.1)] border border-[rgba(16, 185, 129,0.2)] rounded-lg text-[var(--color-positive)] text-sm flex items-center gap-2">
            <Check className="w-4 h-4" />
            Settings saved successfully!
          </div>
        )}

        {/* Email Enable Toggle */}
        <div className="flex items-center justify-between p-4 bg-[var(--color-bg-tertiary)] rounded-lg">
          <div className="flex items-center gap-3">
            <Mail className="w-5 h-5 text-[var(--color-text-muted)]" />
            <div>
              <p className="font-medium text-[var(--color-text)]">Email Notifications</p>
              <p className="text-sm text-[var(--color-text-muted)]">Receive alerts via email</p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={settings.emailEnabled}
              onChange={(e) => setSettings({ ...settings, emailEnabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-[var(--color-border)] peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[var(--color-info)] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[var(--color-border)] after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--color-info)]" />
          </label>
        </div>

        {/* Email Address */}
        <div>
          <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
            Email Address
          </label>
          <input
            type="email"
            value={settings.email}
            onChange={(e) => setSettings({ ...settings, email: e.target.value })}
            placeholder="your@email.com"
            className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-[var(--color-info)] focus:border-transparent"
            disabled={!settings.emailEnabled}
          />
        </div>

        {/* Severity Threshold */}
        <div>
          <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Minimum Severity
            </div>
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {SEVERITY_LEVELS.map((level) => (
              <button
                key={level.id}
                onClick={() => setSettings({ ...settings, severityThreshold: level.id as NotificationSettings['severityThreshold'] })}
                disabled={!settings.emailEnabled}
                className={`p-3 rounded-lg border text-left transition-all ${
                  settings.severityThreshold === level.id
                    ? 'border-[var(--color-info)] bg-[rgba(59, 130, 246,0.1)] text-[var(--color-info)]'
                    : 'border-[var(--color-border)] hover:border-[var(--color-border)]'
                } ${!settings.emailEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <p className="font-medium text-sm">{level.label}</p>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">{level.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Digest Frequency */}
        <div>
          <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Delivery Frequency
            </div>
          </label>
          <div className="grid grid-cols-3 gap-2">
            {DIGEST_OPTIONS.map((option) => (
              <button
                key={option.id}
                onClick={() => setSettings({ ...settings, digestFrequency: option.id as NotificationSettings['digestFrequency'] })}
                disabled={!settings.emailEnabled}
                className={`p-3 rounded-lg border text-left transition-all ${
                  settings.digestFrequency === option.id
                    ? 'border-[var(--color-info)] bg-[rgba(59, 130, 246,0.1)] text-[var(--color-info)]'
                    : 'border-[var(--color-border)] hover:border-[var(--color-border)]'
                } ${!settings.emailEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <p className="font-medium text-sm">{option.label}</p>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">{option.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Alert Types */}
        <div>
          <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4" />
              Alert Types
            </div>
          </label>
          <p className="text-sm text-[var(--color-text-muted)] mb-3">
            Select which types of alerts to receive. Leave all unchecked to receive all types.
          </p>
          <div className="space-y-2">
            {ALERT_TYPES.map((type) => (
              <label
                key={type.id}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-[var(--color-bg-tertiary)] ${
                  !settings.emailEnabled ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                <input
                  type="checkbox"
                  checked={settings.alertTypes.includes(type.id)}
                  onChange={(e) => {
                    const newTypes = e.target.checked
                      ? [...settings.alertTypes, type.id]
                      : settings.alertTypes.filter((t) => t !== type.id);
                    setSettings({ ...settings, alertTypes: newTypes });
                  }}
                  disabled={!settings.emailEnabled}
                  className="w-4 h-4 text-[var(--color-info)] rounded border-[var(--color-border)] focus:ring-[var(--color-info)]"
                />
                <div>
                  <p className="font-medium text-[var(--color-text)] text-sm">{type.label}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">{type.description}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
          <button
            onClick={saveSettings}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-[var(--color-info)] text-white rounded-lg hover:bg-[var(--color-info)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            Save Settings
          </button>

          <button
            onClick={sendTestAlert}
            disabled={saving || !settings.email || !settings.emailEnabled}
            className="flex items-center justify-center gap-2 px-4 py-2 border border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-lg hover:bg-[var(--color-bg-tertiary)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Mail className="w-4 h-4" />
            Send Test Alert
          </button>
        </div>
      </div>
    </Card>
  );
}
