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
      className="flex items-center gap-3 px-4 py-2.5 bg-[var(--color-warning)]/10 border-b border-[var(--color-warning)]/20"
    >
      <AlertTriangle className="w-4 h-4 text-[var(--color-warning)] shrink-0" />
      <p className="text-xs sm:text-sm text-[var(--color-warning)] font-medium flex-1">
        Demo Mode — Using simulated data. Connect API keys for live market data.
      </p>
      <button
        onClick={() => setDismissed(true)}
        className="p-1 text-[var(--color-warning)] hover:opacity-70 transition-opacity shrink-0"
        aria-label="Dismiss mock data banner"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
