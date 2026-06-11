/**
 * Demo mode (IDEA-FF-6) — one-click shareable demo link.
 *
 * `https://frontier-alpha.metaventionsai.com/dashboard?demo=true` mounts the
 * full app shell without an account. The flag persists in sessionStorage so
 * in-app navigation keeps demo mode for the tab's lifetime; closing the tab
 * ends the demo. A real session always wins over demo mode.
 *
 * In demo mode protected pages render with their (fresh-user-audited) empty
 * states and the public demo fallbacks; a persistent banner explains the
 * state and routes to signup. Pattern from FriendlyFace's RequireAuth.
 */

const KEY = 'frontier-demo-mode';

/**
 * True when this tab is in demo mode. Reading the URL param also latches the
 * flag, so the param only needs to be present on the entry link.
 */
export function detectDemoMode(search: string = window.location.search): boolean {
  try {
    if (new URLSearchParams(search).get('demo') === 'true') {
      sessionStorage.setItem(KEY, 'true');
      return true;
    }
    return sessionStorage.getItem(KEY) === 'true';
  } catch {
    // Sandboxed iframe / privacy mode without sessionStorage: param-only.
    try {
      return new URLSearchParams(search).get('demo') === 'true';
    } catch {
      return false;
    }
  }
}

/** Drop the latch (called when a real session takes over). */
export function clearDemoMode(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // sessionStorage unavailable — nothing latched.
  }
}
