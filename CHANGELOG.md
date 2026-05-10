# Changelog

All notable changes to Frontier Alpha are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.3.5] - 2026-05-09

### Onboarding Polish (3 confirmed fresh-user UX bugs)

End-of-day audit walked production as the seeded golden-state user and the anonymous landing visitor. Three real onboarding-stage bugs surfaced and were fixed in this release. Visual baselines for `dashboard` and `options` regenerated to lock the new rendering.

- **Welcome modal data-destructive prompt**
  - Before: every authenticated user (including users with funded portfolios) got the welcome modal on first dashboard load. The modal's "Import 7 symbols as your starting portfolio" CTA would overwrite their existing positions with the demo set.
  - Fix: `client/src/components/onboarding/OnboardingProvider.tsx` now gates the modal on `portfolioQuery.data?.positions?.length === 0`. Returning users with positions are auto-marked onboarded so the modal does not reappear if their localStorage is cleared.
  - Result: welcome modal only fires for users who actually have an empty portfolio. Verified with the seeded test user (5 positions): modal no longer appears.

- **Risk Metrics empty state**
  - Before: 6 metric tiles each showing "—" with "No data" badges. Read like a broken page on first dashboard paint.
  - Fix: `client/src/components/risk/RiskMetrics.tsx` empty branch now renders a single calm placeholder with sparkle icon and one-line copy ("Awaiting price history. Sharpe, volatility, drawdown, VaR, CVaR, and beta populate as factor data accumulates from your positions."). Test updated to match the new behavior.
  - Result: dashboard first paint reads as a feature waiting on data, not as broken.

- **Options page banner copy**
  - Before: "SHOWING DEMO DATA — CONNECT A PORTFOLIO TO SEE YOUR NUMBERS" rendered even when the user had positions. Misleading because the chain itself is mock-only and connecting positions does not change that.
  - Fix: `client/src/pages/Options.tsx` now passes an explicit `message` to `MockDataBanner`: "Options chain shown is demo data. Live chain wiring is on the roadmap." Default banner copy in `MockDataBanner.tsx` also updated to swap the em dash for a period (cross-project no-em-dashes rule).

### Visual baselines refreshed

- `dashboard-light.png` and `dashboard-dark.png` re-captured to reflect the suppressed welcome modal and new Risk Metrics placeholder.
- `options-light.png` and `options-dark.png` re-captured to reflect the new banner copy.
- Other 14 baselines unchanged.

### Audit observations deferred (not in this release)

- FactorDeltas card on production still shows "Building factor baseline. Return tomorrow for first delta read." for the seeded test user even though the v1.3.4 server endpoint should resolve this. Strategy 1 path may not be firing. Investigate next session.
- Live feed offline banner copy on Vercel tier (offline by design) is alarming for fresh users. Memory note: per v1.2.6 fix this is intentional terminal state. Could soften copy but not in this scope.
- Landing stat counters appear to render at 0 in screenshots due to IntersectionObserver timing. Real users see them animate. Not a real UX issue.

---

## [1.3.4] - 2026-05-09

### Server-Side Factor History (DASH3-005 follow-up, closes "wait til tomorrow" gap)

- `feat(factors): server-derived current + prior snapshot for FactorDeltas`
- New endpoint: `GET /api/v1/portfolio/factors/history/:symbols?window=1d|5d`
  - Returns both the current factor snapshot and a window-prior snapshot in one round trip
  - Prior snapshot is computed by truncating the same Price[] series the current snapshot uses (see `src/factors/historySlice.ts`); the price series is already the source of truth, so no `frontier_factor_snapshots` table is needed
  - Response shape: `{ current, prior, window, asOfDate, priorDate }`
  - Macro and fundamental factors are NOT sliced (they reflect latest reads only); for 1d/5d windows that is an acceptable simplification because day-to-day exposure motion is price-driven
- New `src/factors/historySlice.ts` with 12 unit tests covering identity slice, end-truncation, short-series drop, immutability, and `lastBarDate` ISO formatting
- New `tests/e2e/factors-history.test.ts` with 5 surface tests plus the corresponding MSW handler in `tests/setup/msw-handlers.ts`
- Client: `factorsApi.getFactorsHistory(symbols, window)` plus `useFactorsHistory(symbols, window)` React Query hook (auth-gated identically to `useFactors`)
- `useFactorDeltas` rewired with explicit Strategy 1 (server) then Strategy 2 (localStorage) then Strategy 3 (empty) priority chain. The localStorage baseline still rotates per UTC day so it remains a working offline fallback if the server endpoint degrades
- Hook test suite gains 2 composition tests pinning the `aggregateExposures(prior)` plus `computeDeltas(current, agg)` chain so a future refactor cannot silently re-order the steps
- `schemas/arch.json` regenerated: portfolio.ts route module 11 to 12 endpoints, server endpoints 112 to 113

### Why this matters

The original DASH3-005 (v1.3.3) computed deltas client-side from a localStorage baseline that took one full UTC day to accumulate. New users saw an empty FactorDeltas card on day one. With the server endpoint, the prior snapshot is derived retroactively from the same historical price series the current snapshot already uses, so the card has a real day-1 delta with no waiting.

---

## [1.3.3] - 2026-05-09

### Legacy PRD Wave Closed — DASH3-005 + TOKEN-007

Two pre-v1.2.6 deferred stories picked up after the v1.3.0 reliability wave unblocked their prerequisites. Both shipped via parallel agents with no overlap.

