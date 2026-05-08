import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Sparkles, ArrowRight, Settings, Activity, Brain, Layers } from 'lucide-react';
import { api } from '@/api/client';
import { useToast } from '@/hooks/useToast';

interface UnlockedFeature {
  icon: typeof Activity;
  kicker: string;
  title: string;
  body: string;
}

const UNLOCKED: UnlockedFeature[] = [
  {
    icon: Activity,
    kicker: 'Real-Time',
    title: 'Live Market Data',
    body: 'Polygon WebSocket streaming, no throttle. Quotes, depth, factor updates as the tape ticks.',
  },
  {
    icon: Brain,
    kicker: 'Belief',
    title: 'CVRF Beliefs',
    body: 'Episodic belief updates with full provenance. Every conviction traceable to the evidence that formed it.',
  },
  {
    icon: Layers,
    kicker: 'Decompose',
    title: 'Factor Decomposition',
    body: 'All 80+ factors active across 12 groups. Drill from portfolio P&L into the exposures driving it.',
  },
];

type SubStatus = 'processing' | 'active' | 'unknown';

export function BillingSuccess() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const { toastError } = useToast();

  const [status, setStatus] = useState<SubStatus>('processing');
  const [portalLoading, setPortalLoading] = useState(false);

  // Hit /billing/subscription once on mount to detect activation state.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = (await api.get('/billing/subscription')) as {
          data: { plan?: string; status?: string };
        };
        if (cancelled) return;
        const planStatus = response.data?.status;
        const plan = response.data?.plan;
        if (plan && plan !== 'free' && planStatus === 'active') {
          setStatus('active');
        } else {
          setStatus('processing');
        }
      } catch {
        if (!cancelled) setStatus('unknown');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handlePortal = async () => {
    setPortalLoading(true);
    try {
      const response = (await api.post('/billing/portal', {})) as {
        data: { url?: string };
      };
      if (response.data?.url) {
        window.location.href = response.data.url;
        return;
      }
      toastError('Portal unavailable', { message: 'Try opening the portal from Settings.' });
    } catch {
      toastError('Portal unavailable', { message: 'Try opening the portal from Settings.' });
    } finally {
      setPortalLoading(false);
    }
  };

  const statusBadge =
    status === 'active' ? (
      <span
        role="status"
        aria-live="polite"
        className="mono text-[10px] tracking-[0.3em] uppercase inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[color:var(--color-positive)]/40 text-[color:var(--color-positive)] bg-[color:var(--color-positive)]/10"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--color-positive)]" aria-hidden="true" />
        Activated
      </span>
    ) : (
      <span
        role="status"
        aria-live="polite"
        className="mono text-[10px] tracking-[0.3em] uppercase inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[color:var(--color-border)] text-theme-muted animate-pulse-subtle"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--color-accent)]" aria-hidden="true" />
        {status === 'unknown' ? 'Pending' : 'Processing'}
      </span>
    );

  return (
    <div className="min-h-screen bg-theme grid-bg relative">
      {/* Sovereign top rail */}
      <div className="sovereign-bar fixed top-0 left-0 right-0 z-50" />

      {/* Celebration glow backdrop */}
      <div
        className="absolute inset-x-0 top-0 h-[60vh] pointer-events-none"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(ellipse at 50% 0%, rgba(123,44,255,0.18), rgba(24,230,255,0.06) 35%, transparent 65%)',
        }}
      />

      <main className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-20 sm:pt-28 sm:pb-24">
        {/* ── Hero ───────────────────────────────────────────────────── */}
        <section className="text-center max-w-3xl mx-auto animate-fade-in-up">
          <div className="inline-flex items-center gap-2 mb-6">
            <Sparkles className="w-4 h-4 text-[color:var(--color-accent-secondary)]" aria-hidden="true" />
            <p className="mono text-[10px] sm:text-xs tracking-[0.5em] uppercase text-theme-muted">
              Checkout · <span className="text-[color:var(--color-accent-secondary)]">Confirmed</span>
            </p>
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black leading-[0.95] tracking-tight text-theme">
            Welcome to{' '}
            <span className="text-gradient-halo holo-pulse">Pro</span>
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-theme-secondary leading-relaxed max-w-2xl mx-auto">
            Your sovereign tier is live. Every factor, every belief, every stream — unlocked.
          </p>

          <div className="mt-7 flex items-center justify-center gap-3">{statusBadge}</div>

          <p className="mt-3 mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">
            Your subscription is being activated by Stripe — usually takes 5-10 seconds.
          </p>
        </section>

        {/* ── Unlocked feature grid ──────────────────────────────────── */}
        <section className="mt-14 sm:mt-16">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 lg:gap-6 animate-stagger">
            {UNLOCKED.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="glass-slab-floating rounded-2xl p-6 sm:p-7 flex flex-col gap-4 animate-enter"
                >
                  <div className="flex items-center justify-between">
                    <span
                      className="w-10 h-10 rounded-xl inline-flex items-center justify-center bg-[color:var(--color-accent)]/10 border border-[color:var(--color-border)]"
                      aria-hidden="true"
                    >
                      <Icon className="w-5 h-5 text-[color:var(--color-accent)]" />
                    </span>
                    <span className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">
                      {feature.kicker}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold tracking-tight text-theme">{feature.title}</h3>
                  <p className="text-sm text-theme-secondary leading-relaxed">{feature.body}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── CTA row ───────────────────────────────────────────────── */}
        <section className="mt-14 sm:mt-16 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 sm:gap-4">
          <button
            onClick={() => navigate('/dashboard')}
            aria-label="Open your Dashboard"
            className="px-6 py-3 rounded-sm bg-[image:var(--gradient-sovereign)] text-white mono text-[10px] font-black tracking-[0.3em] uppercase animate-press animate-lift shadow-[0_4px_30px_rgba(123,44,255,0.35)] hover:brightness-110 hover:shadow-[0_6px_40px_rgba(123,44,255,0.5)] inline-flex items-center justify-center gap-2"
          >
            Open your Dashboard
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>

          <button
            onClick={handlePortal}
            disabled={portalLoading}
            aria-label="Manage subscription in Stripe portal"
            className="px-6 py-3 rounded-sm glass-slab text-theme mono text-[10px] font-bold tracking-[0.3em] uppercase animate-press animate-lift hover:border-[color:var(--color-border-hover)] disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            <Settings className="w-3.5 h-3.5" aria-hidden="true" />
            {portalLoading ? 'Opening…' : 'Manage Subscription'}
          </button>
        </section>

        {/* Session id footer (debug breadcrumb) */}
        {sessionId && (
          <p className="mt-12 text-center mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">
            Session · {sessionId.slice(-8)}
          </p>
        )}
      </main>
    </div>
  );
}

export default BillingSuccess;
