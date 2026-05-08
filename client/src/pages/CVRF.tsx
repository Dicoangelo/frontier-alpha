/**
 * CVRF Page
 *
 * Conceptual Verbal Reinforcement Framework Dashboard.
 *
 * Standalone shell (no Layout wrapper — see App.tsx). Provides the
 * sovereign page chrome (grid background, sovereign bar, hero header)
 * around the existing CVRFDashboard. Visualization internals live
 * inside `client/src/components/cvrf/` and are intentionally untouched.
 */

import { CVRFDashboard } from '@/components/cvrf';
import { UpgradeGate } from '@/components/shared/UpgradeGate';

export function CVRF() {
  return (
    <div className="min-h-screen bg-theme grid-bg">
      {/* Sovereign rail — fixed page-top accent for standalone routes */}
      <div className="sovereign-bar fixed top-0 left-0 right-0 z-50" aria-hidden="true" />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative isolate overflow-hidden">
        <div
          className="absolute inset-0 gradient-brand-subtle pointer-events-none"
          aria-hidden="true"
        />

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-8 sm:pt-20 sm:pb-10">
          <div
            className="max-w-3xl animate-enter"
            style={{ animationFillMode: 'both' }}
          >
            <p className="mono text-[10px] sm:text-xs tracking-[0.3em] uppercase text-theme-muted mb-2">
              CVRF · <span className="text-[color:var(--color-accent-secondary)]">Cognitive Variance Reduction Framework</span>
            </p>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black leading-[1.05] tracking-tight">
              <span className="text-gradient-brand holo-pulse">Episodic Belief</span>{' '}
              <span className="text-theme">Learning</span>
            </h1>

            <p className="mt-5 text-base sm:text-lg text-theme-secondary leading-relaxed max-w-2xl">
              Each episode updates the system's beliefs about which factors carry signal.
              Confidence rises with corroboration, decays with surprise — explainable and persistent.
            </p>

            <p className="mt-4 mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">
              Episodes · Belief Updates · Confidence Decay
            </p>
          </div>
        </div>
      </section>

      {/* ── Dashboard slab ──────────────────────────────────────────────── */}
      <section className="px-4 sm:px-6 lg:px-8 pb-16 sm:pb-20">
        <div className="max-w-7xl mx-auto">
          <UpgradeGate
            requiredPlan="pro"
            title="Episodic Belief Learning"
            description="The CVRF dashboard exposes live belief updates, confidence decay, and per-episode factor signal — included in the Pro Plan. Upgrade to watch the system learn."
          >
            <CVRFDashboard />
          </UpgradeGate>
        </div>
      </section>
    </div>
  );
}

export default CVRF;
