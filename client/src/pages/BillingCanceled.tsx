import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ChevronDown } from 'lucide-react';

interface FAQ {
  q: string;
  a: string;
}

const FAQS: FAQ[] = [
  {
    q: 'Was I charged?',
    a: 'No. Stripe never captured a payment because you backed out before completing checkout. Your card is untouched.',
  },
  {
    q: 'Can I switch between monthly and annual later?',
    a: 'Yes. Open the billing portal from Settings any time to change cadence, swap tiers, or cancel.',
  },
  {
    q: 'What does Free include?',
    a: 'Five positions, five core factors, real-time risk alerts, and the basic earnings calendar — enough to feel the engine.',
  },
  {
    q: 'Refund policy on Pro?',
    a: 'Cancel anytime from the portal. We pro-rate the unused period on annual; monthly stops at the next cycle.',
  },
];

export function BillingCanceled() {
  const navigate = useNavigate();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-theme grid-bg relative">
      {/* Sovereign top rail */}
      <div className="sovereign-bar fixed top-0 left-0 right-0 z-50" />

      {/* Subtle backdrop wash (no celebration glow here) */}
      <div
        className="absolute inset-x-0 top-0 h-[40vh] pointer-events-none gradient-brand-subtle"
        aria-hidden="true"
      />

      <main className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-20 sm:pt-28 sm:pb-24">
        {/* Back nav */}
        <button
          onClick={() => navigate('/pricing')}
          className="inline-flex items-center gap-2 mb-10 px-3 py-2 rounded-sm mono text-[10px] tracking-[0.3em] uppercase text-theme-muted hover:text-theme border border-transparent hover:border-[color:var(--color-border)] animate-press transition-[color,border-color] duration-200"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          Back to Pricing
        </button>

        {/* ── Hero ───────────────────────────────────────────────── */}
        <section className="animate-fade-in-up">
          <p className="mono text-[10px] sm:text-xs tracking-[0.5em] uppercase text-theme-muted mb-5">
            Checkout · <span className="text-theme-secondary">Canceled</span>
          </p>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black leading-[0.95] tracking-tight text-theme">
            No charge — you're still on Free.
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-theme-secondary leading-relaxed max-w-2xl">
            You backed out of checkout. Nothing was captured, nothing scheduled. Your portfolio,
            alerts, and saved settings are exactly where you left them.
          </p>
        </section>

        {/* ── CTA row ────────────────────────────────────────────── */}
        <section className="mt-10 sm:mt-12 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
          <button
            onClick={() => navigate('/pricing')}
            aria-label="Back to pricing"
            className="px-6 py-3 rounded-sm glass-slab text-theme mono text-[10px] font-bold tracking-[0.3em] uppercase animate-press animate-lift hover:border-[color:var(--color-border-hover)] inline-flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            Back to Pricing
          </button>

          <button
            onClick={() => navigate('/dashboard')}
            aria-label="Continue with Free plan"
            className="px-6 py-3 rounded-sm bg-[image:var(--gradient-sovereign)] text-white mono text-[10px] font-black tracking-[0.3em] uppercase animate-press animate-lift shadow-[0_4px_30px_rgba(123,44,255,0.35)] hover:brightness-110 hover:shadow-[0_6px_40px_rgba(123,44,255,0.5)] inline-flex items-center justify-center gap-2"
          >
            Continue with Free
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </section>

        {/* ── FAQ ────────────────────────────────────────────────── */}
        <section className="mt-16 sm:mt-20">
          <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted mb-5">
            Common · Questions
          </p>

          <div className="glass-slab-floating rounded-2xl divide-y divide-[color:var(--color-border-light)] overflow-hidden">
            {FAQS.map((faq, i) => {
              const isOpen = openIndex === i;
              return (
                <div key={faq.q}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpenIndex(isOpen ? null : i)}
                    className="w-full px-5 sm:px-6 py-4 flex items-center justify-between gap-4 text-left animate-press"
                  >
                    <span className="text-sm sm:text-base font-medium text-theme">{faq.q}</span>
                    <ChevronDown
                      className={`w-4 h-4 flex-shrink-0 text-theme-muted transition-transform duration-200 ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                      aria-hidden="true"
                    />
                  </button>
                  {isOpen && (
                    <div className="px-5 sm:px-6 pb-5 -mt-1 animate-fade-in-up">
                      <p className="text-sm text-theme-secondary leading-relaxed">{faq.a}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-center mono text-[10px] tracking-[0.3em] uppercase text-theme-muted mt-8">
            Stripe-Secured · Cancel-Anytime · No Lock-In
          </p>
        </section>
      </main>
    </div>
  );
}

export default BillingCanceled;
