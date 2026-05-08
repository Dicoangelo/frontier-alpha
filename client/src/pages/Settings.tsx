import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, LogOut, User, Bell, Shield, AlertTriangle, Key, CreditCard, Sun, Moon, Monitor } from 'lucide-react';
import { useThemeStore } from '@/stores/themeStore';
import { useAuthStore } from '@/stores/authStore';
import { useSubscription } from '@/hooks/useSubscription';
import { api } from '@/api/client';
import { Button } from '@/components/shared/Button';
import { Spinner } from '@/components/shared/Spinner';
import { SkeletonSettingsPage } from '@/components/shared/Skeleton';
import { NotificationSettings } from '@/components/notifications/NotificationSettings';
import { APIKeys } from '@/components/settings/APIKeys';
import { BrokerSection } from '@/components/settings/BrokerSection';
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

// Canonical input class — matches LoginForm pattern across the family aesthetic.
const inputClass =
  'block w-full px-4 py-3 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)] transition-[border-color,box-shadow] duration-200 mono text-sm';

const labelClass =
  'block text-[10px] mono tracking-[0.3em] uppercase text-[var(--color-text-muted)] mb-2';

const kickerClass =
  'text-[10px] mono tracking-[0.3em] uppercase text-[var(--color-text-muted)]';

interface SectionShellProps {
  kicker: string;
  title: string;
  description?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  delay?: number;
  danger?: boolean;
}

function SectionShell({ kicker, title, description, icon, children, delay = 0, danger = false }: SectionShellProps) {
  if (danger) {
    return (
      <div
        className="glass-slab-floating relative overflow-hidden rounded-2xl p-6 sm:p-8 before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-[var(--color-negative)] shadow-[0_8px_30px_-10px_rgba(239,68,68,0.35)] animate-fade-in-up"
        style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}
      >
        <SectionHeader kicker={kicker} title={title} description={description} icon={icon} danger />
        {children}
      </div>
    );
  }

  return (
    <section
      className="glass-slab rounded-2xl p-6 sm:p-8 animate-fade-in-up"
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}
    >
      <SectionHeader kicker={kicker} title={title} description={description} icon={icon} />
      {children}
    </section>
  );
}

