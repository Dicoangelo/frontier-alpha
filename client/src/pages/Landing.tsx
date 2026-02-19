import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

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

    // Store symbols for the dashboard
    localStorage.setItem('analyze_symbols', JSON.stringify(symbols));

    // Navigate to dashboard
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
    <div className="min-h-screen bg-[var(--color-bg)] flex flex-col grid-bg">
      {/* Sovereign spectrum top bar */}
      <div className="sovereign-bar fixed top-0 left-0 right-0 z-50" />

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16 relative">
        {/* Backdrop gradient overlay — ensures WCAG AA contrast for hero text */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 80% 60% at 50% 30%, rgba(123,44,255,0.12) 0%, transparent 60%), radial-gradient(ellipse 60% 50% at 30% 70%, rgba(24,230,255,0.06) 0%, transparent 60%)',
          }}
          aria-hidden="true"
        />

        {/* Logo/Brand */}
        <div className="mb-8 text-center relative z-10 animate-fade-in-up">
          <div className="flex items-center justify-center gap-4 mb-6">
            <img src="/metaventions-logo.png" alt="Metaventions AI" className="w-16 h-16 rounded-sm" />
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-7xl lg:text-8xl font-black text-[var(--color-text)] mb-4 leading-[0.9] tracking-tight">
            Frontier<span className="text-gradient-brand">Alpha</span>
          </h1>
          <p className="text-[10px] text-[var(--color-text-muted)] mt-2 mono tracking-[0.5em] uppercase">
            Architected Intelligence by Metaventions AI
          </p>

          {/* Hero headline */}
          <div className="mt-8 mb-2">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gradient-brand leading-tight">
              AI-Powered Portfolio Intelligence
            </h2>
            <p className="text-base sm:text-lg text-[var(--color-text-secondary)] mt-3 max-w-xl mx-auto">
              80+ factors. Self-improving beliefs. Explainable AI.
            </p>
          </div>

          {/* Hero CTAs */}
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={handleAnalyze}
              disabled={isAnalyzing}
              className="px-8 py-3 bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] rounded-sm mono text-[10px] font-black tracking-[0.3em] uppercase transition-all disabled:opacity-50 shadow-[0_0_30px_rgba(123,44,255,0.3)] hover:shadow-[0_0_40px_rgba(123,44,255,0.5)] hover:scale-[1.02] min-w-[200px]"
            >
              {isAnalyzing ? (
                <>
                  <svg className="animate-spin h-4 w-4 inline mr-2" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Analyzing...
                </>
              ) : (
                'Analyze Your Portfolio'
              )}
            </button>
            <button
              onClick={handleViewDemo}
              className="px-8 py-3 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)] hover:border-[var(--color-accent-secondary)] hover:text-[var(--color-accent-secondary)] rounded-sm mono text-[10px] font-bold tracking-[0.3em] uppercase transition-all min-w-[140px]"
            >
              View Demo
            </button>
          </div>
        </div>

        {/* Ticker Input */}
        <div className="w-full max-w-2xl mx-auto relative z-10 animate-fade-in-up" style={{ animationDelay: '150ms' }}>
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
                className="px-8 py-3 bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] rounded-sm mono text-[10px] font-black tracking-[0.3em] uppercase transition-all click-feedback disabled:opacity-50 shadow-[0_0_30px_rgba(123,44,255,0.3)] hover:shadow-[0_0_40px_rgba(123,44,255,0.5)] hover:scale-[1.02] min-w-[140px]"
              >
                {isAnalyzing ? (
                  <>
                    <svg className="animate-spin h-4 w-4 inline mr-2" viewBox="0 0 24 24" aria-hidden="true">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Analyzing
                  </>
                ) : (
                  'Analyze'
                )}
              </button>
            </div>

            {error && (
              <p className="mt-3 text-[var(--color-danger)] text-sm mono" role="alert">{error}</p>
            )}

            {/* Quick Portfolios */}
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

        {/* Social Proof */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4 sm:gap-8 text-[var(--color-text-muted)] mono text-xs sm:text-sm tracking-wide relative z-10">
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[var(--color-accent)]" aria-hidden="true" />
            80+ Factors
          </span>
          <span className="hidden sm:inline text-[var(--color-border)]" aria-hidden="true">|</span>
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[var(--color-positive)]" aria-hidden="true" />
            140K+ Data Points
          </span>
          <span className="hidden sm:inline text-[var(--color-border)]" aria-hidden="true">|</span>
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[var(--color-accent-secondary)]" aria-hidden="true" />
            Powered by Metaventions AI
          </span>
        </div>

        {/* Features Grid */}
        <section className="mt-16 max-w-4xl mx-auto px-4 relative z-10" aria-labelledby="features-heading">
          <h2 id="features-heading" className="sr-only">Platform Features</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
            <div className="glass-slab rounded-sm p-5 sm:p-6 md:p-8 text-center group hover:-translate-y-1 transition-all duration-500">
              <div className="w-12 h-12 mx-auto mb-4 rounded-sm flex items-center justify-center" style={{ backgroundColor: 'rgba(123,44,255,0.1)' }}>
                <svg className="w-6 h-6 text-[var(--color-accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-[var(--color-text)] mb-2">80+ Factor Analysis</h3>
              <p className="text-sm text-[var(--color-text-muted)]">
                Deep factor decomposition including momentum, quality, value, and macro exposures
              </p>
            </div>

            <div className="glass-slab rounded-sm p-5 sm:p-6 md:p-8 text-center group hover:-translate-y-1 transition-all duration-500">
              <div className="w-12 h-12 mx-auto mb-4 rounded-sm flex items-center justify-center" style={{ backgroundColor: 'rgba(0,255,198,0.1)' }}>
                <svg className="w-6 h-6 text-[#00FFC6]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-[var(--color-text)] mb-2">Real-Time Risk</h3>
              <p className="text-sm text-[var(--color-text-muted)]">
                Live portfolio monitoring with drawdown, volatility, and concentration alerts
              </p>
            </div>

            <div className="glass-slab rounded-sm p-5 sm:p-6 md:p-8 text-center group hover:-translate-y-1 transition-all duration-500">
              <div className="w-12 h-12 mx-auto mb-4 rounded-sm flex items-center justify-center" style={{ backgroundColor: 'rgba(24,230,255,0.1)' }}>
                <svg className="w-6 h-6 text-[var(--color-accent-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-[var(--color-text)] mb-2">AI Explanations</h3>
              <p className="text-sm text-[var(--color-text-muted)]">
                Plain-English insights that explain the "why" behind every recommendation
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--color-border-light)] py-6 px-4">
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

export default Landing;
