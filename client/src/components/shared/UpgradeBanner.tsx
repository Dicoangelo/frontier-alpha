import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Sparkles } from 'lucide-react';
import { useSubscription } from '@/hooks/useSubscription';

export function UpgradeBanner() {
  const { plan } = useSubscription();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(() => {
    return sessionStorage.getItem('upgrade-banner-dismissed') === 'true';
  });

  if (plan !== 'free' || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem('upgrade-banner-dismissed', 'true');
  };

  return (
    <div className="relative bg-gradient-to-r from-[var(--color-accent)]/10 via-[var(--color-accent)]/5 to-transparent border border-[var(--color-accent)]/20 rounded-lg p-4 mb-6">
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 p-1 rounded hover:bg-white/10 transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4 text-[var(--color-text-muted)]" />
      </button>
      <div className="flex items-center gap-3">
        <Sparkles className="w-5 h-5 text-[var(--color-accent)] flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-[var(--color-text)]">
            Unlock all features with Pro
          </p>
          <p className="text-xs text-[var(--color-text-muted)]">
            Get portfolio optimizer, backtesting, options analysis, and more.
          </p>
        </div>
        <button
          onClick={() => navigate('/pricing')}
          className="px-4 py-1.5 text-xs font-medium bg-[var(--color-accent)] text-white rounded-md hover:opacity-90 transition-opacity flex-shrink-0"
        >
          Upgrade
        </button>
      </div>
    </div>
  );
}