- **DASH3-005 — Cognitive Insight v2 (factor-change surfacing)**
  - `68e80a3` feat(DASH3-005): Cognitive Insight v2 factor-deltas surfacing
  - New `client/src/hooks/useFactorDeltas.ts` + `factorDeltas.helpers.ts` + 21 unit tests
  - New `client/src/components/explainer/FactorDeltas.tsx` rendered as sibling to CognitiveInsight on Dashboard
  - Computes deltas client-side from existing factor exposures + localStorage baseline (no new ML endpoint required); falls back to `kind: 'empty'` until baseline accumulates
  - Reuses DataSource discriminated union from US-002, Sparkline component from existing UI, no new npm dependencies
  - `data-testid="visual-dashboard-ready"` added for TOKEN-007 wait anchor

- **TOKEN-007 — Visual regression infrastructure**
  - `8887c14` feat(TOKEN-007): visual regression infra, Playwright + nightly CI
  - `b1a717a` test(TOKEN-007): visual regression baselines, Landing light + dark
  - `1127359` fix(TOKEN-007): valid YAML for nightly workflow step name
  - `tests/visual/playwright.config.cjs` + `tests/visual/tokens.spec.ts` (18 tests = 9 pages x 2 themes)
  - `.github/workflows/visual-regression.yml` runs nightly at 06:00 UTC, NOT per-PR (per original deferral guidance)
  - `data-testid="visual-{page}-ready"` anchors added across Landing, Portfolio, Trading, Options, CVRF, Earnings, Factors, Alerts (Dashboard had its anchor added by DASH3-005)
  - 2 of 18 baselines committed (Landing light + dark); the remaining 16 need `npm run test:visual:update` run once with operator credentials (`SUPABASE_URL` + `SUPABASE_SERVICE_KEY` + `SUPABASE_ANON_KEY`) to seed the golden-state user and capture
  - `chromium`-only, `maxDiffPixelRatio: 0.01`, on-failure CI uploads `playwright-report/` + `test-results/` artifacts

**Legacy PRD inventory after this wave:**
- `prd-dashboard-v3.json`: 7 of 8 done (DASH3-006 personalization deferred until 2nd active user)
- `prd-mobile-portfolio.json`: 6 of 7 done (MOBILE-004 swipe actions deferred until 2nd active user)
- `prd-motion-system.json`: archived to `.prd-archive/` (7 of 7 complete)
- `prd-token-migration.json`: 7 of 7 done

---

## [1.3.2] - 2026-05-09

### Risk Metrics Empty State (sparse-factor leak closed)

- `3ce23ee` fix(dashboard): Risk Metrics empty when factor data sparse
- `c1302eb` audit: v1.3.2 dashboard with Risk Metrics empty state
- `client/src/pages/Dashboard.tsx::calculateMetrics()` returns `null` when `positions.length === 0` OR market/volatility factors not yet computed; caller wraps `null` in `EMPTY` DataSource so the existing `kind === 'empty'` branch renders clean placeholders ("Add positions to compute this metric")
- Removed unused `EMPTY_METRICS` zero-seed object that was the source of the prior derived-defaults leak (Sharpe 0.28, Vol 18%, Drawdown -27% looked real but were CAPM stand-ins)

## [1.3.1] - 2026-05-09

### Auth-chain hotfixes (post-v1.3.0 walkthrough)

- Three sites used `localStorage.getItem('supabase_token')` (wrong key); all replaced with `supabase.auth.getSession()` or `useAuthStore.getState().session`
- Dashboard portfolio fetch was returning the API envelope as Portfolio; now unwraps `json.data || json.portfolio || json`
- `Number(undefined)` produces `NaN` and `NaN ?? fallback` does NOT fall through; replaced with `Number.isFinite(portRaw) ? portRaw : 3000` in health probe URL builder
- `digest/run` route added `?probe=true` short-circuit because Vercel rewrites `HEAD` to `GET` on `/api/(.*)` catch-all routes (broke health probe gate-only pattern)
- `JSON.stringify(undefined)` returns `undefined`; ErrorCounter raw string capture now uses `JSON.stringify(error) ?? String(error)`
- `useNotifications.ts` subscription helpers swapped to live session reads

## [1.3.0] - 2026-05-09

### End-User Reliability Wave — 9 user stories shipped via 3 waves of parallel agents

The v1.2.6 walkthrough exposed a deeper structural problem: 740 tests passed
while `/api/v1/portfolio` 404'd for everyone in production. Test counts and
integration health flags lied. v1.3.0 closes that class of "boundary bugs"
AND threads in five compounding patterns so each fix produces durable
infrastructure beyond the immediate bug.

**Stories shipped (in three parallel waves):**

- **US-001 — Architecture refresh + machine-checkable arch contract**
  - `d1fd833` chore(docs): refresh ARCHITECTURE + CLAUDE current state
  - `56e54ac` feat(scripts): arch-scanner + schemas/arch.json + CI hook
  - Operations runbook (daily / weekly / incident playbook / rotation runbook / upgrade triggers)
  - Auth state machine documented in ARCHITECTURE.md

- **US-002 — Mock-data integrity + DataSource type contract**
  - `6f392af` feat(integrity): DataSource<T> type contract + 6-page mock-data audit
  - New `client/src/lib/dataSource.ts` discriminated union; mock-data leaks now TS errors
  - Dashboard / ML / Tax / Alerts / Options / Earnings audited for fabricated state

- **US-003 — Auth lifecycle hardening (eliminate cold-load 401 race)**
  - `aaceecb` feat(auth): isReady flag + ProtectedRoute gate
  - `e210990` feat(auth): 401 retry-with-refresh in API interceptor
  - 6 hooks gated on `isReady && session?.access_token`
  - ARCHITECTURE.md auth lifecycle diagram refined with predicates + render permissions

