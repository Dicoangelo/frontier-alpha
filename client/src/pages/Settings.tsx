import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, LogOut, User, Bell, Shield, AlertTriangle } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/api/client';
import { Card } from '@/components/shared/Card';
import { Button } from '@/components/shared/Button';
import { Spinner } from '@/components/shared/Spinner';
import { NotificationSettings } from '@/components/notifications/NotificationSettings';

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
  const queryClient = useQueryClient();
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
      setSettings(settingsData.data);
    }
  }, [settingsData]);

  const updateMutation = useMutation({
    mutationFn: (data: Partial<UserSettings>) => api.put('/settings', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setHasChanges(false);
    },
  });

  const handleChange = (field: keyof UserSettings, value: any) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    updateMutation.mutate(settings);
  };

  const handleLogout = async () => {
    await logout();
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Settings</h1>
        {hasChanges && (
          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? <Spinner className="w-4 h-4" /> : <Save className="w-4 h-4 mr-2" />}
            Save Changes
          </Button>
        )}
      </div>

      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <User className="w-5 h-5 text-[var(--color-text-muted)]" />
          <h2 className="text-lg font-semibold">Profile</h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Email</label>
            <input
              type="email"
              value={user?.email || ''}
              disabled
              className="w-full px-3 py-2 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg text-[var(--color-text-muted)]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Display Name</label>
            <input
              type="text"
              value={settings.display_name || ''}
              onChange={(e) => handleChange('display_name', e.target.value)}
              placeholder="Your name"
              className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <Shield className="w-5 h-5 text-[var(--color-text-muted)]" />
          <h2 className="text-lg font-semibold">Risk Preferences</h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">Risk Tolerance</label>
            <div className="flex gap-3">
              {(['conservative', 'moderate', 'aggressive'] as const).map((level) => (
                <button
                  key={level}
                  onClick={() => handleChange('risk_tolerance', level)}
                  className={`flex-1 py-3 px-4 rounded-lg border-2 capitalize transition ${
                    settings.risk_tolerance === level
                      ? 'border-blue-500 bg-blue-500/10 text-blue-700'
                      : 'border-[var(--color-border)] hover:border-[var(--color-border)]'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
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
                  className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg pr-8"
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
                  className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg pr-8"
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
                  className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg pr-8"
                />
                <span className="absolute right-3 top-2 text-[var(--color-text-muted)]">%</span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <Bell className="w-5 h-5 text-[var(--color-text-muted)]" />
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
              className="w-5 h-5 rounded border-[var(--color-border)] text-blue-600 focus:ring-blue-500"
            />
          </label>
        </div>
      </Card>

      <Card className="p-6 border-red-500/20">
        <div className="flex items-center gap-3 mb-6">
          <AlertTriangle className="w-5 h-5 text-red-500" />
          <h2 className="text-lg font-semibold text-red-400">Danger Zone</h2>
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
