import { useNavigate } from 'react-router-dom';
import { Lock, Sparkles } from 'lucide-react';
import { useSubscription } from '@/hooks/useSubscription';
import { Spinner } from './Spinner';

type Feature = 'optimizer' | 'backtest' | 'options' | 'ml' | 'tax' | 'apiAccess';

interface UpgradeGateProps {
  /**
   * The minimum plan required to view children. When provided, this is the
   * authoritative gate. If omitted, the gate falls back to `feature` mapping.
   */
  requiredPlan?: 'pro' | 'enterprise';
  /**
   * Legacy feature-keyed gate. Resolves to a `requiredPlan` via the
   * useSubscription registry. Either `requiredPlan` or `feature` is required.
   */
  feature?: Feature;
  /**
   * Surface label rendered in the gate ("Portfolio Optimizer" etc).
   * If omitted, falls back to a feature-derived label or "this feature".
   */
  title?: string;
  /**
   * One-paragraph human description of the locked capability.
   */
  description?: string;
  children: React.ReactNode;
}

const FEATURE_LABELS: Record<Feature, string> = {
  optimizer: 'Portfolio Optimizer',
  backtest: 'Backtesting Engine',
  options: 'Options Analysis',
  ml: 'Neural Factor Models',
  tax: 'Tax-Loss Harvesting',
  apiAccess: 'API Access',
};

const FEATURE_TO_PLAN: Record<Feature, 'pro' | 'enterprise'> = {
  optimizer: 'pro',
  backtest: 'pro',
  options: 'pro',
  ml: 'enterprise',
  tax: 'enterprise',
  apiAccess: 'enterprise',
};

const PLAN_LABEL: Record<'pro' | 'enterprise', string> = {
  pro: 'Pro Plan',
  enterprise: 'Enterprise Plan',
};

const PLAN_CTA: Record<'pro' | 'enterprise', string> = {
  pro: 'Upgrade to Pro',
  enterprise: 'Upgrade to Enterprise',
};

export function UpgradeGate({
  requiredPlan,
  feature,
  title,
  description,
  children,
}: UpgradeGateProps) {
  const { meetsPlan, isLoading, plan } = useSubscription();
  const navigate = useNavigate();

  const resolvedPlan: 'pro' | 'enterprise' =
    requiredPlan ?? (feature ? FEATURE_TO_PLAN[feature] : 'pro');

  // Show a soft skeleton while the subscription fetch is in flight to avoid
  // a flash of the gate for paying users.
  if (isLoading) {
    return (
      <div
        className="glass-slab rounded-2xl p-10 flex items-center justify-center"
        role="status"
        aria-live="polite"
        aria-label="Checking subscription"
      >
        <Spinner className="w-5 h-5" />
      </div>
    );
  }

  if (meetsPlan(resolvedPlan)) {
    return <>{children}</>;
  }

  const resolvedTitle =
    title ?? (feature ? FEATURE_LABELS[feature] : 'This feature');
  const resolvedDescription =
    description ??
    `${resolvedTitle} is included in the ${PLAN_LABEL[resolvedPlan]}. Upgrade to unlock it and the rest of the ${PLAN_LABEL[resolvedPlan].toLowerCase()} surface.`;

  const handleUpgrade = () => {
    navigate(`/pricing?plan=${resolvedPlan}`);
  };

  return (
    <div className="relative">
      {/* Blurred preview of the locked content for context (not interactive) */}
      <div
        className="blur-md pointer-events-none select-none opacity-50"
        aria-hidden="true"
      >
        {children}
      </div>

      {/* Gate panel — glass-slab-floating + sovereign-bar top rail */}
      <div className="absolute inset-0 flex items-center justify-center px-4 py-10">
        <div
          role="region"
          aria-label={`${PLAN_LABEL[resolvedPlan]} required`}
          className="glass-slab-floating relative overflow-hidden rounded-2xl w-full max-w-md p-8 sm:p-10 text-center shadow-[0_18px_60px_-20px_rgba(123,44,255,0.45)] before:content-[''] before:absolute before:left-0 before:right-0 before:top-0 before:h-[3px] before:bg-[image:var(--gradient-sovereign)] animate-fade-in-up"
        >
          {/* Lock icon medallion */}
          <div className="w-14 h-14 mx-auto mb-5 rounded-2xl flex items-center justify-center bg-[image:var(--gradient-sovereign)] shadow-[0_8px_30px_rgba(123,44,255,0.45)]">
            <Lock className="w-6 h-6 text-white" aria-hidden="true" />
          </div>

          {/* Mono kicker */}
          <p className="mono text-[10px] sm:text-xs tracking-[0.3em] uppercase text-theme-muted mb-3">
            {PLAN_LABEL[resolvedPlan].toUpperCase()} ·{' '}
            <span className="text-[color:var(--color-accent-secondary)]">Required</span>
          </p>

          {/* Title */}
          <h3 className="text-xl sm:text-2xl font-bold tracking-tight">
            <span className="text-gradient-brand">{resolvedTitle}</span>
          </h3>

          {/* Body */}
          <p className="mt-4 text-sm text-theme-secondary leading-relaxed">
            {resolvedDescription}
          </p>

          {plan !== 'free' && plan !== resolvedPlan && (
            <p className="mt-3 text-[10px] mono tracking-[0.3em] uppercase text-theme-muted">
              You are on{' '}
              <span className="text-[color:var(--color-accent-secondary)] capitalize">
                {plan}
              </span>
            </p>
          )}

          {/* Sovereign CTA */}
          <button
            type="button"
            onClick={handleUpgrade}
            aria-label={PLAN_CTA[resolvedPlan]}
            className="mt-7 w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-sm bg-[image:var(--gradient-sovereign)] text-white mono text-[10px] font-black tracking-[0.3em] uppercase animate-press animate-lift shadow-[0_4px_30px_rgba(123,44,255,0.35)] hover:brightness-110 hover:shadow-[0_6px_40px_rgba(123,44,255,0.5)] transition-[filter,box-shadow] duration-200"
          >
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            {PLAN_CTA[resolvedPlan]}
          </button>

          <button
            type="button"
            onClick={() => navigate('/pricing')}
            className="mt-3 inline-flex items-center justify-center w-full text-[10px] mono tracking-[0.3em] uppercase text-theme-muted hover:text-theme transition-colors"
          >
            Compare All Plans
          </button>
        </div>
      </div>
    </div>
  );
}
