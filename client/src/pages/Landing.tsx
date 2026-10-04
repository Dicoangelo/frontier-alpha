import { useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrandLogo } from '@/components/shared/BrandLogo';
import { HeroEnhanced } from '@/components/landing/HeroEnhanced';

// Below-the-fold sections lazy-load so the hero ships in the smallest bundle.
const DemoPreview = lazy(() => import('@/components/landing/DemoPreview').then(m => ({ default: m.DemoPreview })));
const HowItWorks = lazy(() => import('@/components/landing/HowItWorks').then(m => ({ default: m.HowItWorks })));
const TrustComparison = lazy(() => import('@/components/landing/TrustComparison').then(m => ({ default: m.TrustComparison })));

const MAG7_SYMBOLS = 'AAPL, MSFT, GOOGL, AMZN, NVDA, META, TSLA';

function parseSymbols(raw: string): string[] {
  return raw
    .split(/[,\s]+/)
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length > 0 && s.length <= 5);
}

export function Landing() {
  const navigate = useNavigate();
  const [tickers, setTickers] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoSymbols, setDemoSymbols] = useState<string[] | null>(null);
  const demoRef = useRef<HTMLDivElement | null>(null);

  const handleSignup = useCallback(() => navigate('/login?mode=signup'), [navigate]);
  const handleSignin = useCallback(() => navigate('/login'), [navigate]);

  const runDemo = useCallback((raw: string) => {
    const symbols = parseSymbols(raw);
    if (symbols.length === 0) {
      setError('Please enter at least one ticker symbol');
      return;
    }
    if (symbols.length > 20) {
      setError('Maximum 20 symbols allowed');
      return;
    }
    setError(null);
    setIsAnalyzing(true);
    localStorage.setItem('analyze_symbols', JSON.stringify(symbols));
    window.setTimeout(() => {
      setDemoSymbols(symbols);
      setIsAnalyzing(false);
    }, 380);
  }, []);

  const handleAnalyze = useCallback(() => runDemo(tickers), [runDemo, tickers]);

  const handleExplore = useCallback(() => {
    document.getElementById('portfolio-entry')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.getElementById('ticker-input')?.focus({ preventScroll: true });
  }, []);

  const handleViewDemo = useCallback(() => {
    setTickers(MAG7_SYMBOLS);
    runDemo(MAG7_SYMBOLS);
  }, [runDemo]);

  const handleClearDemo = useCallback(() => {
    setDemoSymbols(null);
    setTickers('');
  }, []);

  useEffect(() => {
    if (demoSymbols && demoRef.current) {
      demoRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [demoSymbols]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAnalyze();
    }
  }, [handleAnalyze]);

  const quickPortfolios = [
    { name: 'Mag 7', symbols: MAG7_SYMBOLS },
    { name: 'Financials', symbols: 'JPM, BAC, GS, MS, V, MA' },
    { name: 'Healthcare', symbols: 'JNJ, UNH, PFE, MRK, ABBV, LLY' },
    { name: 'Technology', symbols: 'NVDA, AMD, MSFT, GOOGL, META' },
  ];

  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex flex-col" data-testid="visual-landing-ready">
      <header className="border-b border-[var(--color-border-light)] bg-[var(--color-bg-secondary)] px-4 sm:px-6">
        <div className="fa-landing-header mx-auto flex max-w-6xl items-center justify-between gap-4 py-4">
          <a href="/" className="fa-landing-brand shrink-0 text-sm sm:text-base font-semibold tracking-tight text-[var(--color-text)]" aria-label="Frontier Alpha home">
            <BrandLogo decorative />
            Frontier Alpha
          </a>
          <nav className="flex items-center gap-2 sm:gap-4" aria-label="Account navigation">
            <button onClick={handleSignin} className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text)]">Sign in</button>
            <button onClick={handleSignup} className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-accent-hover)]">Get started</button>
          </nav>
        </div>
      </header>

      <HeroEnhanced
        onAnalyze={handleExplore}
        onLoadDemo={handleViewDemo}
        isAnalyzing={isAnalyzing}
      />

      {demoSymbols && (
        <div ref={demoRef}>
          <Suspense fallback={<div className="min-h-[400px]" aria-hidden="true" />}>
            <DemoPreview
              key={demoSymbols.join(',')}
              symbols={demoSymbols}
              onSignup={handleSignup}
              onSignin={handleSignin}
              onClear={handleClearDemo}
            />
          </Suspense>
        </div>
      )}

      {/* ── Analyze your portfolio (preserved from v1) ───────────────────── */}
      <section id="portfolio-entry" className="px-4 py-12 sm:px-6 sm:py-14 border-t border-[var(--color-border-light)]">
        <div className="w-full max-w-6xl mx-auto">
         <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[var(--color-text)]">
              Explore your holdings
            </h2>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              Enter up to 20 ticker symbols to preview the analysis workspace with sample scores.
            </p>
          </div>

          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 sm:p-6 md:p-8">
            <label htmlFor="ticker-input" className="block text-sm font-medium text-[var(--color-text)] mb-3">
              Ticker symbols
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                id="ticker-input"
                type="text"
                value={tickers}
                onChange={(e) => setTickers(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="NVDA, AAPL, MSFT, GOOGL..."
                className="flex-1 px-4 py-3 bg-[var(--color-bg-tertiary)] border border-[var(--color-border-light)] rounded-lg text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-[border-color,box-shadow] duration-200 text-sm min-w-0"
                disabled={isAnalyzing}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'ticker-error' : undefined}
              />
              <button
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                className="px-6 py-3 bg-[var(--color-accent)] text-white rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-[var(--color-accent-hover)] transition-colors min-w-[140px]"
              >
                {isAnalyzing ? 'Loading…' : 'Preview portfolio'}
              </button>
            </div>

            {error && (
              <p id="ticker-error" className="mt-3 text-[var(--color-danger)] text-sm" role="alert">{error}</p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-xs text-[var(--color-text-muted)]">Quick start:</span>
              {quickPortfolios.map((portfolio) => (
                <button
                  key={portfolio.name}
                  onClick={() => {
                    setTickers(portfolio.symbols);
                    runDemo(portfolio.symbols);
                  }}
                  className="px-3 py-1.5 text-xs bg-[var(--color-bg-secondary)] hover:bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:text-[var(--color-accent-text)] rounded-md transition-colors border border-[var(--color-border)]"
                >
                  {portfolio.name}
                </button>
              ))}
            </div>
          </div>
         </div>
        </div>
      </section>

      <Suspense fallback={<div className="min-h-[200px]" aria-hidden="true" />}>
        <HowItWorks onCTAClick={handleExplore} />
      </Suspense>

      <Suspense fallback={<div className="min-h-[200px]" aria-hidden="true" />}>
        <TrustComparison />
      </Suspense>

      <footer className="mt-auto border-t border-[var(--color-border-light)] py-6 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="fa-brand-footer">
            <BrandLogo variant="wordmark" />
            <div className="fa-brand-footer-copy"><strong>Frontier Alpha</strong>Built by Metaventions AI</div>
          </div>
          <nav className="flex flex-wrap justify-center gap-x-5 gap-y-3" aria-label="Footer navigation">
            <button
              onClick={() => navigate('/login')}
              className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-accent-text)] transition-colors"
            >
              Sign in
            </button>
            <button
              onClick={() => navigate('/help')}
              className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-accent-text)] transition-colors"
            >
              Documentation
            </button>
            <a
              href="/api/v1/openapi"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-accent-text)] transition-colors"
            >
              API
            </a>
            <a
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-accent-text)] transition-colors"
            >
              Terms
            </a>
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-accent-text)] transition-colors"
            >
              Privacy
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

export default Landing;