- **US-004 — Health probe upgrade (real upstream calls + standardized shape)**
  - `b8594fd` feat(health): real-upstream probes + standardized shape + JSON Schema
  - 7 real-upstream probes (Polygon, AV, Stripe, Resend, Supabase, ConnectAlpaca crypto, weekly digest cron)
  - `IntegrationHealthEntry` type extended with `latencyMs / lastError / lastSuccessAt / ttlSeconds`
  - `schemas/health-integration.json` + ajv runtime validation

- **US-005 — WebSocket UX + reusable DegradedService primitive**
  - `0df78bd` feat(ws): wsClient.resetWebSocket() user-initiated reset
  - `7edb80d` feat(ui): <DegradedService> primitive + ConnectionStatus refactor
  - Reusable for future degraded paths (rate limiter, AI explainer, billing webhook lag)

- **US-006 — Provider rate-limit architecture + extracted cache module**
  - `a4ab925` feat(cache): extracted Memory/Supabase/Composite cache module + tests (18 new)
  - `7aea9f5` refactor(market-data): MarketDataProvider uses CompositeCache
  - `84ad491` feat(cache): CacheWarmer + boot-time warm + hourly cron + README upgrade callout
  - `inflightHistoricalPrices` request coalescing preserved separately
  - Hand-rolled `ConcurrencyLimiter(4)` for Polygon free-tier ceiling

- **US-007 — Authenticated smoke tests + golden state + synthetic monitor**
  - `153a8d6` feat(test): integration auth-helper + golden-state fixture
  - `1a45356` feat(test): protected routes smoke suite + api-shape schema
  - `89e7fd8` feat(observability): synthetic monitor fills US-008 stub with smoke assertions
  - 17 assertions across 13 protected routes, schema-validated via ajv
  - Synthetic monitor cron runs every 15 minutes against production
  - Golden state fixture (`tests/fixtures/golden-state.sql`) reusable for screenshots / smoke / support

- **US-008 — Observability (error counter + request tracing + weekly digest)**
  - `1cbc81d` feat(observability): error counter + request tracing + weekly health digest
  - `ErrorCounter` singleton; `RequestTracing` middleware threads `X-Request-Id` client → server → console
  - Weekly health-summary email cron (Sundays 13:00 UTC)
  - Synthetic monitor results auto-feed `errorCounter`

- **US-009 — Env audit + schema-driven contract**
  - `83f0425` feat(env): schema-driven contract + audit script + CI hook
  - `schemas/env-schema.json` declares every production env var with regex/length contracts
  - `scripts/audit-env.mjs` lint mode + full-audit mode
  - GitHub Action runs weekly + on every PR that touches env references

**Compounding outputs delivered (the durable yield):**
- 5 reusable primitives: `DataSource<T>`, `<DegradedService>`, `MemoryCache`/`SupabaseCache`/`CompositeCache`, `auth-helper.mintTestSession()`, `RequestTracing`
- 4 machine-checkable schemas: `arch.json`, `env-schema.json`, `health-integration.json`, `api-shape.json`
- 1 documented state machine: auth lifecycle
- 1 golden-state fixture: canonical seeded test user
- 1 operations runbook: daily / weekly / incident / rotation / upgrade triggers
- 1 synthetic monitor: production smoke tests on 15-min cron sharing CI assertions

**Tests:** 740 (v1.2.6) → **765 passing**, 41 test files, ~3 second runtime.

**New cron entries:** `/api/v1/cron/warm-cache` (hourly), `/api/v1/digest/health-summary` (Sundays 13:00 UTC), `/api/v1/cron/synthetic-monitor` (every 15 min).

---

## [1.2.6] - 2026-05-08

### End-user walkthrough fixes — 9 user stories shipped via parallel agents

Walked the production app as fresh enterprise dev account
(`dicoangelo+dev@metaventionsai.com`), captured 20 screenshots into
`.audit-2026-05-08/walkthrough/`, and shipped the resulting fix queue
through ralph-tui PRD `tasks/prd-v1.2.6-walkthrough-fixes.md` with 8
parallel agent sessions across 2 waves.

**P0 fixes (caught during the walkthrough itself, before the PRD):**
- `5277a74` `fix(portfolio): wire useDatabase + currentPortfolio in AppServer` —
  every authed `GET /api/v1/portfolio` returned 404 because `server.useDatabase`
  was never declared on `AppServer`. Now reads `Boolean(SUPABASE_SERVICE_KEY)`.
- `70e67c7` `fix(portfolio): React error #310 — move hooks above early returns` —
  `useMemo`/`useCountUp` lived below an `if (isLoading) return ...`. Loading→loaded
  transition tripped React's hook-order check.

**Wave 1 (5 parallel agents):**
- `06d89ae` `fix(factors): per-symbol resilience in /portfolio/factors handler (US-001)`
  — bad ticker no longer 500s the whole batch
- `d5a1749` `fix(display-name): strip +suffix aliases from email greeting (US-003)` —
  greeting now reads "Dicoangelo" not "Dicoangelo+dev"
- `e48d965` `feat(nav): add Backtest entry to sidebar Intelligence group (US-004)` —
  Backtest reachable from sidebar (was orphaned at `/backtest`)
- `1b04a65` `fix(onboarding): soften welcome modal + persist dismissal (US-008)` —
  halo gradient instead of saturated sovereign, 44x44 close X, localStorage-backed
  dismissal
