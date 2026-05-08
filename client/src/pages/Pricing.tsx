import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ArrowLeft, Mail, Info } from 'lucide-react';
import { api } from '@/api/client';
import { useAuthStore } from '@/stores/authStore';
import { useSubscription } from '@/hooks/useSubscription';
import { useToast } from '@/hooks/useToast';
import { useStripeStatus } from '@/hooks/useIntegrationsHealth';

const NOTIFY_EMAIL = 'dico@metaventionsai.com';

interface PlanConfig {
  name: string;
  price: string;
  priceNote: string;
  description: string;
  features: string[];
  priceId: string | null;
  highlighted?: boolean;
}

const PLANS: PlanConfig[] = [
  {
    name: 'Free',
    price: '$0',
    priceNote: 'forever',
    description: 'Get started with basic portfolio intelligence.',
    priceId: null,
    features: [
      'Basic portfolio (5 positions)',
      '5 core factors',
      '5 AI explanations / day',
      'Real-time risk alerts',
      'Basic earnings calendar',
    ],
  },
  {
    name: 'Pro',
    price: '$29',
    priceNote: '/ month',
    description: 'Full portfolio analysis with advanced tools.',
    priceId: import.meta.env.VITE_STRIPE_PRO_PRICE_ID || '',
    highlighted: true,
    features: [
      'Unlimited positions',
      '80+ factor analysis',
      'Unlimited AI explanations',
      'Portfolio optimizer',
      'Backtesting engine',
      'Options analysis',
      'Advanced risk modeling',
      'Priority support',
    ],
  },
  {
    name: 'Enterprise',
    price: '$99',
    priceNote: '/ month',
    description: 'Institutional-grade intelligence for serious investors.',
    priceId: import.meta.env.VITE_STRIPE_ENTERPRISE_PRICE_ID || '',
    features: [
      'Everything in Pro',
      'ML regime detection',
      'Tax-loss harvesting',
      'API access',
      'Custom factor models',
      'White-glove onboarding',
      'Dedicated support',
      'Custom integrations',
    ],
  },
];

