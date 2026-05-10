/**
 * Phase D smoke walkthrough — "did anything throw" regression net.
 *
 * For each primary page: navigate → wait for ready anchor → assert no
 * console.error fired during load → assert no network 5xx returned during
 * load. NOT visual regression (sibling tokens.spec.ts handles that).
 *
 * The point: today's session shipped 14+ fixes that were only caught
 * because the user clicked them. The walkthrough catches the same class
 * of bug automatically on a nightly schedule, so the next breakage shows
 * up as a CI failure instead of a user complaint.
 *
 * Constraints:
 *   - Total runtime < 10 min (per MASTERPLAN Phase D acceptance criteria)
 *   - Reuses the seeded golden-state user `dicoangelo+test@metaventionsai.com`
 *   - Reuses the same auth-injection pattern as tokens.spec.ts
 *   - Single chromium pass (no per-theme split — this is functional, not visual)
 *
 * Acceptable noise (not failures):
 *   - 401/404 from public-page-only routes when fetched after auth (cleared
 *     by route guards)
 *   - 502 from Polygon-rate-limited /quotes/SYMBOL/history?days=7 (documented
 *     in ROADMAP.md as the Polygon Starter upgrade trigger)
 *   - Console warnings (we only fail on errors)
 */
import { test, expect, type Page, type ConsoleMessage, type Response } from '@playwright/test';
import { mintTestSession } from './auth-helper';

interface PageSpec {
  name: string;
  path: string;
  requiresAuth: boolean;
  /** Selector that proves the page mounted (same anchors tokens.spec.ts uses). */
  waitFor: string;
  /** Optional settle delay after waitFor — for charts/lists that hydrate later. */
  settleMs?: number;
}

const PAGES: ReadonlyArray<PageSpec> = [
  // Public
  { name: 'landing', path: '/landing', requiresAuth: false, waitFor: '[data-testid="visual-landing-ready"]' },
  { name: 'pricing', path: '/pricing', requiresAuth: false, waitFor: 'h1', settleMs: 200 },

  // Authenticated — primary
  { name: 'dashboard', path: '/dashboard', requiresAuth: true, waitFor: '[data-testid="visual-dashboard-ready"]', settleMs: 800 },
  { name: 'portfolio', path: '/portfolio', requiresAuth: true, waitFor: '[data-testid="visual-portfolio-ready"]', settleMs: 800 },
  { name: 'trading', path: '/trade', requiresAuth: true, waitFor: '[data-testid="visual-trading-ready"]' },
  { name: 'optimize', path: '/optimize', requiresAuth: true, waitFor: 'h1', settleMs: 400 },
  { name: 'options', path: '/options', requiresAuth: true, waitFor: '[data-testid="visual-options-ready"]' },

  // Authenticated — intelligence + governance
  { name: 'cvrf', path: '/cvrf', requiresAuth: true, waitFor: '[data-testid="visual-cvrf-ready"]' },
  { name: 'factors', path: '/factors', requiresAuth: true, waitFor: '[data-testid="visual-factors-ready"]' },
  { name: 'earnings', path: '/earnings', requiresAuth: true, waitFor: '[data-testid="visual-earnings-ready"]' },
  { name: 'backtest', path: '/backtest', requiresAuth: true, waitFor: 'h1', settleMs: 200 },
  { name: 'ml', path: '/ml', requiresAuth: true, waitFor: 'h1', settleMs: 200 },
  { name: 'alerts', path: '/alerts', requiresAuth: true, waitFor: '[data-testid="visual-alerts-ready"]' },
  { name: 'tax', path: '/tax', requiresAuth: true, waitFor: 'h1', settleMs: 200 },

  // Authenticated — account
  { name: 'settings', path: '/settings', requiresAuth: true, waitFor: 'h1', settleMs: 200 },
  { name: 'help', path: '/help', requiresAuth: true, waitFor: 'h1' },
];

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
const SUPABASE_PROJECT_REF = (() => {
  const match = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/);
  return match ? match[1] : '';
})();
const SUPABASE_AUTH_KEY = SUPABASE_PROJECT_REF ? `sb-${SUPABASE_PROJECT_REF}-auth-token` : '';

async function injectSession(page: Page, session: Awaited<ReturnType<typeof mintTestSession>>): Promise<void> {
  if (!SUPABASE_AUTH_KEY) {
    throw new Error('[walkthrough] VITE_SUPABASE_URL not set, cannot derive auth-token key');
  }
  await page.goto('/');
  await page.evaluate(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    {
      key: SUPABASE_AUTH_KEY,
      value: JSON.stringify({
        access_token: session.accessToken,
        refresh_token: session.refreshToken,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        expires_in: 3600,
        token_type: 'bearer',
        user: {
          id: session.userId,
          email: session.email,
          aud: 'authenticated',
          role: 'authenticated',
        },
      }),
    },
  );
}

let cachedSession: Awaited<ReturnType<typeof mintTestSession>> | null = null;
async function getSession() {
  if (!cachedSession) cachedSession = await mintTestSession();
  return cachedSession;
}

/**
 * Routes whose 5xx is ACCEPTABLE noise (won't fail the test). Documented in
 * ROADMAP.md as the Polygon Starter upgrade trigger — these routes 502 on
 * Vercel egress IPs because of free-tier IP throttling. The pages handle
 * the failure gracefully (sparkline shows blank, factor card shows degraded).
 */
const ACCEPTABLE_5XX_PATHS = [
  /\/api\/v1\/quotes\/[^/]+\/history/,        // sparkline 7-day quotes
  /\/api\/v1\/portfolio\/factors\/history/,    // FactorDeltas Strategy 1 endpoint
];

function isAcceptable5xx(url: string): boolean {
  return ACCEPTABLE_5XX_PATHS.some((re) => re.test(url));
}

for (const spec of PAGES) {
  test(`walkthrough: ${spec.name} mounts without errors`, async ({ page }) => {
    const consoleErrors: string[] = [];
    const networkErrors: string[] = [];

    page.on('console', (msg: ConsoleMessage) => {
      if (msg.type() === 'error') {
        // React's "act(...)" warnings + dev-mode hydration mismatches surface
        // as errors but rarely indicate a real production bug. We capture
        // the text and let the test author triage; for now we fail on any
        // error so regressions are loud.
        consoleErrors.push(msg.text());
      }
    });

    page.on('response', (resp: Response) => {
      const status = resp.status();
      const url = resp.url();
      if (status >= 500 && !isAcceptable5xx(url)) {
        networkErrors.push(`${status} ${url}`);
      }
    });

    if (spec.requiresAuth) {
      const session = await getSession();
      await injectSession(page, session);
    }

    await page.goto(spec.path, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(spec.waitFor, { state: 'visible', timeout: 30_000 });
    if (spec.settleMs) {
      await page.waitForTimeout(spec.settleMs);
    }

    // Network idle is a proxy for "all on-mount fetches resolved one way or
    // the other." A 30s budget is conservative — most pages settle in <5s.
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {
      // Some pages (Trading, Earnings) hold an SSE/WebSocket open which
      // never satisfies networkidle. Don't fail the test for that.
    });

    // Assert no console errors fired during the page lifecycle.
    expect(
      consoleErrors,
      `console errors on ${spec.name}:\n${consoleErrors.map((e) => `  - ${e}`).join('\n')}`,
    ).toEqual([]);

    // Assert no unexpected 5xx responses during the page lifecycle.
    expect(
      networkErrors,
      `unexpected 5xx on ${spec.name}:\n${networkErrors.map((e) => `  - ${e}`).join('\n')}`,
    ).toEqual([]);
  });
}