- `ee86990` `feat(dashboard): real 7D sparkline + change in HoldingsTable (US-009)`
  — replaced seeded-PRNG mock sparkline with real 7-day prices via
  `getHistoricalPrices`; new `quotesApi.getHistoricalPrices` route +
  client module

**Wave 2 (3 parallel agents):**
- `fb3aed5` `fix(ws): repair Railway handshake (US-006)` — root cause was
  `@fastify/websocket@^10` v8 API mismatch on Railway (`connection.socket.on`
  was undefined). Server-side shim handles both v7 and v8+ shapes; client-side
  defense-in-depth abandons WS after 3 failed reconnects so the banner enters
  a terminal "Live Feed Offline · Polling Fallback" state instead of looping
  "Reconnecting · 1 · 1s" forever
- `fd10c4c` `fix(dashboard): empty state when no positions (US-005)` —
  authenticated users with zero positions now see `<EmptyPortfolio>` instead
  of a fake $125K demo. Public landing flow unchanged
- `4bf26ee` `fix(mock-data): MockDataBanner across Tax/ML/Alerts/Social/Options (US-007)`
  — every page that displays demo / placeholder data now shows a dismissible
  banner. `MockDataBanner` gained `force`, `pageKey`, `dismissible`, `message`
  props with per-page localStorage persistence
- `791292f` `fix(cvrf): repair page crash on fresh user (US-002)` — root cause
  was a client/server API shape mismatch on `/api/v1/cvrf/stats` (server
  returns `factorWeights`, client typed as `weights`). Added 3 normalizer
  functions in `client/src/api/cvrf.ts` + defensive null-coalescing across 9
  CVRF components + page-level `SectionErrorBoundary`

**Net:** 11 commits, 0 known production crashes, mock-data-leak fully closed.
Audit + screenshots captured in `.audit-2026-05-08/walkthrough/AUDIT.md`.

---

## [1.2.5] - 2026-05-08

### Rate limiter goes durable on Supabase + IP extractor fix — no Upstash needed

Replaced the in-memory rate limiter with a Supabase-backed counter so limits
survive Vercel cold starts without adding a new vendor. At Frontier Alpha's
scale, Postgres handles the load just fine; the third-party Redis dependency
isn't worth the ops cost.

- **Added** `frontier_rate_limits` table + `rate_limit_check(text,int,int)`
  Postgres RPC that does an atomic UPSERT (window-rolls when expired,
  increments otherwise) in a single round-trip.
- **Added** `rate_limit_cleanup()` housekeeping function — call from a cron
  if the table grows long-tail.
- **Changed** `src/middleware/rateLimiter.ts` — new `SupabaseRateLimiterStore`
  class wraps the RPC, falls back to the in-memory store on RPC error so a
  Postgres blip cannot wedge the API. Mode auto-selects based on
  `SUPABASE_SERVICE_KEY` presence.
- **Changed** `/api/v1/health/integrations.rateLimiter` — reports
  `provider: 'supabase-postgres'`, `mode: 'rate_limit_check RPC'` when
  Supabase is the active store.
- **Fixed** `getClientIp()` was reading `x-forwarded-for[0]` which on Vercel
  silently rotated to a PoP IP (216.73.162.x range) instead of the real
  client IP — every request looked like a fresh client and never hit limits.
  New extractor prefers `x-vercel-forwarded-for` → `cf-connecting-ip` →
  `x-real-ip` → XFF → `request.ip`.
- **Result** — 13 of 14 integrations live (only Vercel WS by-design remains
  degraded). No Upstash signup required.

---

## [1.2.4] - 2026-05-08

### Fix: WebSocket Offline · Data Stale + Stripe checkout failure + Terms/Privacy

Both regressions traced to the same root cause — every `VITE_*` env on Vercel
carried a literal `\n` because earlier sessions used `echo | vercel env add`.
A literal `\n` is *truthy* in JavaScript, so:

- `VITE_API_URL="\n"` short-circuited the WS URL precedence, building
  `"\n/ws/quotes"` → invalid → fell all the way to polling → "Offline · Data Stale"
- `VITE_STRIPE_PRO_PRICE_ID="price_...\n"` got baked into the SPA bundle, so
  the checkout POST sent a price ID with a trailing newline → Stripe rejected
  it → checkout silently failed

Fixes:
- **Reset all 7 `VITE_*` envs** on Vercel cleanly via `printf` (no trailing newline)
- **Defense-in-depth** in `client/src/api/websocket.ts::getWebSocketUrl()` — now
  `.trim()`s every env read so a future env mishap can't recreate this. Also
  guards against double-appending `/ws/quotes` if the env already includes the
  path.
- **Out of scope (transient):** Supabase rate-limited /auth/recover with 429
  after multiple forgot-password attempts. Resolves itself in ~30 min; not a
  code bug.

### Added: Terms of Service + Privacy Policy

- New `/terms` and `/privacy` routes (`client/src/pages/Terms.tsx`,
  `Privacy.tsx`) following the family aesthetic — sovereign-bar, halo gradient
  title, glass surfaces.
- Login footer text now wraps "Terms of Service" and "Privacy Policy" in
  links that open in a new tab.
- Landing footer adds Terms and Privacy entries next to Sign In / Documentation / API.

---

## [1.2.3] - 2026-05-08

### Health endpoint surfaces v1.2.x integrations

Production diagnostic now reflects what actually shipped. `GET /api/v1/health/integrations`
adds three new entries and trims a stale env newline that was leaking into the
provider field.

- **Added** `connectAlpaca` entry — round-trip probes `BROKER_CRED_ENC_KEY` via
  `isCryptoReady()` so a malformed key surfaces here instead of waiting for the
  first user to hit `POST /api/v1/broker/connect`.
