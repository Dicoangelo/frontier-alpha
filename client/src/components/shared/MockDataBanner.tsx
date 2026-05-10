import { useState, useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useDataSourceStore } from '@/stores/dataSourceStore';

/**
 * Persistent banner shown when any API response indicates mock/simulated data.
 * Dismissible, but reappears on page navigation if still in mock mode.
 * State is driven by dataSourceStore (Zustand); the module-level helpers
 * remain for backward compatibility with the API interceptor bridge.
 *
 * Page-scoped variant (US-007): pages that render hardcoded demo / placeholder
 * data can pass `force` + `pageKey` to render the banner unconditionally with
 * a per-page localStorage dismissal.
 */

// Module-level state so any API call can set mock mode (legacy bridge)
let _isMockMode = false;
const listeners = new Set<(mock: boolean) => void>();

// eslint-disable-next-line react-refresh/only-export-components
export function setMockMode(isMock: boolean) {
  _isMockMode = isMock;
  listeners.forEach((fn) => fn(isMock));
}

// eslint-disable-next-line react-refresh/only-export-components
export function getMockMode(): boolean {
  return _isMockMode;
}

const DISMISS_PREFIX = 'frontier:mock-banner-dismissed:';

function readDismissed(pageKey: string | undefined): boolean {
  if (!pageKey) return false;
  try {
    return localStorage.getItem(`${DISMISS_PREFIX}${pageKey}`) === '1';
  } catch {
    return false;
  }
}

function writeDismissed(pageKey: string | undefined) {
  if (!pageKey) return;
  try {
    localStorage.setItem(`${DISMISS_PREFIX}${pageKey}`, '1');
  } catch {
    /* localStorage unavailable (Safari private mode etc.) — silently no-op */
  }
}

export interface MockDataBannerProps {
  /**
   * When true, render the banner unconditionally (page is showing demo /
   * placeholder data even though the API client hasn't flagged mock mode).
   * Pair with `pageKey` for per-page dismissal.
   */
  force?: boolean;
  /**
   * Stable identifier for the page surface (e.g. `tax`, `ml`, `alerts`).
   * Required when `force` is true so the dismissal can be persisted
   * separately for each page in localStorage.
   */
  pageKey?: string;
  /**
   * Allow dismissing the banner. Defaults to true for backward compatibility.
   * When `pageKey` is provided, dismissal persists in localStorage.
   */
  dismissible?: boolean;
  /**
   * Override banner copy. Defaults to "Showing demo data — connect a portfolio
   * to see your numbers." when in `force` mode, or the original simulated-data
   * messaging when reacting to the data-source store.
   */
  message?: string;
}

const DEFAULT_FORCE_MESSAGE =
  'Showing demo data. Connect a portfolio to see your numbers.';

export function MockDataBanner({
  force = false,
  pageKey,
  dismissible = true,
  message,
}: MockDataBannerProps = {}) {
  const isUsingMockData = useDataSourceStore((s) => s.isUsingMockData);
  // Also subscribe to legacy module-level state so callers using setMockMode()
  // directly (e.g. tests / non-axios paths) still work.
  const [legacyMock, setLegacyMock] = useState(_isMockMode);
  const [dismissed, setDismissed] = useState(() => readDismissed(pageKey));
  const location = useLocation();

  const shouldShow = force || isUsingMockData || legacyMock;

  // Subscribe to legacy mock mode changes
  useEffect(() => {
    const handler = (mock: boolean) => setLegacyMock(mock);
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, []);

  // Reset dismissed state on navigation. For page-scoped (`force` + `pageKey`)
  // banners we keep the localStorage flag instead so the user's choice persists.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset on navigation
    if (force && pageKey) {
      setDismissed(readDismissed(pageKey));
      return;
    }
    if (shouldShow) setDismissed(false);
  }, [location.pathname, shouldShow, force, pageKey]);

  function handleDismiss() {
    setDismissed(true);
    if (force && pageKey) writeDismissed(pageKey);
  }

  if (!shouldShow || dismissed) return null;

  const copy = message ?? (force
    ? DEFAULT_FORCE_MESSAGE
    : 'Demo Mode · Simulated Data · Connect API Keys for Live Market Data');

  return (
    <div
      role="alert"
      className="glass-slab-floating relative overflow-hidden rounded-none border-y border-theme pl-5 pr-4 py-2 flex items-center justify-center gap-3 before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-[var(--color-warning)] shadow-[0_2px_20px_-5px_rgba(245,158,11,0.3)]"
    >
      <AlertTriangle className="w-3.5 h-3.5 text-[var(--color-warning)] shrink-0" aria-hidden="true" />
      <p className="mono text-[10px] sm:text-xs tracking-[0.25em] uppercase text-[var(--color-warning)] font-medium">
        {copy}
      </p>
      {dismissible && (
        <button
          onClick={handleDismiss}
          className="p-1 text-[var(--color-warning)] hover:bg-[var(--color-bg-tertiary)] hover:opacity-80 animate-press rounded-sm transition-[opacity,background-color] duration-200 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-warning)]"
          aria-label="Dismiss mock data banner"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
