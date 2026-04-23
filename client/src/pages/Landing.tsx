import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FactorBackdrop } from '@/components/landing/FactorBackdrop';
import { TypingTickerDemo } from '@/components/landing/TypingTickerDemo';

const MAG7_SYMBOLS = 'AAPL, MSFT, GOOGL, AMZN, NVDA, META, TSLA';

export function Landing() {
  const navigate = useNavigate();
  const [tickers, setTickers] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = useCallback(async () => {
    const symbols = tickers
      .split(/[,\s]+/)
      .map(s => s.trim().toUpperCase())
      .filter(s => s.length > 0 && s.length <= 5);

    if (symbols.length === 0) {
      setError('Please enter at least one ticker symbol');
      return;
    }

    if (symbols.length > 20) {
      setError('Maximum 20 symbols allowed');
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    localStorage.setItem('analyze_symbols', JSON.stringify(symbols));

    setTimeout(() => {
      navigate('/dashboard');
    }, 500);
  }, [tickers, navigate]);

  const handleViewDemo = useCallback(() => {
    setTickers(MAG7_SYMBOLS);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAnalyze();
    }
  }, [handleAnalyze]);

  const quickPortfolios = [
    { name: 'Mag 7', symbols: MAG7_SYMBOLS },
    { name: 'Financials', symbols: 'JPM, BAC, GS, MS, V, MA' },
    { name: 'Healthcare', symbols: 'JNJ, UNH, PFE, MRK, ABBV, LLY' },
    { name: 'AI Leaders', symbols: 'NVDA, AMD, MSFT, GOOGL, META' },
  ];

  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex flex-col">
      <div className="sovereign-bar fixed top-0 left-0 right-0 z-50" />

      {/* ── Hero: full-bleed, shows the factor model working ─────────────── */}
      <section
        className="relative isolate overflow-hidden grid-bg"
        aria-label="FrontierAlpha hero"
      >
        <FactorBackdrop />

        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 pt-20 pb-16 sm:pt-28 sm:pb-24">
          <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-10 lg:gap-14 items-center">
            {/* Left: brand + headline + primary CTA */}
            <div className="animate-fade-in-up">
              <div className="flex items-center gap-3 mb-6">
                <img
                  src="/metaventions-logo.png"
                  alt="Metaventions AI"
                  width={40}
                  height={40}
                  className="w-10 h-10 rounded-sm"
                  loading="eager"
                />
                <span className="text-[10px] mono tracking-[0.5em] uppercase text-[var(--color-text-muted)]">
                  Metaventions <span className="text-[var(--color-accent-secondary)]">AI</span>
                </span>
              </div>

              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black leading-[0.95] tracking-tight text-[var(--color-text)]">
                Frontier<span className="text-gradient-brand">Alpha</span>
              </h1>

              <p className="mt-5 text-xl sm:text-2xl text-[var(--color-text-secondary)] max-w-xl leading-snug">
                An 80-factor cognitive model that tells you <em className="not-italic text-[var(--color-text)]">why</em>, not just what.
              </p>

              <p className="mt-3 text-sm text-[var(--color-text-muted)] mono tracking-[0.2em] uppercase">
                Self-improving beliefs · Explainable AI · 140K+ data points
              </p>

              <div className="mt-8 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <button
                  onClick={handleAnalyze}
                  disabled={isAnalyzing}
                  className="px-8 py-3 bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] rounded-sm mono text-[10px] font-black tracking-[0.3em] uppercase transition-all click-feedback disabled:opacity-50 shadow-[0_0_30px_color-mix(in_srgb,var(--color-accent)_30%,transparent)] hover:shadow-[0_0_40px_color-mix(in_srgb,var(--color-accent)_50%,transparent)] hover:scale-[1.02] min-w-[200px]"
                >
                  {isAnalyzing ? 'Analyzing…' : 'Analyze Your Portfolio'}
                </button>
                <button
                  onClick={handleViewDemo}
                  className="px-8 py-3 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)] hover:border-[var(--color-accent-secondary)] hover:text-[var(--color-accent-secondary)] rounded-sm mono text-[10px] font-bold tracking-[0.3em] uppercase transition-all click-feedback min-w-[140px]"
                >
                  Load Mag 7 Demo
                </button>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-[var(--color-text-muted)] mono text-[11px] tracking-[0.2em] uppercase">
                <span className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)]" aria-hidden="true" />
                  80+ Factors
                </span>
                <span className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-positive)]" aria-hidden="true" />
                  Real-Time Risk
                </span>
                <span className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent-secondary)]" aria-hidden="true" />
                  Explainable
                </span>
              </div>
            </div>

            {/* Right: live demo card */}
            <div className="flex justify-center lg:justify-end">
              <TypingTickerDemo />
            </div>
          </div>
        </div>
      </section>

      {/* ── Analyze your portfolio (preserved from v1) ───────────────────── */}
      <section className="relative px-4 py-16 sm:py-20 border-t border-[var(--color-border-light)]">
        <div className="w-full max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-[var(--color-text)]">
              Paste a portfolio. Get the model's read.
            </h2>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              Up to 20 symbols. We score each on 80+ factors and explain the output.
            </p>
          </div>

          <div className="glass-slab rounded-sm p-4 sm:p-6 md:p-8">
            <label htmlFor="ticker-input" className="block text-[10px] mono tracking-[0.4em] uppercase text-[var(--color-text-muted)] mb-3">
              Enter your portfolio tickers
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                id="ticker-input"
                type="text"
                value={tickers}
                onChange={(e) => setTickers(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="NVDA, AAPL, MSFT, GOOGL..."
                className="flex-1 px-4 py-3 bg-[var(--color-bg-tertiary)] border border-[var(--color-border-light)] rounded-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-all mono text-sm"
                disabled={isAnalyzing}
              />
              <button
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                className="px-8 py-3 bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] rounded-sm mono text-[10px] font-black tracking-[0.3em] uppercase transition-all click-feedback disabled:opacity-50 shadow-[0_0_30px_color-mix(in_srgb,var(--color-accent)_30%,transparent)] hover:shadow-[0_0_40px_color-mix(in_srgb,var(--color-accent)_50%,transparent)] hover:scale-[1.02] min-w-[140px]"
              >
                {isAnalyzing ? 'Analyzing' : 'Analyze'}
              </button>
            </div>

            {error && (
              <p className="mt-3 text-[var(--color-danger)] text-sm mono" role="alert">{error}</p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-[9px] text-[var(--color-text-muted)] mono tracking-[0.3em] uppercase">Quick start:</span>
              {quickPortfolios.map((portfolio) => (
                <button
                  key={portfolio.name}
                  onClick={() => setTickers(portfolio.symbols)}
                  className="px-3 py-1 text-[10px] mono tracking-[0.2em] uppercase bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-accent-secondary)] rounded-sm transition-colors border border-[var(--color-border-light)] click-feedback"
                >
                  {portfolio.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Features grid (preserved) ────────────────────────────────────── */}
      <section className="px-4 pb-20 max-w-4xl mx-auto w-full" aria-labelledby="features-heading">
        <h2 id="features-heading" className="sr-only">Platform Features</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          <FeatureCard
            title="80+ Factor Analysis"
            body="Momentum, quality, value, and macro exposures decomposed per-holding."
            tint="var(--color-accent)"
            icon={
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            }
          />
          <FeatureCard
            title="Real-Time Risk"
            body="Live drawdown, volatility, and concentration — updated on every tick."
            tint="var(--color-positive)"
            icon={
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            }
          />
          <FeatureCard
            title="Explainable AI"
            body="Every recommendation ships with the factor trail that produced it."
            tint="var(--color-accent-secondary)"
            icon={
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            }
          />
        </div>
      </section>

      <footer className="mt-auto border-t border-[var(--color-border-light)] py-6 px-4">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-[10px] text-[var(--color-text-muted)] mono tracking-[0.2em] uppercase">
            Powered by <span className="text-[var(--color-accent)]">Metaventions AI</span> — institutional-grade factor models
          </div>
          <nav className="flex gap-6" aria-label="Footer navigation">
            <button
              onClick={() => navigate('/login')}
              className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-accent-secondary)] mono tracking-[0.2em] uppercase transition-colors"
            >
              Sign In
            </button>
            <button
              onClick={() => navigate('/help')}
              className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-accent-secondary)] mono tracking-[0.2em] uppercase transition-colors"
            >
              Documentation
            </button>
            <a
              href="/api/v1/openapi"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-accent-secondary)] mono tracking-[0.2em] uppercase transition-colors"
            >
              API
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ title, body, tint, icon }: { title: string; body: string; tint: string; icon: React.ReactNode }) {
  return (
    <div className="glass-slab rounded-sm p-5 sm:p-6 md:p-8 text-center group hover:-translate-y-1 transition-all duration-500">
      <div
        className="w-12 h-12 mx-auto mb-4 rounded-sm flex items-center justify-center"
        style={{ backgroundColor: `color-mix(in srgb, ${tint} 10%, transparent)` }}
      >
        <svg className="w-6 h-6" fill="none" stroke={tint} viewBox="0 0 24 24" aria-hidden="true">
          {icon}
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-[var(--color-text)] mb-2">{title}</h3>
      <p className="text-sm text-[var(--color-text-muted)]">{body}</p>
    </div>
  );
}

export default Landing;
