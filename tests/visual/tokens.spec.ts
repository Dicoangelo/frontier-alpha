/**
 * TOKEN-007 — visual regression for the token migration.
 *
 * For each primary page (Landing, Dashboard, Portfolio, Trading, Options,
 * CVRF, Earnings, Factors, Alerts) capture a full-page screenshot in both
 * light and dark themes at 1440x900 and diff against the committed baseline.
 *
 * Protected pages reuse `mintTestSession()` from the integration auth helper
 * so the screenshots show the seeded golden-state user (5 holdings, 2 realized
 * lots, 3 alerts, enterprise comp plan). No mock-data screenshots — every
 * authenticated frame must render real fixture data.
 *
 * Theme toggle: the app's `themeStore` flips `<html class="dark">` / removes
 * it for light. We set `localStorage["frontier-theme"]` (the persist key) to
 * the desired theme BEFORE navigation so Zustand's `onRehydrateStorage`
 * applies the class on first paint, no FOUC, no toggle race.
 */
import { test, expect, type Page } from '@playwright/test';
import { mintTestSession } from './auth-helper';

type Theme = 'light' | 'dark';

interface PageSpec {
  /** Display name in test ID + snapshot filename. */
  name: string;
  /** Route to navigate to. */
  path: string;
  /** Whether the route requires an authenticated session. */
  requiresAuth: boolean;
  /**
   * Selector that proves the page has finished its first meaningful paint.
   * Playwright waits for this before snapshotting so we never capture a
   * skeleton or loading spinner.
   */
  waitFor: string;
  /**
   * Optional extra wait after the selector resolves — for charts that
   * animate in or for lists that hydrate after a second fetch tick.
   */
  settleMs?: number;
}

const PAGES: ReadonlyArray<PageSpec> = [
  { name: 'landing', path: '/landing', requiresAuth: false, waitFor: '[data-testid="visual-landing-ready"]' },
  { name: 'dashboard', path: '/dashboard', requiresAuth: true, waitFor: '[data-testid="visual-dashboard-ready"]', settleMs: 800 },
  { name: 'portfolio', path: '/portfolio', requiresAuth: true, waitFor: '[data-testid="visual-portfolio-ready"]', settleMs: 800 },
  { name: 'trading', path: '/trade', requiresAuth: true, waitFor: '[data-testid="visual-trading-ready"]' },
  { name: 'options', path: '/options', requiresAuth: true, waitFor: '[data-testid="visual-options-ready"]' },
  { name: 'cvrf', path: '/cvrf', requiresAuth: true, waitFor: '[data-testid="visual-cvrf-ready"]' },
  { name: 'earnings', path: '/earnings', requiresAuth: true, waitFor: '[data-testid="visual-earnings-ready"]' },
  { name: 'factors', path: '/factors', requiresAuth: true, waitFor: '[data-testid="visual-factors-ready"]' },
  { name: 'alerts', path: '/alerts', requiresAuth: true, waitFor: '[data-testid="visual-alerts-ready"]' },
];

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
const SUPABASE_PROJECT_REF = (() => {
  // Extract the project ref from the URL ("https://<ref>.supabase.co").
  const match = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/);
  return match ? match[1] : '';
})();
const SUPABASE_AUTH_KEY = SUPABASE_PROJECT_REF ? `sb-${SUPABASE_PROJECT_REF}-auth-token` : '';

/**
 * Inject a Supabase session into localStorage so the SPA boots already
 * authenticated. The shape matches what `@supabase/supabase-js` writes when
 * `persistSession: true` (see client/src/lib/supabase.ts).
 */
async function injectSession(page: Page, session: Awaited<ReturnType<typeof mintTestSession>>): Promise<void> {
  if (!SUPABASE_AUTH_KEY) {
    throw new Error(
      '[visual] Could not derive Supabase project ref — set VITE_SUPABASE_URL in the environment ' +
        'so the auth-token localStorage key can be built.',
    );
  }
  // localStorage is per-origin, so we have to navigate to the origin first.
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

/** Set the theme store's persisted state so Zustand applies the class on hydrate. */
async function setTheme(page: Page, theme: Theme): Promise<void> {
  await page.evaluate((t) => {
    window.localStorage.setItem(
      'frontier-theme',
      JSON.stringify({ state: { theme: t, resolved: t }, version: 0 }),
    );
  }, theme);
}

/** Cache one mint per worker so we don't hammer Supabase auth between tests. */
let cachedSession: Awaited<ReturnType<typeof mintTestSession>> | null = null;
async function getSession() {
  if (!cachedSession) cachedSession = await mintTestSession();
  return cachedSession;
}

for (const spec of PAGES) {
  test.describe(`visual: ${spec.name}`, () => {
    for (const theme of ['light', 'dark'] as const) {
      test(`${spec.name} ${theme}`, async ({ page }) => {
        if (spec.requiresAuth) {
          const session = await getSession();
          await injectSession(page, session);
        } else {
          // Even unauthenticated routes need theme set before first paint.
          await page.goto('/');
        }
        await setTheme(page, theme);

        await page.goto(spec.path, { waitUntil: 'domcontentloaded' });

        // Wait for the per-page anchor and for network to quiet.
        await page.waitForSelector(spec.waitFor, { state: 'visible', timeout: 30_000 });
        await page.waitForLoadState('networkidle', { timeout: 30_000 });

        if (spec.settleMs) {
          await page.waitForTimeout(spec.settleMs);
        }

        // Disable any in-flight CSS animations + transitions so the screenshot
        // captures the steady-state render even if a reduced-motion override
        // didn't catch a one-off keyframe.
        await page.addStyleTag({
          content: `
            *, *::before, *::after {
              animation-duration: 0s !important;
              animation-delay: 0s !important;
              transition-duration: 0s !important;
              transition-delay: 0s !important;
            }
          `,
        });

        await expect(page).toHaveScreenshot(`${spec.name}-${theme}.png`, {
          fullPage: true,
        });
      });
    }
  });
}
