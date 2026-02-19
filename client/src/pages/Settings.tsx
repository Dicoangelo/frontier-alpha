import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, LogOut, User, Bell, Shield, AlertTriangle, Key, CreditCard, Sun, Moon, Monitor } from 'lucide-react';
import { useThemeStore } from '@/stores/themeStore';
import { useAuthStore } from '@/stores/authStore';
import { useSubscription } from '@/hooks/useSubscription';
import { api } from '@/api/client';
import { Card } from '@/components/shared/Card';
import { Button } from '@/components/shared/Button';
import { Spinner } from '@/components/shared/Spinner';
import { NotificationSettings } from '@/components/notifications/NotificationSettings';
import { APIKeys } from '@/components/settings/APIKeys';
import { useToast } from '@/hooks/useToast';

interface UserSettings {
  display_name: string | null;
  risk_tolerance: 'conservative' | 'moderate' | 'aggressive';
  notifications_enabled: boolean;
  email_alerts: boolean;
  max_position_pct: number;
  stop_loss_pct: number;
  take_profit_pct: number;
}

export function Settings() {
  const { user, logout } = useAuthStore();
  const { plan, status } = useSubscription();
  const [billingLoading, setBillingLoading] = useState(false);
  const queryClient = useQueryClient();
  const { toastSuccess, toastError } = useToast();
  const [hasChanges, setHasChanges] = useState(false);

  const { data: settingsData, isLoading } = useQuery<{ data: UserSettings }>({
    queryKey: ['settings'],
    queryFn: () => api.get('/settings'),
  });

  const [settings, setSettings] = useState<UserSettings>({
    display_name: '',
    risk_tolerance: 'moderate',
    notifications_enabled: true,
    email_alerts: true,
    max_position_pct: 20,
    stop_loss_pct: 10,
    take_profit_pct: 25,
  });

  useEffect(() => {
    if (settingsData?.data) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing query data to local form state
      setSettings(settingsData.data);
    }
  }, [settingsData]);

  const updateMutation = useMutation({
    mutationFn: (data: Partial<UserSettings>) => api.put('/settings', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setHasChanges(false);
      toastSuccess('Settings saved');
    },
    onError: () => {
      toastError('Failed to save settings', { message: 'Please try again' });
    },
  });

  const handleChange = (field: keyof UserSettings, value: UserSettings[keyof UserSettings]) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    updateMutation.mutate(settings);
  };

  const handleLogout = async () => {
    if (window.confirm('Are you sure you want to sign out?')) {
      await logout();
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header — delay 0ms */}
      <div className="flex items-center justify-between animate-fade-in-up" style={{ animationDelay: '0ms', animationFillMode: 'both' }}>
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-[var(--color-text)]">Settings</h1>
          <p className="text-[var(--color-text-muted)] mt-1">Account preferences, risk parameters, and integrations</p>
        </div>
        {hasChanges && (
          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? <Spinner className="w-4 h-4" /> : <Save className="w-4 h-4 mr-2" />}
            Save Changes
          </Button>
        )}
      </div>

      {/* Appearance card — delay 50ms */}
      <AppearanceCard />

      {/* Profile card — delay 100ms */}
      <Card className="p-6 hover:shadow-md transition-shadow animate-fade-in-up" style={{ animationDelay: '100ms', animationFillMode: 'both' }}>
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(123, 44, 255, 0.08)' }}>
            <User className="w-5 h-5" style={{ color: 'var(--color-accent)' }} />
          </div>
          <h2 className="text-lg font-semibold">Profile</h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Email</label>
            <input
              type="email"
              value={user?.email || ''}
              disabled
              className="w-full px-3 py-2 min-h-[44px] bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg text-[var(--color-text-muted)]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Display Name</label>
            <input
              type="text"
              value={settings.display_name || ''}
              onChange={(e) => handleChange('display_name', e.target.value)}
              placeholder="Your name"
              className="w-full px-3 py-2 min-h-[44px] border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-[var(--color-accent)]"
            />
          </div>
        </div>
      </Card>

      {/* Risk preferences card — delay 150ms */}
      <Card className="p-6 hover:shadow-md transition-shadow animate-fade-in-up" style={{ animationDelay: '150ms', animationFillMode: 'both' }}>
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(16, 185, 129, 0.08)' }}>
            <Shield className="w-5 h-5" style={{ color: 'var(--color-positive)' }} />
          </div>
          <h2 className="text-lg font-semibold">Risk Preferences</h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">Risk Tolerance</label>
            <div className="flex flex-col sm:flex-row gap-3">
              {(['conservative', 'moderate', 'aggressive'] as const).map((level) => (
                <button
                  key={level}
                  onClick={() => handleChange('risk_tolerance', level)}
                  className="flex-1 py-3 px-4 min-h-[44px] rounded-lg border-2 capitalize transition hover:shadow-sm transition-all duration-200"
                  style={
                    settings.risk_tolerance === level
                      ? {
                          borderColor: 'var(--color-accent)',
                          backgroundColor: 'rgba(123, 44, 255, 0.1)',
                          color: 'var(--color-accent)',
                        }
                      : {
                          borderColor: 'var(--color-border)',
                        }
                  }
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                Max Position Size
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="5"
                  max="50"
                  step="5"
                  value={settings.max_position_pct}
                  onChange={(e) => handleChange('max_position_pct', parseFloat(e.target.value))}
                  className="w-full px-3 py-2 min-h-[44px] border border-[var(--color-border)] rounded-lg pr-8 focus:ring-2 focus:ring-[var(--color-accent)]"
                />
                <span className="absolute right-3 top-2 text-[var(--color-text-muted)]">%</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                Stop Loss
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  max="50"
                  step="1"
                  value={settings.stop_loss_pct}
                  onChange={(e) => handleChange('stop_loss_pct', parseFloat(e.target.value))}
                  className="w-full px-3 py-2 min-h-[44px] border border-[var(--color-border)] rounded-lg pr-8 focus:ring-2 focus:ring-[var(--color-accent)]"
                />
                <span className="absolute right-3 top-2 text-[var(--color-text-muted)]">%</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                Take Profit
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="5"
                  max="100"
                  step="5"
                  value={settings.take_profit_pct}
                  onChange={(e) => handleChange('take_profit_pct', parseFloat(e.target.value))}
                  className="w-full px-3 py-2 min-h-[44px] border border-[var(--color-border)] rounded-lg pr-8 focus:ring-2 focus:ring-[var(--color-accent)]"
                />
                <span className="absolute right-3 top-2 text-[var(--color-text-muted)]">%</span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Notifications card — delay 200ms */}
      <Card className="p-6 hover:shadow-md transition-shadow animate-fade-in-up" style={{ animationDelay: '200ms', animationFillMode: 'both' }}>
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(245, 158, 11, 0.08)' }}>
            <Bell className="w-5 h-5" style={{ color: 'var(--color-warning)' }} />
          </div>
          <h2 className="text-lg font-semibold">Notifications</h2>
        </div>

        <div className="space-y-4">
          {/* Push Notification Settings */}
          <NotificationSettings />

          {/* Email Alerts */}
          <label className="flex items-center justify-between pt-4 border-t border-[var(--color-border-light)]">
            <div>
              <p className="font-medium text-[var(--color-text-secondary)]">Email Alerts</p>
              <p className="text-sm text-[var(--color-text-muted)]">Get critical alerts via email</p>
            </div>
            <input
              type="checkbox"
              checked={settings.email_alerts}
              onChange={(e) => handleChange('email_alerts', e.target.checked)}
              className="w-5 h-5 rounded border-[var(--color-border)] text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
            />
          </label>
        </div>
      </Card>

      {/* Subscription card — delay 250ms */}
      <Card className="p-6 hover:shadow-md transition-shadow animate-fade-in-up" style={{ animationDelay: '250ms', animationFillMode: 'both' }}>
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(59, 130, 246, 0.08)' }}>
            <CreditCard className="w-5 h-5" style={{ color: 'var(--color-info)' }} />
          </div>
          <h2 className="text-lg font-semibold">Subscription</h2>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-[var(--color-text-secondary)]">
              Current Plan: <span className="capitalize text-[var(--color-accent)]">{plan}</span>
            </p>
            <p className="text-sm text-[var(--color-text-muted)]">
              Status: <span className="capitalize">{status}</span>
            </p>
          </div>
          <div className="flex gap-3">
            {plan === 'free' ? (
              <Button onClick={() => window.location.href = '/pricing'}>
                Upgrade
              </Button>
            ) : (
              <Button
                variant="outline"
                isLoading={billingLoading}
                onClick={async () => {
                  setBillingLoading(true);
                  try {
                    const response = await api.post('/billing/portal') as { data: { url: string } };
                    if (response.data?.url) {
                      window.location.href = response.data.url;
                    }
                  } catch {
                    toastError('Failed to open billing portal');
                  } finally {
                    setBillingLoading(false);
                  }
                }}
              >
                Manage Billing
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* API Keys card — delay 300ms */}
      <Card className="p-6 hover:shadow-md transition-shadow animate-fade-in-up" style={{ animationDelay: '300ms', animationFillMode: 'both' }}>
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(123, 44, 255, 0.08)' }}>
            <Key className="w-5 h-5" style={{ color: 'var(--color-accent)' }} />
          </div>
          <h2 className="text-lg font-semibold">API Keys</h2>
        </div>
        <APIKeys />
      </Card>

      {/* Danger zone card — delay 350ms */}
      <Card
        className="p-6 hover:shadow-md transition-shadow animate-fade-in-up"
        style={{ borderColor: 'rgba(239, 68, 68, 0.2)', animationDelay: '350ms', animationFillMode: 'both' }}
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)' }}>
            <AlertTriangle className="w-5 h-5" style={{ color: 'var(--color-negative)' }} />
          </div>
          <h2 className="text-lg font-semibold text-[var(--color-negative)]">Danger Zone</h2>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-[var(--color-text-secondary)]">Sign Out</p>
            <p className="text-sm text-[var(--color-text-muted)]">Sign out of your account on this device</p>
          </div>
          <Button variant="danger" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </Card>
    </div>
  );
}

