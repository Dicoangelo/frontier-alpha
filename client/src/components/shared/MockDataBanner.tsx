import { useState, useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';

/**
 * Persistent banner shown when any API response indicates mock/simulated data.
 * Dismissible, but reappears on page navigation if still in mock mode.
 */

// Module-level state so any API call can set mock mode
let _isMockMode = false;
const listeners = new Set<(mock: boolean) => void>();

export function setMockMode(isMock: boolean) {
  _isMockMode = isMock;
  listeners.forEach((fn) => fn(isMock));
}

export function getMockMode(): boolean {
  return _isMockMode;
}

export function MockDataBanner() {
  const [isMock, setIsMock] = useState(_isMockMode);
  const [dismissed, setDismissed] = useState(false);
  const location = useLocation();

  // Subscribe to mock mode changes
  useEffect(() => {
    const handler = (mock: boolean) => setIsMock(mock);
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, []);

  // Reset dismissed state on navigation
  useEffect(() => {
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
