import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Sparkles } from 'lucide-react';
import { useSubscription } from '@/hooks/useSubscription';

/**
 * UpgradeBanner — top-of-page nudge for Free-plan users.
 *
 * Hidden for Pro/Enterprise. Dismissible per-session.
 * Uses the family type-rail pattern (3px sovereign-gradient before-pseudo
 * on glass-slab-floating, mono kicker, sovereign CTA).
 */
export function UpgradeBanner() {
  const { plan, isLoading } = useSubscription();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem('upgrade-banner-dismissed') === 'true';
  });

  // Hide banner while we're still figuring out the plan, and for paying users.
  if (isLoading) return null;
  if (plan !== 'free') return null;
  if (dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem('upgrade-banner-dismissed', 'true');
  };

  return (
    <div
      role="region"
      aria-label="Upgrade to Pro"
      className="glass-slab-floating relative overflow-hidden rounded-xl pl-5 pr-12 py-4 mb-6 before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-[image:var(--gradient-sovereign)] shadow-[0_18px_60px_-20px_rgba(123,44,255,0.45)] animate-fade-in-up"
    >
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss upgrade banner"
        className="absolute top-3 right-3 p-1.5 rounded-sm text-theme-muted hover:text-theme hover:bg-[var(--color-bg-tertiary)] transition-colors animate-press"
      >
        <X className="w-3.5 h-3.5" aria-hidden="true" />
      </button>

      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <Sparkles
            className="w-5 h-5 flex-shrink-0 mt-0.5 text-[var(--color-accent)]"
            aria-hidden="true"
          />
          <div className="flex-1 min-w-0">
            <p className="mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-accent)]">
              Free Plan ·{' '}
              <span className="text-[color:var(--color-accent-secondary)]">Limited</span>
            </p>
            <p className="text-sm mt-1 text-theme leading-relaxed">
              Unlock the{' '}
              <span className="text-gradient-brand font-semibold">
                portfolio optimizer
              </span>
              , backtesting, and options analysis with Pro.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate('/pricing?plan=pro')}
          aria-label="Upgrade to Pro"
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-sm bg-[image:var(--gradient-sovereign)] text-white mono text-[10px] font-black tracking-[0.3em] uppercase animate-press animate-lift shadow-[0_4px_20px_rgba(123,44,255,0.35)] hover:brightness-110 hover:shadow-[0_6px_30px_rgba(123,44,255,0.5)] transition-[filter,box-shadow] duration-200 flex-shrink-0 whitespace-nowrap"
        >
          Upgrade
        </button>
      </div>
    </div>
  );
}