export function Pricing() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { plan: currentPlan } = useSubscription();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const { toastError, toastInfo } = useToast();
  const stripeStatus = useStripeStatus();
  const stripeDegraded = stripeStatus === 'degraded';

  const handleCheckout = async (plan: PlanConfig) => {
    if (!plan.priceId) return;

    if (!user) {
      navigate('/login');
      return;
    }

    setLoadingPlan(plan.name);

    try {
      const response = await api.post('/billing/checkout', {
        priceId: plan.priceId,
      }) as { data: { url: string } };

      if (response.data?.url) {
        window.location.href = response.data.url;
      }
    } catch {
      toastError('Failed to start checkout', { message: 'Please try again.' });
      setLoadingPlan(null);
    }
  };

  const buildNotifyHref = (planName: string) => {
    const subject = encodeURIComponent(`FrontierAlpha ${planName} — Notify Me`);
    const body = encodeURIComponent(
      `I'd like to be notified when the ${planName} plan opens.`,
    );
    return `mailto:${NOTIFY_EMAIL}?subject=${subject}&body=${body}`;
  };

  const handleNotifyClick = (planName: string) => {
    toastInfo('Stripe checkout not yet enabled', {
      message: `Drop your email to be first in line for ${planName}.`,
    });
  };

  return (
    <div className="min-h-screen bg-theme grid-bg">
      {/* Sovereign bar */}
      <div className="sovereign-bar fixed top-0 left-0 right-0 z-50" />

      {/* ── Stripe degraded banner ───────────────────────────────────────── */}
      {stripeDegraded && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-20">
          <div
            role="status"
            aria-live="polite"
            className="glass-slab-floating relative overflow-hidden rounded-xl pl-5 pr-4 py-4 flex items-start gap-3 before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-[image:var(--gradient-sovereign)] shadow-[0_18px_60px_-20px_rgba(123,44,255,0.45)]"
          >
            <Info className="w-5 h-5 flex-shrink-0 mt-0.5 text-[var(--color-accent)]" aria-hidden="true" />
            <div className="flex-1">
              <p className="mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-accent)]">
                Billing · Coming Soon
              </p>
              <p className="text-sm mt-1 text-theme-secondary">
                Stripe is being wired in. Tier signup opens Q3.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative isolate overflow-hidden">
        <div className="absolute inset-0 gradient-brand-subtle pointer-events-none" aria-hidden="true" />

        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-10 sm:pt-24 sm:pb-12">
          {/* Back navigation */}
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 mb-10 px-3 py-2 rounded-sm mono text-[10px] tracking-[0.3em] uppercase text-theme-muted hover:text-theme border border-transparent hover:border-[color:var(--color-border)] animate-press transition-[color,border-color] duration-200"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            Back
          </button>

          <div className="text-center max-w-3xl mx-auto animate-fade-in-up">
            <p className="text-[10px] sm:text-xs mono tracking-[0.5em] uppercase text-theme-muted mb-5">
              Pricing · <span className="text-[color:var(--color-accent-secondary)]">Sovereign Tiers</span>
            </p>

            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black leading-[0.95] tracking-tight text-theme">
              Choose Your{' '}
              <span className="text-gradient-brand holo-pulse">Plan</span>
            </h1>

            <p className="mt-6 text-lg sm:text-xl text-theme-secondary leading-relaxed max-w-2xl mx-auto">
              Institutional intelligence at every level. Start free, scale when you're ready.
            </p>

            <p className="mt-4 text-[10px] mono tracking-[0.3em] uppercase text-theme-muted">
              80+ Factors · Explainable AI · Real-Time Risk
            </p>
          </div>
        </div>
      </section>

      {/* ── Pricing Cards ────────────────────────────────────────────────── */}
      <section className="px-4 sm:px-6 lg:px-8 pb-16 sm:pb-20 lg:pb-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 max-w-6xl mx-auto animate-stagger">
          {PLANS.map((plan) => {
            const isCurrent = plan.name.toLowerCase() === currentPlan;
            const isLoading = loadingPlan === plan.name;
            const isFree = plan.priceId === null;

            const cardSurface = plan.highlighted
              ? 'border-sovereign glass-slab md:scale-[1.02] shadow-[0_8px_50px_rgba(123,44,255,0.18)]'
              : 'glass-slab';

            return (
              <div
                key={plan.name}
                className={`${cardSurface} rounded-2xl p-6 sm:p-8 flex flex-col relative animate-enter`}
              >
                {plan.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-[image:var(--gradient-sovereign)] text-white text-[10px] mono tracking-[0.3em] uppercase rounded-full shadow-[0_4px_20px_rgba(123,44,255,0.45)]">
                    Most Popular
                  </div>
                )}

                {/* Tier head */}
                <div className="mb-6">
                  <h3
                    className={`text-xl font-bold tracking-tight mb-3 ${
                      plan.highlighted ? 'text-gradient-brand' : 'text-theme'
                    }`}
                  >
                    {plan.name}
                  </h3>

                  <div className="flex items-baseline gap-1.5 mb-3">
                    <span className="text-5xl sm:text-6xl font-black text-theme leading-none">
                      {plan.price}
                    </span>
                    <span className="text-sm text-theme-muted mono tracking-[0.15em] uppercase">
                      {plan.priceNote}
                    </span>
                  </div>

                  <p className="text-sm text-theme-secondary leading-relaxed">{plan.description}</p>
                </div>

                {/* Divider */}
                <div className="h-px w-full bg-[color:var(--color-border-light)] mb-6" aria-hidden="true" />

                {/* Feature list */}
                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-3 text-sm text-theme-secondary leading-relaxed"
                    >
                      <Check
                        className="w-5 h-5 flex-shrink-0 mt-0.5 text-[color:var(--color-positive)]"
                        aria-hidden="true"
                      />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                {isCurrent ? (
                  <button
                    disabled
                    aria-label={`${plan.name} is your current plan`}
                    className="w-full py-3 px-4 rounded-sm text-sm font-medium bg-[var(--color-bg-tertiary)] text-theme-muted cursor-default mono text-[10px] tracking-[0.3em] uppercase border border-[color:var(--color-border)]"
                  >
                    Current Plan
                  </button>
                ) : isFree ? (
                  <button
                    disabled
                    aria-label="Free plan is included"
                    className="w-full py-3 px-4 rounded-sm bg-transparent border border-[color:var(--color-border)] text-theme-secondary cursor-default mono text-[10px] tracking-[0.3em] uppercase"
                  >
                    Free Forever
                  </button>
                ) : stripeDegraded ? (
                  <a
                    href={buildNotifyHref(plan.name)}
                    onClick={() => handleNotifyClick(plan.name)}
                    aria-label={`Get notified when ${plan.name} opens`}
                    className={`w-full py-3 px-4 rounded-sm glass-slab text-theme mono text-[10px] font-bold tracking-[0.3em] uppercase animate-press animate-lift hover:border-[color:var(--color-border-hover)] inline-flex items-center justify-center gap-2 ${
                      plan.highlighted ? 'border-sovereign' : ''
                    }`}
                  >
                    <Mail className="w-3.5 h-3.5" aria-hidden="true" />
                    Get Notified
                  </a>
                ) : plan.highlighted ? (
                  <button
                    onClick={() => handleCheckout(plan)}
                    disabled={isLoading}
                    aria-label={`Upgrade to ${plan.name}`}
                    className="w-full py-3 px-4 rounded-sm bg-[image:var(--gradient-sovereign)] text-white mono text-[10px] font-black tracking-[0.3em] uppercase animate-press animate-lift shadow-[0_4px_30px_rgba(123,44,255,0.35)] hover:brightness-110 hover:shadow-[0_6px_40px_rgba(123,44,255,0.5)] disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-[0_4px_30px_rgba(123,44,255,0.35)]"
                  >
                    {isLoading ? 'Redirecting…' : 'Get Started'}
                  </button>
                ) : (
                  <button
                    onClick={() => handleCheckout(plan)}
                    disabled={isLoading}
                    aria-label={`Upgrade to ${plan.name}`}
                    className="w-full py-3 px-4 rounded-sm glass-slab text-theme mono text-[10px] font-bold tracking-[0.3em] uppercase animate-press animate-lift hover:border-[color:var(--color-border-hover)] disabled:opacity-50"
                  >
                    {isLoading ? 'Redirecting…' : 'Get Started'}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Trust strip / contact-sales row ───────────────────────────── */}
        <div className="max-w-6xl mx-auto mt-12 sm:mt-16">
          <div className="glass-slab-floating rounded-2xl p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
            <div className="max-w-xl">
              <p className="text-[10px] mono tracking-[0.3em] uppercase text-theme-muted mb-2">
                Need <span className="text-[color:var(--color-accent-secondary)]">More</span>
              </p>
              <h2 className="text-xl sm:text-2xl font-bold text-theme tracking-tight">
                <span className="text-gradient-brand">Custom factor models</span> and dedicated infrastructure.
              </h2>
              <p className="mt-2 text-sm text-theme-secondary leading-relaxed">
                Talk to our team about volume seats, on-prem deployment, and bespoke factor research.
              </p>
            </div>

            <a
              href="mailto:dico.angelo97@gmail.com?subject=FrontierAlpha%20Enterprise%20Inquiry"
              className="px-6 py-3 rounded-sm bg-transparent border border-[color:var(--color-border)] text-theme-secondary hover:text-theme hover:border-[color:var(--color-border-hover)] mono text-[10px] font-bold tracking-[0.3em] uppercase animate-press animate-lift transition-[color,border-color] duration-200 whitespace-nowrap"
            >
              Contact Sales
            </a>
          </div>

          <p className="text-center text-[10px] mono tracking-[0.3em] uppercase text-theme-muted mt-8">
            SSL Encryption · SOC 2 Compliance · 99.9% Uptime SLA
          </p>
        </div>
      </section>
    </div>
  );
}

export default Pricing;
