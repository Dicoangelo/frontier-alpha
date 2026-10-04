import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Settings, Menu, HelpCircle, Moon, Sun, Search, PanelRight } from 'lucide-react';
import { BrandLogo } from '@/components/shared/BrandLogo';
import { AlertDropdown } from '@/components/alerts/AlertDropdown';
import { useThemeStore } from '@/stores/themeStore';
import { useFeedStatus } from '@/hooks/useFeedStatus';
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
  '/backtest': 'Backtest',
  '/insights': 'Insights',
  '/social': 'Social',
  '/tax': 'Tax',
  '/settings': 'Settings',
  '/help': 'Help',
};

interface HeaderProps {
  onMenuClick?: () => void;
  onHelpClick?: () => void;
  sidebarOpen?: boolean;
  onSearchClick?: () => void;
  onContextClick?: () => void;
  contextOpen?: boolean;
}

export function Header({ onMenuClick, onHelpClick, onSearchClick, onContextClick, contextOpen, sidebarOpen = false }: HeaderProps) {
  const { resolved, toggle } = useThemeStore();
  const location = useLocation();
  const pageTitle = pageTitleMap[location.pathname] || '';
  const { data: quote, isLoading: isQuoteLoading } = useHeaderQuote();
  const quoteUp = quote ? quote.changePercent >= 0 : true;
  const feed = useFeedStatus();
  const feedColor = feed.tone === 'live' ? 'var(--color-live)'
    : feed.tone === 'delayed' ? 'var(--color-warning)' : 'var(--color-text-muted)';

  return (
    <header className="workspace-header">
      <div className="workspace-header-start">
        <button type="button" onClick={onMenuClick} className="workspace-icon-button workspace-menu-button" aria-label="Toggle navigation" aria-expanded={sidebarOpen} aria-haspopup="dialog">
          <Menu size={21} />
        </button>
        <Link to="/" className="workspace-brand" aria-label="Frontier Alpha home">
          <BrandLogo decorative />
          <span className="workspace-brand-copy"><strong>Frontier Alpha</strong><span>Investment workspace</span></span>
        </Link>
        {pageTitle && <span className="workspace-current-page">{pageTitle}</span>}
      </div>
      <button type="button" className="workspace-search" onClick={onSearchClick} aria-label="Search pages and commands" aria-haspopup="dialog">
        <Search size={15} aria-hidden="true" /><span>Search workspace</span><kbd>⌘ K</kbd>
      </button>
      <div className="workspace-header-actions">
        {!(quote == null && !isQuoteLoading) && (
          <div
            className="workspace-header-quote"
            role="status"
            aria-label={quote
              ? `${quote.symbol} ${quote.last.toFixed(2)}, ${quote.changePercent >= 0 ? 'up' : 'down'} ${Math.abs(quote.changePercent).toFixed(2)} percent`
              : `Loading ${HEADER_QUOTE_SYMBOL} quote`}
          >
            <span className="workspace-quote-symbol">{HEADER_QUOTE_SYMBOL}</span>
            {quote ? (
              <>
                <span className="font-semibold tabular-nums">{quote.last.toFixed(2)}</span>
                <span className="tabular-nums" style={{ color: quoteUp ? 'var(--color-positive)' : 'var(--color-negative)' }}>
                  {quoteUp ? '+' : ''}{quote.changePercent.toFixed(2)}%
                </span>
              </>
            ) : <span className="text-theme-muted">Loading</span>}
          </div>
        )}
        <div className="workspace-feed-status" role="status" aria-label={feed.aria} title={feed.aria} style={{ color: feedColor }}>
          <span className="workspace-status-dot" style={{ background: feedColor }} aria-hidden="true" />
          <span aria-hidden="true">{feed.label}</span>
        </div>
        <button type="button" className="workspace-icon-button" aria-label="Toggle portfolio pulse" title="Portfolio pulse" aria-expanded={contextOpen} onClick={onContextClick}><PanelRight size={18} /></button>
        <AlertDropdown />
        <button type="button" onClick={toggle} className="workspace-icon-button" aria-label={`Switch to ${resolved === 'dark' ? 'light' : 'dark'} mode`} title={`${resolved === 'dark' ? 'Light' : 'Dark'} mode`}>
          {resolved === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
        </button>
        <button type="button" onClick={onHelpClick} className="workspace-icon-button workspace-help-button" aria-label="Open help (press H key)" title="Help (press H)">
          <HelpCircle size={19} />
        </button>
        <Link to="/settings" className="workspace-icon-button workspace-settings-button" aria-label="Settings"><Settings size={19} aria-hidden="true" /></Link>
      </div>
    </header>
  );
}
