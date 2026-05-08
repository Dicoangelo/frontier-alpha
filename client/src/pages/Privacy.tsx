import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const EFFECTIVE = '2026-05-08';

export function Privacy() {
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
            Privacy Policy
          </h1>
          <p className="mt-4 text-theme-secondary">
            Frontier Alpha, operated by Metaventions AI, takes data privacy
            seriously. This policy explains what we collect, how we use it,
            and the choices you have.
          </p>
        </header>

        <section className="mt-12 space-y-10 text-theme-secondary leading-relaxed">
          <div>
            <h2 className="text-xl font-semibold text-theme-primary">1. What we collect</h2>
            <ul className="mt-3 space-y-2 list-disc pl-6">
              <li>
                <span className="text-theme-primary">Account data:</span> email
                address, display name, and authentication state via Supabase.
              </li>
              <li>
                <span className="text-theme-primary">Portfolio data:</span>{' '}
                positions, cash balance, and trades you enter or import.
              </li>
              <li>
                <span className="text-theme-primary">Broker credentials:</span>{' '}
                if you connect Alpaca, your API key and secret are encrypted
                at rest with AES-256-GCM and never logged in plaintext.
              </li>
              <li>
                <span className="text-theme-primary">Usage telemetry:</span>{' '}
                request paths, latency, and error traces (Pino logs, Sentry
                when enabled). No keystrokes, no screen recordings.
              </li>
              <li>
                <span className="text-theme-primary">Billing data:</span>{' '}
                Stripe customer ID and subscription status. Card numbers
                never touch our servers — they are tokenized by Stripe.
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-theme-primary">2. How we use it</h2>
            <p className="mt-3">
              We use your data to operate the platform: render your portfolio,
              compute factor exposures, deliver alerts, and process billing.
              We do not sell your data. We do not share data with advertisers.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-theme-primary">3. Third-party processors</h2>
            <p className="mt-3">
              The following providers process data strictly to operate the
              service:
            </p>
            <ul className="mt-3 space-y-2 list-disc pl-6">
              <li>Supabase (auth + Postgres database)</li>
              <li>Stripe (billing and subscription management)</li>
              <li>Resend (transactional email delivery)</li>
              <li>Polygon.io and Alpha Vantage (market data only — no user data sent)</li>
              <li>DeepSeek and OpenAI (AI explainer prompts; no portfolio data sent unless you explicitly request explanation)</li>
              <li>Vercel and Railway (application hosting)</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-theme-primary">4. Data retention</h2>
            <p className="mt-3">
              Active account data is retained while your account is open.
              After account closure, portfolio data is retained for 90 days
              to allow recovery, then permanently deleted. Anonymized
              aggregate metrics may be retained indefinitely.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-theme-primary">5. Encryption</h2>
            <p className="mt-3">
              All traffic is served over TLS. Broker API credentials are
              encrypted at rest using AES-256-GCM with a 32-byte key managed
              outside the database. Database access uses Supabase Row Level
              Security so users can only read their own rows.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-theme-primary">6. Your rights</h2>
            <p className="mt-3">
              You can export your portfolio data, disconnect Alpaca, and
              close your account at any time from Settings. To request a
              full data export or deletion, email{' '}
              <a
                href="mailto:dicoangelo@metaventionsai.com"
                className="text-[var(--color-accent)] hover:underline"
              >
                dicoangelo@metaventionsai.com
              </a>
              .
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-theme-primary">7. Cookies</h2>
            <p className="mt-3">
              We use a single first-party cookie (Supabase auth session) to
              keep you signed in. We do not use tracking cookies, analytics
              cookies, or third-party advertising cookies.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-theme-primary">8. Children</h2>
            <p className="mt-3">
              Frontier Alpha is not intended for users under 18 and we do not
              knowingly collect data from minors.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-theme-primary">9. Changes to this policy</h2>
            <p className="mt-3">
              Material changes will be communicated via email at least 14
              days before taking effect. The latest version is always
              available at this URL.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-theme-primary">10. Contact</h2>
            <p className="mt-3">
              Privacy questions and data requests:{' '}
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