- **Added** `weeklyDigestCron` entry — surfaces `CRON_SECRET` presence so
  operators know whether the Monday 13:00 UTC Vercel cron can authorize.
- **Added** `compGuard` entry — informational status that the comp-customer
  webhook protection is wired (always live, code-only).
- **Fixed** `provider: "resend\n"` — env values from `vercel env add` can carry
  trailing newlines, so the email entry now `.trim()`s the provider before
  echoing it.

Total integrations surfaced: 13 (was 11). Frontier Alpha v1.2.x feature wiring
is now fully observable from a single endpoint.

---

## [1.2.2] - 2026-05-08

### Comp customer guard — billing webhooks cannot clobber comp rows

Comp/founder accounts are seeded with sentinel `comp_*` IDs in
`stripe_customer_id` and `stripe_subscription_id`. Real Stripe customer IDs
are `cus_*` so the formats can never collide, but this release makes the
protection explicit at every mutation site:

- **Added** `isCompCustomerByUserId()` helper + `COMP_PREFIX` sentinel in
  `src/routes/billing.ts`.
- **Changed** `POST /api/v1/billing/checkout` — refuses to create a Stripe
  Checkout Session for a user whose subscription row carries comp IDs (409
  `COMP_ACCOUNT`).
- **Changed** `checkout.session.completed` webhook — skips the upsert and
  logs `Skipping checkout.session.completed upsert for comp account` when
  the inbound `metadata.userId` belongs to a comp account.
- **Changed** `customer.subscription.updated`, `customer.subscription.deleted`,
  and `invoice.payment_failed` webhook branches — added explicit
  `.not('stripe_customer_id', 'like', 'comp_%')` clause as defense-in-depth.

---

## [1.2.1] - 2026-05-08

### Weekly digest — real metrics

Replaced the stubbed portfolio numbers in the Monday-morning digest with live values
from `portfolioService` + `marketDataProvider`. Each per-position 7-day return is computed
against an actual prior close (Alpha Vantage TIME_SERIES_DAILY_ADJUSTED, Supabase-cached)
and the largest dollar swing is surfaced as the "because" line on the top-mover card.

- **Added** `src/notifications/digest-metrics.ts` — `computeWeeklyMetrics(userId)` returns
  portfolio value, 7-day delta, top mover, and worst mover, or `null` when data is too
  thin to render a meaningful digest.
- **Changed** `src/routes/digest.ts` — wires real metrics into `renderWeeklyDigest`,
  skips users whose portfolio cannot be resolved instead of sending a zeroed-out email.
- **Failure posture** — per-symbol fetch errors are logged and skipped; one bad ticker
  no longer poisons the run.

---

## [1.2.0] - 2026-05-08

### Backend integration wave — 9 of 11 integrations live, two-tier deployment

This release closes the live-services gap. Stripe billing, DeepSeek explanation, Resend email,
VAPID web push, and an internal SimulatedBroker all moved from "wired-but-dormant" to
production-active. A second deployment tier (Railway) was introduced to host the long-lived
Polygon WebSocket that Vercel's serverless runtime cannot keep open. PRs #10–#13.

### Added

- **SimulatedBroker** — internal paper trading engine. Fills against the live Polygon WebSocket
  (Railway tier) and persists into Supabase tables `paper_accounts`, `paper_orders`,
  `paper_positions` with RLS. Replaces the read-only demo path; no external broker dependency.
- **Stripe live billing** — Pro ($29/mo) and Enterprise ($99/mo) products created via the Stripe
  API with stable `lookup_keys`, idempotent provisioning script (`scripts/create-stripe-products.mjs`),
  webhook endpoint registered, signing secret wired. Subscription state flows through
  `useSubscription` and `UpgradeGate`.
- **DeepSeek V4 explainer** — preferred LLM provider for `ExplanationService`. OpenAI remains
  supported as a fallback. Selection is provider-agnostic: `DeepSeek > OpenAI > template`.
- **Resend email** — alerts and transactional sends. Four new templates: welcome, alert digest,
  billing receipt, billing failure.
- **VAPID web push** — keys self-generated; both server (`PushService`) and client (subscription
  flow) wired end-to-end.
- **Railway deployment tier** — second runtime at `frontier-alpha-api-production.up.railway.app`
  hosting the standalone Fastify build with WebSocket support. Custom subdomain
  `api.frontier-alpha.metaventionsai.com` pending TLS provisioning. Same codebase, different
  runtime mode (long-lived vs serverless).
- **Two-tier deployment architecture** — Vercel hosts the SPA + REST API; Railway hosts
  long-lived WebSocket. Client uses `VITE_WS_URL` to point at Railway and `VITE_API_URL=''` for
  same-origin REST.
- **Subscription gating UI** — `UpgradeGate` component + `useSubscription` hook lock Pro features
  behind active subscription state.
- **Stripe checkout return flow** — `BillingSuccess` and `BillingCanceled` pages handle the
  Stripe-hosted checkout redirect handoff.
- **`/api/v1/health/integrations`** — diagnostic endpoint reporting per-integration status
  (live / unwired / degraded).
- **Operational scripts** — `scripts/wire-production-env.sh`, `scripts/wire-deepseek.sh`,
  `scripts/wire-vapid.sh`, `scripts/wire-stripe-webhook.mjs`, `scripts/create-stripe-products.mjs`.

### Changed

- **`ExplanationService`** — provider-agnostic. Resolution order: DeepSeek → OpenAI → template.
  Previously OpenAI-only.
