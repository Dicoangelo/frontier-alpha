/**
 * Playwright config for TOKEN-007 visual regression.
 *
 * Snapshots every primary page in light + dark themes at 1440x900. Boots the
 * client dev server itself (port 5173) so the suite is runnable from a single
 * command on local machines and in nightly CI.
 *
 * NOT wired into per-PR CI by design (see .github/workflows/visual-regression.yml).
 * The TOKEN-007 completion note explicitly defers this to a nightly cron because
 * a 20+ minute Playwright run on every PR is not worth the cycle cost when the
 * token migration is already gated by the no-raw-hex ESLint rule (TOKEN-006).
 *
 * CJS file (not .ts) on purpose: the repo root is `"type": "module"` and Node
 * 22's ESM static analysis can't surface `defineConfig` through Playwright's
 * CJS-to-ESM bridge when the config loads as ESM. Keeping the config CJS sidesteps
 * the entire dual-mode trap. The spec files stay TypeScript ESM.
 *
 * Local commands (from repo root):
 *   npm run test:visual           Run the suite against existing baselines.
 *   npm run test:visual:update    Regenerate baselines (after intentional
 *                                 design changes — review the diffs visually
 *                                 before committing the new PNGs).
 */
const { defineConfig, devices } = require('@playwright/test');

const isCI = !!process.env.CI;

module.exports = defineConfig({
  testDir: __dirname,
  testMatch: '**/*.spec.ts',
  snapshotDir: require('path').join(__dirname, 'baseline'),
  // Per-test snapshot path: every test asks for a single PNG under baseline/.
  snapshotPathTemplate: '{snapshotDir}/{arg}{ext}',
  fullyParallel: false,
  forbidOnly: isCI,
  // Visual diffs are flake-prone on first auth-redirect; one retry in CI buys
  // headroom without masking real regressions.
  retries: isCI ? 1 : 0,
  workers: 1,
  reporter: isCI ? 'github' : 'list',
  timeout: 60_000,
  expect: {
    // Story requirement: <1% per channel. Playwright's maxDiffPixelRatio is
    // pixels-different / total-pixels, which is the right knob for token
    // migrations (a hue shift on a single token cascades across the page).
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
      animations: 'disabled',
      caret: 'hide',
    },
  },
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    // Disable service worker registration so the PWA installer doesn't paint
    // an "update available" banner mid-snapshot.
    serviceWorkers: 'block',
  },
  projects: [
    {
      name: 'chromium-1440',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      },
    },
  ],
  webServer: {
    // Boot the client dev server from the repo root. Playwright's `cwd` is
    // relative to the config file location (tests/visual/), so `../..` lands
    // at the repo root where `npm run client:dev` is defined.
    command: 'npm run client:dev',
    cwd: require('path').resolve(__dirname, '..', '..'),
    url: 'http://localhost:5173',
    timeout: 120_000,
    reuseExistingServer: !isCI,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
