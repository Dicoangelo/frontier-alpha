import { useState, useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useDataSourceStore } from '@/stores/dataSourceStore';

/**
 * Persistent banner shown when any API response indicates mock/simulated data.
 * Dismissible, but reappears on page navigation if still in mock mode.
 * State is driven by dataSourceStore (Zustand); the module-level helpers
 * remain for backward compatibility with the API interceptor bridge.
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

export function MockDataBanner() {
  const isUsingMockData = useDataSourceStore((s) => s.isUsingMockData);
  // Also subscribe to legacy module-level state so callers using setMockMode()
  // directly (e.g. tests / non-axios paths) still work.
  const [legacyMock, setLegacyMock] = useState(_isMockMode);
  const [dismissed, setDismissed] = useState(false);
  const location = useLocation();

  const isMock = isUsingMockData || legacyMock;

  // Subscribe to legacy mock mode changes
  useEffect(() => {
    const handler = (mock: boolean) => setLegacyMock(mock);
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, []);

  // Reset dismissed state on navigation
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset on navigation
    if (isMock) setDismissed(false);
  }, [location.pathname, isMock]);

  if (!isMock || dismissed) return null;

  return (
    <div
      role="alert"
      className="glass-slab-floating relative overflow-hidden rounded-none border-y border-theme pl-5 pr-4 py-2 flex items-center justify-center gap-3 before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-[var(--color-warning)] shadow-[0_2px_20px_-5px_rgba(245,158,11,0.3)]"
    >
      <AlertTriangle className="w-3.5 h-3.5 text-[var(--color-warning)] shrink-0" aria-hidden="true" />
      <p className="mono text-[10px] sm:text-xs tracking-[0.25em] uppercase text-[var(--color-warning)] font-medium">
        Demo Mode <span className="opacity-60">·</span> Simulated Data <span className="opacity-60">·</span> Connect API Keys for Live Market Data
      </p>
      <button
        onClick={() => setDismissed(true)}
        className="p-1 text-[var(--color-warning)] hover:bg-[var(--color-bg-tertiary)] hover:opacity-80 animate-press rounded-sm transition-[opacity,background-color] duration-200 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-warning)]"
        aria-label="Dismiss mock data banner"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
