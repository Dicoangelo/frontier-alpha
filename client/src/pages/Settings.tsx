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
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        {hasChanges && (
          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? <Spinner className="w-4 h-4" /> : <Save className="w-4 h-4 mr-2" />}
            Save Changes
          </Button>
        )}
      </div>

      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <User className="w-5 h-5 text-gray-400" />
          <h2 className="text-lg font-semibold">Profile</h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={user?.email || ''}
              disabled
              className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
            <input
              type="text"
              value={settings.display_name || ''}
              onChange={(e) => handleChange('display_name', e.target.value)}
              placeholder="Your name"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <Shield className="w-5 h-5 text-gray-400" />
          <h2 className="text-lg font-semibold">Risk Preferences</h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Risk Tolerance</label>
            <div className="flex gap-3">
              {(['conservative', 'moderate', 'aggressive'] as const).map((level) => (
                <button
                  key={level}
                  onClick={() => handleChange('risk_tolerance', level)}
                  className={`flex-1 py-3 px-4 rounded-lg border-2 capitalize transition ${
                    settings.risk_tolerance === level
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg pr-8"
                />
                <span className="absolute right-3 top-2 text-gray-400">%</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg pr-8"
                />
                <span className="absolute right-3 top-2 text-gray-400">%</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg pr-8"
                />
                <span className="absolute right-3 top-2 text-gray-400">%</span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <Bell className="w-5 h-5 text-gray-400" />
          <h2 className="text-lg font-semibold">Notifications</h2>
        </div>

        <div className="space-y-4">
          {/* Push Notification Settings */}
          <NotificationSettings />

          {/* Email Alerts */}
          <label className="flex items-center justify-between pt-4 border-t border-gray-100">
            <div>
              <p className="font-medium text-gray-700">Email Alerts</p>
              <p className="text-sm text-gray-500">Get critical alerts via email</p>
            </div>
            <input
              type="checkbox"
              checked={settings.email_alerts}
              onChange={(e) => handleChange('email_alerts', e.target.checked)}
              className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
          </label>
        </div>
      </Card>

      <Card className="p-6 border-red-200">
        <div className="flex items-center gap-3 mb-6">
          <AlertTriangle className="w-5 h-5 text-red-500" />
          <h2 className="text-lg font-semibold text-red-700">Danger Zone</h2>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-700">Sign Out</p>
            <p className="text-sm text-gray-500">Sign out of your account on this device</p>
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
