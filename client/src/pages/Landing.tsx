import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

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

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAnalyze();
    }
  }, [handleAnalyze]);

  const quickPortfolios = [
    { name: 'Mag 7', symbols: 'AAPL, MSFT, GOOGL, AMZN, NVDA, META, TSLA' },
    { name: 'Financials', symbols: 'JPM, BAC, GS, MS, V, MA' },
    { name: 'Healthcare', symbols: 'JNJ, UNH, PFE, MRK, ABBV, LLY' },
    { name: 'AI Leaders', symbols: 'NVDA, AMD, MSFT, GOOGL, META' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col">
      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16">
        {/* Logo/Brand */}
        <div className="mb-8 text-center">
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-4 tracking-tight">
            Frontier<span className="text-blue-400">Alpha</span>
          </h1>
          <p className="text-xl md:text-2xl text-slate-300 max-w-2xl mx-auto">
            Institutional Intelligence. Human Understanding.
          </p>
          <p className="text-lg text-slate-400 mt-2 max-w-xl mx-auto">
            See what the quants see. Understand what they won't explain.
          </p>
        </div>

        {/* Ticker Input */}
        <div className="w-full max-w-2xl mx-auto">
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl p-6 shadow-2xl">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Enter your portfolio tickers
            </label>
            <div className="flex gap-3">
              <input
                type="text"
                value={tickers}
                onChange={(e) => setTickers(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="NVDA, AAPL, MSFT, GOOGL..."
                className="flex-1 px-4 py-3 bg-slate-900 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
                disabled={isAnalyzing}
              />
              <button
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                className="px-8 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white font-semibold rounded-xl transition-colors duration-200 flex items-center gap-2 shadow-lg shadow-blue-500/25"
              >
                {isAnalyzing ? (
                  <>
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Analyzing...
                  </>
                ) : (
                  <>
                    Analyze
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </>
                )}
              </button>
            </div>

            {error && (
              <p className="mt-3 text-red-400 text-sm">{error}</p>
            )}

            {/* Quick Portfolios */}
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="text-xs text-slate-500">Quick start:</span>
              {quickPortfolios.map((portfolio) => (
                <button
                  key={portfolio.name}
                  onClick={() => setTickers(portfolio.symbols)}
                  className="px-3 py-1 text-xs bg-slate-700/50 hover:bg-slate-700 text-slate-300 rounded-full transition-colors"
                >
                  {portfolio.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Features Grid */}
        <section className="mt-16 max-w-4xl mx-auto px-4" aria-labelledby="features-heading">
          <h2 id="features-heading" className="sr-only">Platform Features</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-6 text-center">
            <div className="w-12 h-12 mx-auto mb-4 bg-blue-500/10 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">80+ Factor Analysis</h3>
            <p className="text-sm text-slate-400">
              Deep factor decomposition including momentum, quality, value, and macro exposures
            </p>
          </div>

          <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-6 text-center">
            <div className="w-12 h-12 mx-auto mb-4 bg-green-500/10 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Real-Time Risk</h3>
            <p className="text-sm text-slate-400">
              Live portfolio monitoring with drawdown, volatility, and concentration alerts
            </p>
          </div>

          <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-6 text-center">
            <div className="w-12 h-12 mx-auto mb-4 bg-purple-500/10 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">AI Explanations</h3>
            <p className="text-sm text-slate-400">
              Plain-English insights that explain the "why" behind every recommendation
            </p>
          </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-6 px-4">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-sm text-slate-500">
            Powered by institutional-grade factor models and real-time market data
          </div>
          <div className="flex gap-6 text-sm">
            <button
              onClick={() => navigate('/login')}
              className="text-slate-400 hover:text-white transition-colors"
            >
              Sign In
            </button>
            <a href="#" className="text-slate-400 hover:text-white transition-colors">
              Documentation
            </a>
            <a href="#" className="text-slate-400 hover:text-white transition-colors">
              API
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