- **`SentimentAnalyzer`** — three-tier resolution. FinBERT → LLM (DeepSeek) → keyword fallback.
  With `DEEPSEEK_API_KEY` set, the service moves out of the previous degraded keyword-only mode
  into `llm-classification` mode.
- **Trading page banner** — `READ-ONLY DEMO MODE` replaced with `PAPER TRADING · Frontier Alpha
  Engine`. Reflects the SimulatedBroker now backing live order flow.
- **Demo workflow** — landing → signup → dashboard handoff now preserves preview symbols across
  the auth boundary.

### Fixed

- **Vercel client missed Supabase env** — the client wasn't reading `VITE_*`-prefixed Supabase
  variables. Realigned env names and verified through the Vercel build pipeline.
- **Graceful degradation** — UI now degrades cleanly when an integration is unwired
  (no console flooding, contained error UI). Confirmed against the
  `/api/v1/health/integrations` matrix.

### Pending

- **Upstash Redis** — still pending. Free signup not yet completed. Rate limiter falls back to
  in-memory (single-instance correct, multi-instance soft).

**Production:** https://frontier-alpha.metaventionsai.com (Vercel) +
https://frontier-alpha-api-production.up.railway.app (Railway, custom subdomain pending TLS).
Deployed 2026-05-08.

---

## [1.1.0] - 2026-05-07

### UI: family-aesthetic polish across 35 files

