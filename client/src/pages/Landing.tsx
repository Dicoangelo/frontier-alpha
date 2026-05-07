import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { HeroEnhanced } from '@/components/landing/HeroEnhanced';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { TrustComparison } from '@/components/landing/TrustComparison';
import { DemoPreview } from '@/components/landing/DemoPreview';

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
    { name: 'AI Leaders', symbols: 'NVDA, AMD, MSFT, GOOGL, META' },
  ];

  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex flex-col">
      <div className="sovereign-bar fixed top-0 left-0 right-0 z-50" />

      {/* ── Top auth strip — Sign In + Sign Up always visible ─────────────── */}
      <div className="absolute top-0 left-0 right-0 z-40 pt-1.5 px-4 sm:px-6 flex justify-end items-center gap-3">
        <button
          onClick={handleSignin}
          className="mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-text-muted)] hover:text-[var(--color-text)] px-3 py-2 transition-colors animate-press"
        >
          Sign In
        </button>
        <button
          onClick={handleSignup}
          className="px-4 py-2 bg-[image:var(--gradient-sovereign)] text-white rounded-sm mono text-[10px] font-black tracking-[0.3em] uppercase animate-press animate-lift shadow-[0_4px_20px_rgba(123,44,255,0.3)] hover:brightness-110"
        >
          Sign Up Free
        </button>
      </div>

      <HeroEnhanced
        onAnalyze={handleAnalyze}
        onLoadDemo={handleViewDemo}
        isAnalyzing={isAnalyzing}
      />

      {demoSymbols && (
        <div ref={demoRef}>
          <DemoPreview
            symbols={demoSymbols}
            onSignup={handleSignup}
            onSignin={handleSignin}
            onClear={handleClearDemo}
          />
        </div>
      )}

      {/* ── Analyze your portfolio (preserved from v1) ───────────────────── */}
      <section className="relative px-4 sm:px-6 py-16 sm:py-20 border-t border-[var(--color-border-light)]">
        <div className="w-full max-w-6xl mx-auto">
         <div className="max-w-2xl mx-auto">
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
                className="flex-1 px-4 py-3 bg-[var(--color-bg-tertiary)] border border-[var(--color-border-light)] rounded-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-[border-color,box-shadow] duration-200 mono text-sm"
                disabled={isAnalyzing}
              />
              <button
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                className="px-8 py-3 bg-[image:var(--gradient-sovereign)] text-white rounded-sm mono text-[10px] font-black tracking-[0.3em] uppercase animate-press animate-lift disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none shadow-[0_4px_30px_rgba(123,44,255,0.35)] hover:shadow-[0_6px_40px_rgba(123,44,255,0.5)] hover:brightness-110 min-w-[140px]"
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
                  onClick={() => {
                    setTickers(portfolio.symbols);
                    runDemo(portfolio.symbols);
                  }}
                  className="px-3 py-1 text-[10px] mono tracking-[0.2em] uppercase bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-accent-secondary)] rounded-sm transition-colors border border-[var(--color-border-light)] animate-press"
                >
                  {portfolio.name}
                </button>
              ))}
            </div>
          </div>
         </div>
        </div>
      </section>

      <HowItWorks onCTAClick={handleAnalyze} />

      <TrustComparison />

      <footer className="mt-auto border-t border-[var(--color-border-light)] py-6 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
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