function AppearanceCard() {
  const { theme, setTheme, resolved } = useThemeStore();

  const options: { value: 'light' | 'dark' | 'system'; label: string; icon: typeof Sun; description: string }[] = [
    { value: 'light', label: 'Light', icon: Sun, description: 'Always use light theme' },
    { value: 'dark', label: 'Dark', icon: Moon, description: 'Always use dark theme' },
    { value: 'system', label: 'System', icon: Monitor, description: 'Follow OS preference' },
  ];

  return (
    <Card className="p-6 hover:shadow-md transition-shadow animate-fade-in-up" style={{ animationDelay: '50ms', animationFillMode: 'both' }}>
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(59, 130, 246, 0.08)' }}>
          {resolved === 'dark' ? (
            <Moon className="w-5 h-5" style={{ color: 'var(--color-info)' }} />
          ) : (
            <Sun className="w-5 h-5" style={{ color: 'var(--color-info)' }} />
          )}
        </div>
        <div>
          <h2 className="text-lg font-semibold">Appearance</h2>
          <p className="text-sm text-[var(--color-text-muted)]">Currently {resolved}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {options.map((opt) => {
          const Icon = opt.icon;
          const isActive = theme === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => setTheme(opt.value)}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200 hover:shadow-sm"
              style={
                isActive
                  ? {
                      borderColor: 'var(--color-accent)',
                      backgroundColor: 'rgba(123, 44, 255, 0.08)',
                    }
                  : {
                      borderColor: 'var(--color-border)',
                    }
              }
            >
              <Icon className="w-6 h-6" style={{ color: isActive ? 'var(--color-accent)' : 'var(--color-text-muted)' }} />
              <span className="text-sm font-medium" style={{ color: isActive ? 'var(--color-accent)' : 'var(--color-text)' }}>
                {opt.label}
              </span>
              <span className="text-xs text-[var(--color-text-muted)] text-center">{opt.description}</span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