Comprehensive visual rev aligning Frontier Alpha with the rest of the Metaventions AI family
(`metaventionsai.com`, `careers.metaventionsai.com`, `friendlyface.metaventionsai.com`). Five rounds,
two PRs (#3 + #4), 35 files modified.

#### Added

- **Four missing keyframes** in `client/src/index.css` — `animate-fade-in`, `animate-slide-in-left`,
  `animate-slide-in-right`, `animate-pulse-subtle`. These were referenced site-wide but only declared in
  the reduced-motion override, causing every animated overlay/sidebar/toast to land as a hard cut. Now
  bound to motion tokens (`--motion-duration-base`, `--motion-duration-slow`, `--motion-ease-out`).
- **`ModelStatusBanner` pattern** — reusable status banner with type-colored 3px rail and shadow glow,
  shared across CVRF / Backtest / ML / Earnings / Trading.
- **`SectionShell` wrapper** — consistent section frame for Settings, APIKeys, Help.
- **`ToggleRow` component** — settings toggle with sovereign-gradient track, used across Settings + APIKeys.
- **Sovereign-gradient input ring** across all forms (LoginForm, SignupForm, Settings, APIKeys).
- **Sovereign-bar (3px gradient top rail)** on every modal and page header — CommandPalette, BottomSheet,
  KeyboardHelpModal, WelcomeModal, FeatureTour, MobileNav, Pricing.
- **Mono kicker register** — `mono text-[10px] sm:text-xs tracking-[0.3em] uppercase text-theme-muted` —
  applied as the canonical small-label register across Header, PortfolioOverview, MarketStatusStrip,
  EquityCurve, intelligence pages, execution pages.
- **`tabular-nums`** on every numeric metric (anti-jitter on streaming quotes, time displays, equity curve
  values, position rows).

#### Changed

- **Buttons** — replaced `transition-all` + `hover-scale` (janky on focus) with `animate-press` +
  `animate-lift` + brightness-filter hover. New token-based vocabulary across the entire interaction layer.
- **Toasts** — flat tinted backgrounds → `glass-slab-floating` + 3px type-colored left rail + colored
  shadow glow. Toast pattern now reused for SectionErrorBoundary, ConnectionStatus, MockDataBanner,
  ModelStatusBanner, banners in Earnings/Trading.
- **ErrorBoundary** — rogue `--color-info` blue "Try Again" button replaced with sovereign gradient.
  Full-page boundary now uses `glass-slab-floating` + sovereign-bar. SectionErrorBoundary adopts the Toast
  banner pattern.
- **Sidebar active state** — color swap → sovereign-gradient `before:` pseudo rail. Section dividers grouped.
  Upsell card upgraded to gradient CTA.
- **Pricing page** — full rebuild with `grid-bg` shell, `holo-pulse` hero, `border-sovereign` on Pro tier.
- **Settings + APIKeys** — `SectionShell` pattern, canonical inputs, `ToggleRow` with sovereign-gradient
  track, segmented theme switcher, Danger Zone with red rail.
- **Forms** — LoginForm + SignupForm canonical input pattern with focus rings; glass-slab error blocks.
- **Sidebar.tsx, Header.tsx, MobileNav.tsx, BottomSheet.tsx, CommandPalette.tsx, PullToRefresh.tsx** —
  layout chrome upgraded to family aesthetic; sovereign-violet glow on PullToRefresh; glass-modal on sheets.
- **PortfolioOverview** — `text-gradient-brand` hero with `holo-pulse`. **EquityCurve** — segmented
  timeframe pills, fixed `h-64` chart wrapper. **MarketStatusStrip** — glass-slab pills with type rails.
- **Intelligence pages** — CVRF, Backtest, ML adopt ModelStatusBanner pattern, page-header polish.
- **Execution pages** — Trading, Options, Earnings, Tax adopt segmented controls and mono uppercase tables.
- **Help / onboarding** — Help, Social, KeyboardHelpModal, HelpPanel, HelpButton, WelcomeModal, FeatureTour
  unified under sovereign-bar modal pattern.

#### Fixed

- **CLS on Dashboard** — `min-h` set on every chart wrapper, status-pill stable width, `tabular-nums` on
  the streaming time display. No more layout shift on first quote tick.
- **Hard-cut overlay transitions** — the four keyframes (`fade-in`, `slide-in-left`, `slide-in-right`,
  `pulse-subtle`) were referenced across the codebase but undefined except inside the reduced-motion
  override. Defining them at the document level restores the intended animations everywhere.
- **Skeletons** — three skeleton files rebuilt to match final shapes (eliminates skeleton-to-content
  pop on first render).

#### Files touched

`client/src/index.css`, `client/src/components/shared/Button.tsx`, `Toast.tsx`, `ErrorBoundary.tsx`,
`MockDataBanner.tsx`, `ConnectionStatus.tsx`, `BottomSheet.tsx`, `PullToRefresh.tsx`, `CommandPalette.tsx`;
`client/src/components/layout/Sidebar.tsx`, `Header.tsx`, `MobileNav.tsx`;
`client/src/components/auth/LoginForm.tsx`, `SignupForm.tsx`;
`client/src/components/portfolio/PortfolioOverview.tsx`;
`client/src/components/charts/EquityCurve.tsx`, `MarketStatusStrip.tsx`;
`client/src/components/help/HelpButton.tsx`, `HelpPanel.tsx`, `KeyboardHelpModal.tsx`;
`client/src/components/onboarding/WelcomeModal.tsx`, `FeatureTour.tsx`;
`client/src/pages/Landing.tsx`, `Dashboard.tsx`, `Pricing.tsx`, `Settings.tsx`, `APIKeys.tsx`,
`CVRF.tsx`, `Backtest.tsx`, `ML.tsx`, `Trading.tsx`, `Options.tsx`, `Earnings.tsx`, `Tax.tsx`,
`Help.tsx`, `Social.tsx`; plus 3 skeleton files.

**Production:** https://frontier-alpha.metaventionsai.com (deployed 2026-05-07).

---

## [1.0.4] - 2026-03-15

### Intelligence

- Wired CVRF belief system into portfolio optimizer — beliefs now directly constrain weight allocations and factor targets in real-time.

## [1.0.3] - 2026-03-10

### Performance

- UX optimization round 6: 100% CSS variable compliance across all remaining components, console cleanup, route prefetch hints, CLS prevention.
- UX optimization round 5: React.memo applied to expensive components; accessibility improvements.

### Bug Fixes

- UX optimization round 4: eliminated all remaining hardcoded hex/rgba colors; unified shared chart color palette.

## [1.0.2] - 2026-03-09

### UX

- UX optimization round 3: performance caching improvements, DRY refactors, form validation hardening.
- UX optimization round 2: dark mode chart fixes, page decomposition, form validation, mobile nav improvements.
- UX optimization pass: component decomposition, memoized charts, standardized animation curves, interaction polish.

### Bug Fixes

- Eliminated 255 of 260 remaining hardcoded `rgba()` values — full CSS variable compliance.

## [1.0.1] - 2026-03-07

### Platform

- Phase 1 marked complete — all Week 3–4 tasks done.
- Disabled Vercel auto-deploy to batch deploys and conserve build credits.

### PRD Completion

- All 31 PRD stories shipped: CSS variable compliance, skeleton loading states, micro-interactions.
- Fix `SkeletonProps` missing `style` prop — resolved Vercel build TS2322 error.

## [1.0.0] - 2026-02-19

### Design System

- Full migration to CSS variable design system — 46 components migrated in one pass, remaining pages and hooks migrated in follow-up.
- CSS variable compliance + animations + hover polish across 8 tabs.
- Tax, Options, Trading tabs: CSS variable compliance, staggered animations, hover polish.
- Eliminated 37 hardcoded colors from Options tab.
- Global animation `fill-mode` fix; eliminated all remaining hardcoded colors.

### Dashboard & Pages

- Dashboard upgrade to Bloomberg/Stripe standard — 6 stories: larger stat cards, cleaner donut center, calmer offline state.
- Portfolio page: icon stat cards, countUp animations, polished position table.
- Stat cards and animations upgraded across 6 pages — icon backgrounds, `animationFillMode`.
- Help, SharedPortfolio, and Alerts pages: staggered animations, CSS variable banners, refined table headers.
- Options, Tax, Settings, Social, Earnings, CVRF: icon stat cards, `lg:text-3xl` headers, `animationFillMode`.
- Added Appearance card to Settings (Light / Dark / System); fixed light-mode contrast on Pricing and Landing pages.
- Skeleton loading, Login light mode fix, accessibility polish (Tier 2/3).

### Trading Tab

- Upgraded to Bloomberg-grade execution terminal — 6 stories shipped.

### Bug Fixes

- `HelpTooltip` invisible in light mode — fixed with explicit dark background.
- Replaced last hardcoded `text-gray-500` with CSS variable in regime color fallback.
- Removed redundant `dark:` prefixes where CSS variables already handle both themes.
- Resolved TypeScript errors breaking CI build.

### WeightAllocation

- Updated `WeightAllocation` component; added README screenshots.

## [0.9.0] - 2026-02-18

### v2 World-Class Upgrade

- Complete v2 world-class upgrade — 16/16 remaining stories shipped.

## [0.8.0] - 2026-02-14

### Documentation

- Added modular architecture section to README (ZeroClaw-style subsystem breakdown).

## [0.7.0] - 2026-02-12

### v2 World-Class PRD — Full Completion

- All 30 PRD stories complete + 4 bonus pages.
- 30-story world-class PRD shipped: security hardening, infrastructure improvements, UX polish, CVRF enhancements.
- Resolved TypeScript build errors and cleaned `vercel.json` for deploy.
- Fixed env var hoisting in Zod validation tests (`vi.hoisted`).
- Fixed `ConvictionTimeline` crash when `cycle` is possibly `undefined`.

## [0.6.0] - 2026-02-09

### Branding & Infrastructure

- Gold standard README: Mermaid architecture diagram, animated dividers, HTML component cards.
- Added LICENSE and FUNDING.yml; updated all URLs to `metaventionsai.com` domain.
- Full README overhaul with Metaventions AI ecosystem branding (gem/diamond theme).
- Rebranded from cowboy to gem/diamond theme; fixed CI/CD pipeline.
- Switched CI deploy to manual-only to conserve Vercel build minutes.

## [0.5.0] - 2026-02-08

### Platform Launch

- Wired `ExplanationService` into Fastify server routes.
- Resolved strict TypeScript errors in client build.
- Merged `feat/live-data` branch into main.
- Added Phase 1 planning docs and session kickoff files.
- Phase 1 complete — full platform build (all 6 weeks).
- Added database migrations for CVRF tables, push subscriptions, and API keys.
- Added GitHub Actions CI/CD pipeline.
- Wired real-time quote streaming via WebSocket (Polygon.io).

---

## [0.1.0] - 2026-02-08

Phase 1 complete: Foundation through Platform Polish.

### Week 1 -- Foundation and Data Layer

- Initialized monorepo with Vite + React 19 client and Fastify server.
- Set up TypeScript configuration for both server and client.
- Integrated Polygon.io for real-time quotes and Alpha Vantage for fundamentals.
- Built MarketDataProvider with caching and fallback to mock data.
- Created initial Supabase schema: portfolios, positions, settings, alerts, quote cache, factor exposures, earnings events, historical prices, factor returns.
- Implemented Row Level Security (RLS) policies for all user-scoped tables.
- Added Supabase Auth with JWT Bearer token middleware.
- Created base API response envelope format.

### Week 2 -- Factor Engine and Portfolio Optimization

- Built Factor Engine calculating 80+ factor exposures across six categories (style, quality, volatility, sentiment, macro, sector).
- Integrated Ken French Data Library for academic factor returns.
- Implemented Monte Carlo portfolio optimizer with three strategies: max Sharpe, min variance, risk parity.
- Created portfolio CRUD endpoints (GET, POST positions, PUT, DELETE).
- Built factor exposure API with per-symbol and batch calculation.
- Added portfolio sharing migration and endpoints.

### Week 3 -- CVRF Core System

- Designed and implemented CVRF (Conceptual Verbal Reinforcement Framework) for belief evolution.
- Built CVRFManager with episode lifecycle: start, record decisions, close, compare, extract insights, update beliefs.
- Created PersistentCVRFManager backed by Supabase for durable state.
- Added CVRF API endpoints: beliefs, episodes, history, meta-prompt, constraints, risk assessment, decision recording.
- Implemented CVRF-optimizer integration: belief-aware weight constraints and factor targets.
- Built CVRF cycle history tracking with performance comparison and belief delta visualization.
- Added CVRF database migration (003_cvrf_tables.sql).

### Week 4 -- CVRF UI and Visualization

- Built CVRF dashboard page with episode timeline, belief state visualization, and cycle history.
- Created factor weight and confidence display components.
- Added regime indicator and risk tolerance gauge.
- Built meta-prompt display with optimization direction and key learnings.
- Implemented decision recording form within the CVRF interface.

### Week 5 -- Earnings Intelligence

- Built EarningsOracle with Alpha Vantage earnings calendar integration.
- Created earnings forecast endpoint with historical pattern analysis and expected move calculation.
- Added sector-aware volatility profiling for tech, financial, and healthcare stocks.
- Built earnings history endpoint with 8-quarter lookback and summary statistics (beat rate, avg move, avg beat/miss move).
- Implemented earnings calendar page with timeline view, report time indicators, and recommendation badges.
- Created AI-powered explanation endpoint (POST /api/v1/explain) with LLM enhancement (OpenAI) and template fallback.
- Added explanation caching per type and symbol per day.

### Week 6 -- Platform, Notifications, and Polish

- Implemented walk-forward backtest runner with configurable episodes, CVRF integration, and equity curve output.
- Built backtest page with strategy selection, date range, and result visualization.
- Integrated web-push notifications with VAPID keys and Supabase subscription storage.
- Created push subscription endpoints (subscribe, unsubscribe, send).
- Added push subscription database migration (004_push_subscriptions.sql).
- Built comprehensive health check endpoint with database, external API, and memory metrics.
- Created risk alert system with eight alert types (drawdown, volatility, concentration, correlation, factor drift, earnings risk, stop loss, take profit).
- Added user settings endpoints with risk tolerance, notification preferences, and position limits.
- Built shared UI component library: Button, Card, Badge, Spinner, Skeleton, Toast, PullToRefresh, BottomSheet, VisuallyHidden.
- Implemented ErrorBoundary with Sentry reporting and friendly error UI.
- Created EmptyState component with pre-built variants for portfolio, alerts, search, earnings, network error, and data load error.
- Added Sentry integration for client-side error tracking.
- Configured PWA with service worker for offline support.
- Set up Vercel deployment with serverless functions and SPA rewrite rules.
- Added Docker and docker-compose configuration.
- Added Railway deployment configuration.
- Created OpenAPI specification.
- Built landing page, login page, and onboarding flow.
- Added settings page, help page, and alert management.
- Created complete documentation: API reference, user guide, developer guide, and changelog.
