import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ArrowLeft } from 'lucide-react';
import { api } from '@/api/client';
import { useAuthStore } from '@/stores/authStore';
import { useSubscription } from '@/hooks/useSubscription';
import { useToast } from '@/hooks/useToast';

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
  const { toastError } = useToast();

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

  return (
    <div className="min-h-screen bg-[var(--color-bg)] dark:bg-[#0F1219]">
      {/* Sovereign bar */}
      <div className="sovereign-bar fixed top-0 left-0 right-0 z-50" />

      <div className="max-w-6xl mx-auto px-4 py-16">
        {/* Back navigation */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl sm:text-5xl font-black text-white mb-4">
            Choose Your <span className="text-gradient-brand">Plan</span>
          </h1>
          <p className="text-lg text-white/60 max-w-xl mx-auto">
            Institutional intelligence at every level. Start free, scale when you're ready.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {PLANS.map((plan) => {
            const isCurrent = plan.name.toLowerCase() === currentPlan;
            const isLoading = loadingPlan === plan.name;

            return (
              <div
                key={plan.name}
                className={`glass-slab rounded-sm p-6 sm:p-8 flex flex-col relative ${
                  plan.highlighted ? 'border border-[var(--color-accent)]/40 shadow-[0_0_40px_rgba(123,44,255,0.15)]' : ''
                }`}
              >
                {plan.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-[var(--color-accent)] text-white text-[10px] mono tracking-[0.3em] uppercase rounded-full">
                    Most Popular
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-white mb-1">{plan.name}</h3>
                  <div className="flex items-baseline gap-1 mb-2">
                    <span className="text-4xl font-black text-white">{plan.price}</span>
                    <span className="text-sm text-white/40">{plan.priceNote}</span>
                  </div>
                  <p className="text-sm text-white/50">{plan.description}</p>
                </div>

                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-white/70">
                      <Check className="w-4 h-4 text-[var(--color-positive)] flex-shrink-0 mt-0.5" />
                      {feature}
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <button
                    disabled
                    className="w-full py-3 px-4 rounded-sm text-sm font-medium bg-white/5 text-white/40 cursor-default mono tracking-[0.1em] uppercase"
                  >
                    Current Plan
                  </button>
                ) : plan.priceId === null ? (
                  <button
                    disabled
                    className="w-full py-3 px-4 rounded-sm text-sm font-medium bg-white/5 text-white/40 cursor-default mono tracking-[0.1em] uppercase"
                  >
                    Free Forever
                  </button>
                ) : (
                  <button
                    onClick={() => handleCheckout(plan)}
                    disabled={isLoading}
                    className={`w-full py-3 px-4 rounded-sm text-sm font-medium mono tracking-[0.1em] uppercase transition-all click-feedback ${
                      plan.highlighted
                        ? 'bg-[var(--color-accent)] text-white hover:opacity-90 shadow-[0_0_20px_rgba(123,44,255,0.3)]'
                        : 'bg-white/10 text-white hover:bg-white/15'
                    } disabled:opacity-50`}
                  >
                    {isLoading ? 'Redirecting...' : 'Get Started'}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer note */}
        <p className="text-center text-xs text-white/30 mt-8 mono">
          All plans include SSL encryption, SOC 2 compliance, and 99.9% uptime SLA.
        </p>
      </div>
    </div>
  );
}

export default Pricing;