function SectionHeader({
  kicker,
  title,
  description,
  icon,
  danger = false,
}: {
  kicker: string;
  title: string;
  description?: string;
  icon: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <header className="flex items-start gap-4 mb-6">
      <div
        className="p-2.5 rounded-lg shrink-0"
        style={{
          backgroundColor: danger
            ? 'color-mix(in srgb, var(--color-negative) 10%, transparent)'
            : 'color-mix(in srgb, var(--color-accent) 10%, transparent)',
        }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className={kickerClass}>{kicker}</p>
        <h2
          className={`text-lg font-bold mt-1 ${danger ? 'text-[var(--color-negative)]' : 'text-[var(--color-text)]'}`}
        >
          {title}
        </h2>
        {description && (
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">{description}</p>
        )}
      </div>
    </header>
  );
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
    return <SkeletonSettingsPage />;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header — delay 0ms */}
      <div
        className="flex items-center justify-between animate-fade-in-up"
        style={{ animationDelay: '0ms', animationFillMode: 'both' }}
      >
        <div>
          <p className={kickerClass}>Account</p>
          <h1 className="text-2xl lg:text-3xl font-bold text-[var(--color-text)] mt-1">Settings</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            Account preferences, risk parameters, and integrations
          </p>
        </div>
        {hasChanges && (
          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? <Spinner className="w-4 h-4" /> : <Save className="w-4 h-4 mr-2" />}
            Save Changes
          </Button>
        )}
      </div>

      {/* Appearance — delay 50ms */}
      <AppearanceCard />

      {/* Profile — delay 100ms */}
      <SectionShell
        kicker="Identity"
        title="Profile"
        description="How your account appears across Frontier Alpha"
        icon={<User className="w-5 h-5" style={{ color: 'var(--color-accent)' }} />}
        delay={100}
      >
        <div className="space-y-5">
          <div>
            <label htmlFor="settings-email" className={labelClass}>
              Email
            </label>
            <input
              id="settings-email"
              type="email"
              value={user?.email || ''}
              disabled
              className={`${inputClass} opacity-60 cursor-not-allowed`}
            />
          </div>

          <div>
            <label htmlFor="settings-display-name" className={labelClass}>
              Display Name
            </label>
            <input
              id="settings-display-name"
              type="text"
              value={settings.display_name || ''}
              onChange={(e) => handleChange('display_name', e.target.value)}
              placeholder="Your name"
              className={inputClass}
            />
          </div>
        </div>
      </SectionShell>

      {/* Risk preferences — delay 150ms */}
      <SectionShell
        kicker="Strategy"
        title="Risk Preferences"
        description="Position sizing and protective rails for your portfolio"
        icon={<Shield className="w-5 h-5" style={{ color: 'var(--color-positive)' }} />}
        delay={150}
      >
        <div className="space-y-5">
          <div>
            <p className={`${labelClass} mb-3`}>Risk Tolerance</p>
            <div className="flex flex-col sm:flex-row gap-3">
              {(['conservative', 'moderate', 'aggressive'] as const).map((level) => {
                const active = settings.risk_tolerance === level;
                return (
                  <button
                    key={level}
                    onClick={() => handleChange('risk_tolerance', level)}
                    className={`flex-1 py-3 px-4 min-h-[44px] rounded-lg border-2 capitalize mono text-sm tracking-[0.1em] transition-[border-color,background-color,color] duration-200 animate-press ${
                      active
                        ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]'
                        : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-hover)] hover:text-[var(--color-text)]'
                    }`}
                    aria-pressed={active}
                  >
                    {level}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="settings-max-position" className={labelClass}>
                Max Position Size
              </label>
              <div className="relative">
                <input
                  id="settings-max-position"
                  type="number"
                  min="5"
                  max="50"
                  step="5"
                  value={settings.max_position_pct}
                  onChange={(e) => handleChange('max_position_pct', parseFloat(e.target.value))}
                  className={`${inputClass} pr-9`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] mono text-sm">
                  %
                </span>
              </div>
            </div>

            <div>
              <label htmlFor="settings-stop-loss" className={labelClass}>
                Stop Loss
              </label>
              <div className="relative">
                <input
                  id="settings-stop-loss"
                  type="number"
                  min="1"
                  max="50"
                  step="1"
                  value={settings.stop_loss_pct}
                  onChange={(e) => handleChange('stop_loss_pct', parseFloat(e.target.value))}
                  className={`${inputClass} pr-9`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] mono text-sm">
                  %
                </span>
              </div>
            </div>

            <div>
              <label htmlFor="settings-take-profit" className={labelClass}>
                Take Profit
              </label>
              <div className="relative">
                <input
                  id="settings-take-profit"
                  type="number"
                  min="5"
                  max="100"
                  step="5"
                  value={settings.take_profit_pct}
                  onChange={(e) => handleChange('take_profit_pct', parseFloat(e.target.value))}
                  className={`${inputClass} pr-9`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] mono text-sm">
                  %
                </span>
              </div>
            </div>
          </div>
        </div>
      </SectionShell>

      {/* Broker — delay 175ms */}
      <SectionShell
        kicker="Execution"
        title="Broker"
        description="Connect your Alpaca account or use the internal simulated broker"
        icon={<Shield className="w-5 h-5" style={{ color: 'var(--color-accent)' }} />}
        delay={175}
      >
        <BrokerSection />
      </SectionShell>

      {/* Notifications — delay 200ms */}
      <SectionShell
        kicker="Signal"
        title="Notifications"
        description="Where alerts land and how often you hear from us"
        icon={<Bell className="w-5 h-5" style={{ color: 'var(--color-warning)' }} />}
        delay={200}
      >
        <div className="space-y-4">
          {/* Push notification settings — shared component, untouched */}
          <NotificationSettings />

          {/* Email alerts toggle */}
          <ToggleRow
            id="settings-email-alerts"
            title="Email Alerts"
            description="Get critical alerts via email"
            checked={settings.email_alerts}
            onChange={(value) => handleChange('email_alerts', value)}
            divider
          />
        </div>
      </SectionShell>

      {/* Subscription — delay 250ms */}
      <SectionShell
        kicker="Billing"
        title="Subscription"
        description="Plan tier and billing portal"
        icon={<CreditCard className="w-5 h-5" style={{ color: 'var(--color-info)' }} />}
        delay={250}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Current Plan:{' '}
              <span className="capitalize text-[var(--color-accent)] font-semibold">{plan}</span>
            </p>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              Status: <span className="capitalize">{status}</span>
            </p>
          </div>
          <div className="flex gap-3">
            {plan === 'free' ? (
              <Button onClick={() => (window.location.href = '/pricing')}>Upgrade</Button>
            ) : (
              <Button
                variant="outline"
                isLoading={billingLoading}
                onClick={async () => {
                  setBillingLoading(true);
                  try {
                    const response = (await api.post('/billing/portal')) as { data: { url: string } };
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
      </SectionShell>

      {/* API Keys — delay 300ms */}
      <SectionShell
        kicker="Integrations"
        title="API Keys"
        description="Programmatic access for bots, sync jobs, and external clients"
        icon={<Key className="w-5 h-5" style={{ color: 'var(--color-accent)' }} />}
        delay={300}
      >
        <APIKeys />
      </SectionShell>

      {/* Danger zone — delay 350ms */}
      <SectionShell
        kicker="Caution"
        title="Danger Zone"
        description="Irreversible or session-ending actions"
        icon={<AlertTriangle className="w-5 h-5" style={{ color: 'var(--color-negative)' }} />}
        delay={350}
        danger
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-[var(--color-text)]">Sign Out</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              Sign out of your account on this device
            </p>
          </div>
          <Button variant="danger" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </SectionShell>
    </div>
  );
}

interface ToggleRowProps {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  divider?: boolean;
}

function ToggleRow({ id, title, description, checked, onChange, divider }: ToggleRowProps) {
  return (
    <div
      className={`flex items-center justify-between gap-4 ${
        divider ? 'pt-4 border-t border-[var(--color-border-light)]' : ''
      }`}
    >
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-semibold text-[var(--color-text)] cursor-pointer">
          {title}
        </label>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{description}</p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 animate-press focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:ring-offset-2 focus:ring-offset-[var(--color-bg)] ${
          checked
            ? 'bg-[image:var(--gradient-sovereign)]'
            : 'bg-theme-tertiary border border-[var(--color-border)]'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform duration-200 ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
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
    <SectionShell
      kicker="Appearance"
      title="Theme"
      description={`Currently ${resolved}`}
      icon={
        resolved === 'dark' ? (
          <Moon className="w-5 h-5" style={{ color: 'var(--color-info)' }} />
        ) : (
          <Sun className="w-5 h-5" style={{ color: 'var(--color-info)' }} />
        )
      }
      delay={50}
    >
      {/* Segmented control — single rounded shell, three segments */}
      <div className="grid grid-cols-3 gap-2 p-1 rounded-lg bg-[var(--color-bg-tertiary)] border border-[var(--color-border)]">
        {options.map((opt) => {
          const Icon = opt.icon;
          const isActive = theme === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setTheme(opt.value)}
              aria-pressed={isActive}
              title={opt.description}
              className={`flex flex-col items-center justify-center gap-1.5 py-3 px-3 rounded-md transition-colors duration-200 animate-press ${
                isActive
                  ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)]'
                  : 'text-theme-secondary hover:text-theme'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[11px] mono tracking-[0.2em] uppercase font-semibold">
                {opt.label}
              </span>
            </button>
          );
        })}
      </div>
    </SectionShell>
  );
}
