import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Settings, Menu, HelpCircle, Moon, Sun } from 'lucide-react';
import { AlertDropdown } from '@/components/alerts/AlertDropdown';
import { HelpKeyboardHint } from '@/components/help';
import { useThemeStore } from '@/stores/themeStore';
import { api } from '@/api/client';

/** Default index ticker shown in the header quote tile. */
const HEADER_QUOTE_SYMBOL = 'SPY';

interface HeaderQuote {
  symbol: string;
  last: number;
  change: number;
  changePercent: number;
}

/**
 * Live delayed quote for the header tile (default: SPY).
 *
 * Hits the public REST endpoint `GET /api/v1/quotes/:symbol` (Polygon Stocks
 * Starter, delayed) rather than the WebSocket stream, so it works on the
 * Vercel tier where `polygonWebSocket` is degraded by design. The shared axios
 * client unwraps the response to the JSON body, so `response.data` is the
 * endpoint's `data` field.
 */
function useHeaderQuote() {
  return useQuery({
    queryKey: ['header-quote', HEADER_QUOTE_SYMBOL],
    queryFn: () => api.get(`/quotes/${HEADER_QUOTE_SYMBOL}`),
    select: (response): HeaderQuote | null => {
      const data = (response as { data?: HeaderQuote } | undefined)?.data;
      if (!data || typeof data.last !== 'number') return null;
      return data;
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
    // retry inherits the global QueryClient default (1) in production; not
    // overridden here so tests can set retry:false for deterministic error
    // settling without changing prod behavior.
  });
}

const pageTitleMap: Record<string, string> = {
  '/': 'Dashboard',
  '/dashboard': 'Dashboard',
  '/portfolio': 'Portfolio',
  '/trade': 'Trade',
  '/optimize': 'Optimize',
  '/factors': 'Factors',
  '/earnings': 'Earnings',
  '/alerts': 'Alerts',
  '/cvrf': 'CVRF',
  '/ml': 'ML',
  '/options': 'Options',
  '/social': 'Social',
  '/tax': 'Tax',
  '/settings': 'Settings',
  '/help': 'Help',
};

interface HeaderProps {
  onMenuClick?: () => void;
  onHelpClick?: () => void;
}

export function Header({ onMenuClick, onHelpClick }: HeaderProps) {
  const { resolved, toggle } = useThemeStore();
  const location = useLocation();
  const pageTitle = pageTitleMap[location.pathname] || '';
  const { data: quote, isLoading: isQuoteLoading } = useHeaderQuote();
  const quoteUp = quote ? quote.changePercent >= 0 : true;

  return (
    <header className="fixed top-0 left-0 right-0 h-16 glass-slab-floating z-50">
      {/* Sovereign spectrum top bar */}
      <div className="sovereign-bar absolute top-0 left-0 right-0" />

      <div className="flex items-center justify-between h-full px-4 sm:px-6">
        <div className="flex items-center gap-3">
          {/* Mobile menu button */}
          <button
            onClick={onMenuClick}
            className="lg:hidden p-2 -ml-2 text-theme-secondary hover:text-[var(--color-accent-text)] hover:bg-[var(--color-bg-tertiary)] animate-press rounded-sm transition-[color,background-color] duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            aria-label="Toggle navigation"
          >
            <Menu className="w-6 h-6" />
          </button>

          <Link
            to="/"
            className="flex items-center gap-3 animate-press rounded-sm transition-[color] duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          >
            <img
              src="/metaventions-logo.png"
              alt="Metaventions AI"
              width={40}
              height={40}
              loading="eager"
              decoding="async"
              className="w-10 h-10 rounded-sm"
            />
            <div className="hidden sm:flex flex-col leading-tight">
              <h1 className="mono text-base font-bold tracking-[0.18em] uppercase text-theme">
                FRONTIER <span className="text-gradient-brand">ALPHA</span>
              </h1>
              <p className="hidden md:block text-[9px] text-theme-muted mono tracking-[0.4em] uppercase mt-0.5">
                by Metaventions AI
              </p>
            </div>
          </Link>

          {/* Page title kicker (desktop) */}
          {pageTitle && (
            <div className="hidden lg:flex items-center gap-2 ml-2 pl-4 border-l border-theme">
              <span
                className="w-1 h-1 rounded-full bg-[var(--color-accent)]"
                aria-hidden="true"
              />
              <span className="mono text-[10px] sm:text-xs tracking-[0.3em] uppercase text-theme-muted holo-pulse">
                {pageTitle}
              </span>
            </div>
          )}

          {/* Mobile page title */}
          {pageTitle && (
            <span className="lg:hidden mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">
              {pageTitle}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Live delayed index quote (default SPY) */}
          {!(quote == null && !isQuoteLoading) && (
            <div
              className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-full glass-slab min-w-[150px]"
              role="status"
              aria-label={
                quote
                  ? `${quote.symbol} ${quote.last.toFixed(2)}, ${quote.changePercent >= 0 ? 'up' : 'down'} ${Math.abs(quote.changePercent).toFixed(2)} percent`
                  : `Loading ${HEADER_QUOTE_SYMBOL} quote`
              }
            >
              <span className="text-[9px] text-theme-muted mono tracking-[0.3em] uppercase">
                {HEADER_QUOTE_SYMBOL}
              </span>
              {quote ? (
                <>
                  <span className="text-xs font-semibold text-theme tabular-nums">
                    {quote.last.toFixed(2)}
                  </span>
                  <span
                    className="text-[10px] font-medium tabular-nums"
                    style={{
                      color: quoteUp
                        ? 'var(--color-positive)'
                        : 'var(--color-negative)',
                    }}
                  >
                    {quoteUp ? '+' : ''}
                    {quote.changePercent.toFixed(2)}%
                  </span>
                </>
              ) : (
                <span className="text-xs text-theme-muted tabular-nums">Loading</span>
              )}
            </div>
          )}

          <div
            className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-full glass-slab"
            role="status"
            aria-label="Live connection active"
          >
            <div
              className="w-1.5 h-1.5 bg-[var(--color-brand-teal)] rounded-full animate-pulse-green shadow-[0_0_8px_var(--color-brand-teal)]"
              aria-hidden="true"
            />
            {/* Text uses --color-live, not the brand teal: #00FFC6 renders at
                1.30:1 on a light card. The dot above keeps the brand teal —
                it is decorative, so the contrast floor does not apply. */}
            <span
              className="text-[9px] text-[var(--color-live)] mono tracking-[0.4em] uppercase"
              aria-hidden="true"
            >
              Live
            </span>
          </div>

          <AlertDropdown />

          {/* Dark mode toggle */}
          <button
            onClick={toggle}
            className="p-2 text-theme-secondary hover:text-[var(--color-accent-text)] hover:bg-[var(--color-bg-tertiary)] animate-press rounded-sm transition-[color,background-color] duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            aria-label={`Switch to ${resolved === 'dark' ? 'light' : 'dark'} mode`}
            title={`${resolved === 'dark' ? 'Light' : 'Dark'} mode`}
          >
            {resolved === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          {/* Help button with keyboard hint */}
          <HelpKeyboardHint />
          <button
            onClick={onHelpClick}
            className="p-2 text-theme-secondary hover:text-[var(--color-accent-text)] hover:bg-[var(--color-bg-tertiary)] animate-press rounded-sm transition-[color,background-color] duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            aria-label="Open help (press ? key)"
            title="Help (press ?)"
          >
            <HelpCircle className="w-5 h-5" />
          </button>

          {/* Settings */}
          <Link
            to="/settings"
            className="hidden lg:flex p-2 text-theme-secondary hover:text-[var(--color-accent-text)] hover:bg-[var(--color-bg-tertiary)] animate-press rounded-sm transition-[color,background-color] duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            aria-label="Settings"
          >
            <Settings className="w-5 h-5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </header>
  );
}
