import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const EFFECTIVE = '2026-05-08';

export function Terms() {
  return (
    <div className="min-h-screen bg-theme grid-bg">
      <div className="sovereign-bar fixed top-0 left-0 right-0 z-50" />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-20 pb-24">
        <Link
          to="/login"
          className="inline-flex items-center gap-2 mono text-[10px] tracking-[0.3em] uppercase text-theme-muted hover:text-theme-primary transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to login
        </Link>

        <header className="mt-8">
          <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">
            Legal · Effective {EFFECTIVE}
          </p>
          <h1 className="mt-3 text-4xl sm:text-5xl font-semibold tracking-tight bg-clip-text text-transparent bg-[image:var(--gradient-halo)]">
            Terms of Service
          </h1>
          <p className="mt-4 text-theme-secondary">
            These terms govern your use of Frontier Alpha, a service provided by
            Metaventions AI. By accessing or using the platform, you agree to be
            bound by these terms.
          </p>
        </header>

        <section className="mt-12 space-y-10 text-theme-secondary leading-relaxed">
          <div>
            <h2 className="text-xl font-semibold text-theme-primary">1. Service description</h2>
            <p className="mt-3">
              Frontier Alpha is a cognitive factor intelligence platform that
              provides portfolio analysis, factor exposure visualization, and
              optional paper trading. The platform is informational and does
              not constitute investment advice. You are responsible for your
              own investment decisions.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-theme-primary">2. Accounts</h2>
            <p className="mt-3">
              You must provide accurate information when creating an account.
              You are responsible for maintaining the confidentiality of your
              credentials and for all activity under your account. You may not
              share your account or use it on behalf of another party without
              explicit written permission.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-theme-primary">3. Subscriptions and billing</h2>
            <p className="mt-3">
              Paid plans are billed through Stripe. Subscriptions renew
              automatically until canceled. You may cancel at any time through
              the customer portal. Refunds are issued at our sole discretion.
              Complimentary access (founder, lifetime, or partner programs) may
              be revoked if used in violation of these terms.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-theme-primary">4. Acceptable use</h2>
            <p className="mt-3">
              You may not reverse engineer, scrape, or programmatically extract
              data from the platform beyond your own portfolio. You may not
              attempt to disrupt the service or access accounts that are not
              your own. We reserve the right to suspend accounts that abuse
              rate limits or violate these terms.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-theme-primary">5. Market data and accuracy</h2>
            <p className="mt-3">
              Quotes, factor scores, and analytical output are provided on a
              best-effort basis. Real-time data is sourced from third parties
              (Polygon.io, Alpha Vantage). Frontier Alpha makes no guarantee
              of accuracy, completeness, or timeliness, and is not liable for
              decisions made based on platform output.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-theme-primary">6. Intellectual property</h2>
            <p className="mt-3">
              All platform code, factor models, CVRF belief systems, and
              cognitive explainer logic are the property of Metaventions AI.
              You retain ownership of your portfolio data and any positions
              you connect via Alpaca or other broker integrations.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-theme-primary">7. Termination</h2>
            <p className="mt-3">
              You may close your account at any time. We may suspend or
              terminate access for material breach of these terms. Upon
              termination, your portfolio data is retained for 90 days and
              then permanently deleted.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-theme-primary">8. Liability</h2>
            <p className="mt-3">
              The service is provided "as is." Metaventions AI is not liable
              for trading losses, missed opportunities, or downstream damages
              resulting from use of the platform. Our total liability is
              capped at the amount you paid in the 12 months preceding the
              claim.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-theme-primary">9. Changes to these terms</h2>
            <p className="mt-3">
              We may update these terms as the platform evolves. Material
              changes will be communicated via email at least 14 days before
              taking effect.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-theme-primary">10. Contact</h2>
            <p className="mt-3">
              Questions about these terms can be sent to{' '}
              <a
                href="mailto:dicoangelo@metaventionsai.com"
                className="text-[var(--color-accent)] hover:underline"
              >
                dicoangelo@metaventionsai.com
              </a>
              .
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
