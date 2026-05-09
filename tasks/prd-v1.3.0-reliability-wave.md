[PRD]
# PRD: Frontier Alpha v1.3.0 — End-User Reliability Wave

## Overview

The v1.2.6 walkthrough on 2026-05-08/09 closed visible bugs but exposed deeper structural issues. Test counts and integration health flags lied: `740 tests passing` while `/api/v1/portfolio` returned 404 for every signed-in user; `9 of 11 integrations live` while four of those status lights were Boolean-checked rather than functionally validated. Every failure was a "boundary bug" — auth-to-API handoff, env-to-runtime contract, vendor-tier-to-quota expectation — that unit tests cannot catch.

This release closes that class of bug AND threads in five compounding patterns that turn each fix into reusable infrastructure. v1.3.0 is the work to make Frontier Alpha **end-user reliable AND structurally sustainable** so the next time someone walks the app, they don't find five fabricated demo numbers; AND so the next 12 months of development inherits machine-checkable contracts, reusable primitives, and shared observability/test infrastructure rather than starting from scratch each time.

Scope is reliability + integrity + sustainable structure. No new product features, no redesign, no paid-tier dependencies.

## Goals

- **Zero silent fabrication.** Every authed component is exactly one of: real-data | empty-state | banner-marked-demo. Type-level enforcement so leaks become TS errors, not runtime bugs.
- **Zero auth races on protected pages.** `/portfolio` and every Bearer-gated endpoint must return 200 on first paint for a signed-in user.
- **Zero lying integration health.** `/api/v1/health/integrations` makes a real upstream call per provider. All probes return identical JSON shape so alerting + runbooks can be uniform.
- **Zero stuck reconnect spinners.** Reusable `<DegradedService>` primitive applies to WS today, future degradations inherit it for free.
- **Zero invisible regressions.** Smoke tests and production observability share assertions and infrastructure — same code runs in CI and as synthetic monitors.
- **Catch the next env corruption automatically.** Schema-driven audit + CI hook detects drift; foundation for future auto-rotation.
- **Architecture documentation matches reality and STAYS matched.** Machine-checkable arch fingerprint (`arch.json`); CI fails on drift.
- **Compounding sustainability.** By the time US-009 ships, the codebase has 5 reusable primitives, 3 machine-checkable schemas, 1 documented state machine, and 1 ops runbook — none of which existed before.

## Quality Gates

These commands must pass for every user story:
- `npx tsc --noEmit` from project root (server)
- `cd client && npx tsc --noEmit` (client)
- `npx vitest run --reporter=basic` (full server suite)
- `node scripts/arch-scanner.mjs --check` (drift check, added in US-001)

For UI stories, also include:
- Sign in via Playwright as `dicoangelo+dev@metaventionsai.com / metaventions2026` and verify the page in a real browser session
- Capture before/after screenshots into `.audit-2026-05-08/walkthrough/v130/`
- Console must report 0 errors after first paint (excluding intermittent upstream rate limits, which must show graceful UI)

For server stories, also include:
- `curl` the deployed endpoint after deploy and verify expected status code + JSON shape
- Vercel + Railway both deploy clean

## Cross-Cutting Patterns

These five patterns thread INTO existing user stories. They are how each fix produces durable value beyond the immediate bug.

### P1 — Type-level contracts > runtime audits

When TypeScript or JSON Schema can make bad states unrepresentable, prefer that to runtime guards. Cheaper, catches regressions earlier, self-documenting.

- US-002: `DataSource<T>` discriminated union; rendering raw `T` becomes a TS error
- US-004: standardized `IntegrationProbeResult` interface; every probe must return that shape
- US-009: `env-schema.json` is the contract for every env var; new env in code without schema entry → CI fails

### P2 — Extract reusable primitives, not instance fixes

When fixing one place, identify whether the fix is needed in 3 places and build the abstraction. Pays back on stories 4-9.

- US-005: `<DegradedService>` reused by WS today, rate limiter and AI explainer in v1.4
- US-006: `src/data/cache/` (MemoryCache + SupabaseCache + CompositeCache) reused by quotes, factors, options chains
- US-007: `tests/integration/auth-helper.ts` reused by every protected-route test, smoke monitor, and sales-demo seeder

### P3 — Monitoring and tests share infrastructure

The same assertions run twice — in CI as smoke tests, in production as synthetic monitors. One codebase, two harnesses.

- US-007 ↔ US-008: integration smoke tests run on Vercel cron with results posted to Sentry. Test failures and prod incidents look identical.

### P4 — Machine-checkable schemas replace prose docs

Replace human-readable docs that drift with machine-readable contracts that CI checks.

- US-001: `arch.json` fingerprints route counts, integration claims, migration count
- US-007: `api-shape.json` declares expected response shape per protected route
- US-009: `env-schema.json` declares env var contracts

Each schema lives in `schemas/` directory at repo root; CI step verifies code against schema; PR adding new code without schema entry fails.

### P5 — Prewarm on idle, serve instant on demand

Compute proactively when server is idle (boot, cron, low-traffic windows) and serve from cache when users arrive. Critical for solo-user → first-real-user transition without paid-tier upgrades.

- US-006: cache-warmer prefetches top-held symbols on boot + hourly cron
- US-002: factor exposures for top-held symbols pre-computed; dashboard skips upstream call entirely on warm cache hit
- US-008: weekly digest data pre-aggregated nightly; user-facing endpoint just reads pre-computed row

## User Stories

### US-001: Re-anchor architecture documentation + introduce machine-checkable arch contract

**Description:** As an AI agent or human contributor opening the repo for the first time after the v1.2.x wave, I want `ARCHITECTURE.md`, `CONTEXT.md`, and a new `arch.json` fingerprint to accurately describe what's on disk so my mental model matches reality before I touch code — AND I want CI to fail when those docs drift again.

**Why first:** Every other story below makes architectural decisions. Those decisions are corrupted if the existing architecture map is stale. This is the foundational story. Run BEFORE all others.

**Files:** `ARCHITECTURE.md`, `CONTEXT.md`, `schemas/arch.json` (new), `scripts/arch-scanner.mjs` (new)

**Acceptance Criteria:**
- [ ] Run `find src -name "*.ts" | wc -l`, compare to ARCHITECTURE.md's claimed server file count, update if drift > 5%
- [ ] Run `grep -rE "fastify\.(get|post|put|delete|patch)" src/routes/*.ts | wc -l` and update the claimed endpoint count
- [ ] List every `src/routes/*.ts` module by name + one-line purpose; replace stale entries
- [ ] Confirm all claimed integrations in ARCHITECTURE.md still exist in code (grep file paths)
- [ ] Reconcile CONTEXT.md "Current State" against `package.json` version + `git log --oneline -20`
- [ ] Re-list `client/src/pages/*.tsx` against `App.tsx` route declarations — every Page has a Route, every Route has a Page
- [ ] Verify Supabase migration count matches CONTEXT.md
- [ ] Document the v1.2.6 fixes inventory: VITE env-newline trap, Polygon truncation, AV premium endpoint, CDN cache trap, fastify-websocket v8, hooks-after-early-return
- **P4 — machine-checkable schema:**
- [ ] New `scripts/arch-scanner.mjs` walks the repo and emits `schemas/arch.json` with: server file count, route count per module, client page count, integration list, migration count, package.json version
- [ ] CI command `node scripts/arch-scanner.mjs --check` exits 1 if HEAD's fingerprint differs from committed `schemas/arch.json` by > 5% on any metric
- [ ] PR template references the check; documentation drift PRs must regenerate `arch.json`
- **Operations runbook (folded in here, half-day):**
- [ ] Add `## Operations` section to CONTEXT.md covering: daily checks (5-min `/health/integrations` + smoke status ritual), weekly checks (env audit, error digest, deploy log), incident playbook (when /health says X is degraded → diagnostic ladder), upgrade triggers (link to `feedback_polygon_key_truncation.md` + `project_frontier_alpha_provider_tiers.md`)
- [ ] Add documented auth state machine diagram (text or mermaid): `uninitialized → loading → authed → expired → refreshing → authed | unauthed` — referenced by US-003

---

### US-002: Mock-data integrity + introduce DataSource type contract

**Description:** As a fresh user with $100K cash and zero positions, I want every authenticated page to render either my real numbers, a clear empty state, or a banner-marked demo — never silent fabrication. AND I want the type system to make mock-data leaks impossible to compile rather than relying on per-component runtime audits.

**Files:**
- `client/src/lib/dataSource.ts` (new)
- `client/src/pages/Dashboard.tsx`, `ML.tsx`, `Tax.tsx`, `Alerts.tsx`, `Social.tsx`, `Options.tsx`, `Earnings.tsx`
- `client/src/components/dashboard/*`, `client/src/components/ml/*`

**Acceptance Criteria:**
- **P1 — type-level contract:**
- [ ] New `client/src/lib/dataSource.ts` exports `type DataSource<T> = { kind: 'real'; value: T } | { kind: 'empty' } | { kind: 'demo'; value: T }`
- [ ] Helper `unwrapOrEmpty<T>(ds: DataSource<T>, empty: T): T` and `isReal<T>(ds: DataSource<T>): ds is { kind: 'real'; value: T }` for ergonomic usage
- [ ] Components that previously accepted raw numeric props (RiskMetrics, AIInsights, EquityCurve, FactorAttribution showcase, etc.) refactored to accept `DataSource<T>` and render the correct of three states based on `kind`
- **Per-page acceptance:**
- [ ] Dashboard with `positions.length === 0`: Risk Metrics shows `—` placeholders; AI Insights shows "Add positions" CTA; Equity Curve hides; Holdings table never shows demo NVDA/MSFT/AAPL
- [ ] ML page banner-wraps the regime detection output until real ML inference is wired (v1.4); render with `opacity-60` so the user sees a feature preview without thinking it's their data
- [ ] Tax YTD harvest card shows `$0` with explanation when user has no realized gains
- [ ] Alerts page: factor drift alerts hide entirely when no real factor exposures computed; SEC Filings shows empty-state instead of mock NVDA/MSFT events
- [ ] Social leaderboard banners as demo (already done v1.2.6); follow/unfollow still works
- [ ] Options chain shows "Connect a position to see live chain" empty state instead of mock 1.00/1.00 strikes
- [ ] Earnings page: verify already empty-state correct; banner-wrap if any mock leaks remain
- **P5 — prewarming for top symbols:**
- [ ] When the user has 1+ positions, factor exposures pre-computed for those symbols and cached in Supabase. Dashboard skips upstream factor call entirely on warm cache hit.
- **Live verification:**
- [ ] Sign in fresh, walk all 7 pages, screenshot each; console must show 0 mock-data leaks
- [ ] Negative test: a UI walking pass on a brand new account renders zero numeric values that aren't either real or banner-marked
- [ ] Type-level test: a component that omits `DataSource` declaration on numeric prop FAILS `npx tsc --noEmit`

---

### US-003: Auth lifecycle hardening + state machine documentation

**Description:** As a signed-in user reloading any protected page, I want the first API call to succeed with 200 and real data, not 401-fallback-to-empty-state because the auth store hadn't hydrated. AND I want the auth state machine documented as a checked diagram so the next person to touch this code understands the contract.

**Files:**
- `client/src/api/client.ts`
- `client/src/stores/authStore.ts`
- `client/src/components/auth/ProtectedRoute.tsx`
- `client/src/lib/supabase.ts`
- `ARCHITECTURE.md` (auth state machine diagram)

**Acceptance Criteria:**
- [ ] Audit current behavior: open `/dashboard?nocache=$(date +%s)` as fresh Playwright session, count 401 responses on first paint
- [ ] `ProtectedRoute` waits for `authStore.session` to be non-null OR explicitly resolved-as-null before rendering its children. Shows skeleton while waiting, NOT children
- [ ] `api.interceptors.request.use` retains its current Supabase fallback (added v1.2.6) AND adds explicit retry on 401: refresh session via `supabase.auth.refreshSession()`, replay the request once
- [ ] `authStore` exposes a new `isReady: boolean` flag that flips true when initial Supabase session-load completes
- [ ] Hooks gating data fetches use `enabled: useAuthStore(s => s.isReady)` so requests don't fire pre-hydration
- [ ] Edge case: an expired session triggers refresh transparently. No "401 → mock data" fallback when refresh is available
- **P4 — documented state machine:**
- [ ] ARCHITECTURE.md adds an "Auth State Machine" subsection: `uninitialized → loading → authed | unauthed → expired → refreshing → authed`
- [ ] Diagram references each state's predicate (e.g., `authed = isReady && session.access_token && !isExpired(session)`)
- [ ] Each state's allowed component renders documented (e.g., `loading`: skeleton only; `unauthed`: redirect to /login; `authed`: full app)
- **Live verification:**
- [ ] Smoke test: cold-reload `/dashboard`, `/portfolio`, `/cvrf`, `/factors` 10 times each — assert 0 of the first 5 requests per load return 401
- [ ] Playwright cold-load each protected route, capture 401 count from network trace; budget = 0

---

### US-004: Health probe upgrade + standardized result shape

**Description:** As an operator, I want `/api/v1/health/integrations` to validate that every claimed-live integration actually responds to a request. AND I want every integration entry to follow the same JSON shape so alerting, runbooks, and downstream tooling are uniform.

**Files:** `src/routes/health.ts`, `src/types/index.ts` (extend `IntegrationHealthEntry`)

**Acceptance Criteria:**
- **P1 — standardized shape:**
- [ ] `IntegrationHealthEntry` interface in `src/types/index.ts` extended to require: `{ status: 'live' | 'degraded' | 'offline'; latencyMs: number; lastError: string | null; lastSuccessAt: string | null; ttlSeconds: number; via?: string; provider?: string; mode?: string; reason?: string; fallback?: string }`
- [ ] Every existing integration entry in health.ts conforms; no per-provider ad-hoc fields
- [ ] Schema documented at `schemas/health-integration.json`; CI checks runtime response shape against schema
- **Per-integration probes:**
- [ ] Polygon: `/v2/aggs/ticker/AAPL/prev?apiKey=X` 3s timeout. `live` only when HTTP 200 AND `data.status === 'OK'`
- [ ] Alpha Vantage: `/query?function=GLOBAL_QUOTE&symbol=AAPL&apikey=X` 3s timeout. `live` only when no `Information`/`Note`/`Error Message` in response
- [ ] Stripe: `stripe.balance.retrieve()` 3s timeout. `live` only on no exception
- [ ] Resend: `resend.domains.list()` or similar cheap GET 3s timeout
- [ ] Supabase: `select 1` round-trip via supabaseAdmin
- [ ] Connect Alpaca: existing `isCryptoReady()` round-trip
- [ ] Weekly digest cron: HEAD to `/api/v1/digest/run?key=$CRON_SECRET` confirming gate auth works
- [ ] Polygon WebSocket: optional defer; keep existing "by-design degraded" entry
- **Performance:**
- [ ] All probes run in parallel via `Promise.all`, total endpoint latency < 4 seconds
- [ ] Probe results cached for 60s in process memory (`ttlSeconds: 60` in response) so `/health` isn't a fan-out on every hit
- **Live verification:**
- [ ] Corrupt Polygon key on a staging env, confirm `/health/integrations` flips Polygon to degraded within 60s with `lastError` populated
- [ ] Verify response JSON validates against `schemas/health-integration.json`

---

### US-005: WebSocket UX hardening + reusable DegradedService primitive

**Description:** As a user whose WebSocket failed, I want the connection banner to tell me what happened and offer a one-click reconnect. AND I want the visual + behavior pattern extracted into a reusable component so every future degraded service (rate limiter at capacity, AI explainer slow, billing webhook lag) inherits the affordance for free.

**Files:**
- `client/src/components/shared/DegradedService.tsx` (new)
- `client/src/components/shared/ConnectionStatus.tsx` (refactor to use DegradedService)
- `client/src/api/websocket.ts`

**Acceptance Criteria:**
- **P2 — reusable primitive:**
- [ ] New `DegradedService` component accepts: `{ service: string; reason: string; severity?: 'info' | 'warning' | 'error'; onRetry?: () => void; position?: 'pill-bottom-right' | 'banner-top' }`
- [ ] Pill-shaped, glass-slab, NOT loud. User should think "live updates off, polling instead" — not "data is wrong"
- [ ] Mobile-safe: `safe-area-inset` aware
- [ ] Storybook-style isolated test page at `/dev/degraded-service` (gated to localhost) for visual review
- **WebSocket-specific:**
- [ ] `ConnectionStatus` refactored to render `<DegradedService service="Live feed" reason={closeCodeReason} onRetry={resetWebSocket} />` instead of bespoke markup
- [ ] Terminal `offline` state shows close-reason tooltip (e.g. "WebSocket closed with code 1006") and "Reconnect" text button
- [ ] Clicking Reconnect calls new `wsClient.resetWebSocket()` — clears abandoned flag, resets failure counter, fresh handshake
- [ ] Successful reconnect → banner disappears within 5s; failed reconnect → returns to offline pill within 5s with updated reason
- **Live verification:**
- [ ] Disable network in DevTools → banner enters offline within 5s. Re-enable + click Reconnect → banner clears within 5s
- [ ] Mobile viewport (375×812): banner doesn't cover important content; positioned with safe-area-inset

---

### US-006: Provider rate-limit architecture + extracted cache module

**Description:** As any user loading the dashboard, I want all 5 holding sparklines to populate without 502s on the free Polygon tier. AND I want the cache logic extracted into a testable, reusable module that future features (factors, options chains, alerts) inherit instead of re-implementing.

**Files:**
- `src/data/cache/MemoryCache.ts` (new)
- `src/data/cache/SupabaseCache.ts` (new)
- `src/data/cache/CompositeCache.ts` (new)
- `src/data/cache/index.ts` (new exports)
- `src/data/MarketDataProvider.ts` (refactor to use new cache module)
- `src/data/CacheWarmer.ts` (new)
- `src/routes/quotes.ts` (no behavior change, but uses cache via MarketDataProvider)

**Acceptance Criteria:**
- **P2 — extracted cache module:**
- [ ] New `src/data/cache/` directory with three classes:
  - `MemoryCache<T>` — in-process Map with TTL, generic key/value
  - `SupabaseCache` — durable cache backed by `frontier_historical_prices` (existing) + new generic `frontier_cache_kv` table for non-prices
  - `CompositeCache<T>` — composes Memory in front of Supabase; handles cache hierarchies + fallback
- [ ] Each class testable in isolation; unit tests in `tests/unit/cache.test.ts` cover hit/miss/stale/eviction
- [ ] Cache exposes `hitCount`, `missCount`, `staleCount` counters consumed by US-008
- [ ] `MarketDataProvider.getHistoricalPrices` refactored to use `CompositeCache` instead of inline Map + ad-hoc Supabase reads
- [ ] `inflightHistoricalPrices` Map dedup (already in v1.2.6) preserved as a separate concern (request coalescing != caching)
- **Per-process bottleneck:**
- [ ] Max 4 concurrent Polygon calls in flight at a time (use `p-queue` or hand-roll)
- [ ] Excess requests queue FIFO; resolved in order
- **P5 — prewarming:**
- [ ] New `src/data/CacheWarmer.ts` exports `warmTopHeldSymbols(limit?: number)` which queries `frontier_positions` for the top N most-held symbols across all users and pre-fetches their historical prices into the cache
- [ ] Server boot (`src/index.ts`) calls `warmTopHeldSymbols(20)` on startup (non-blocking, fire-and-forget)
- [ ] Vercel cron `/api/v1/cron/warm-cache` (hourly) calls `warmTopHeldSymbols(20)` so cache stays hot across cold-starts
- [ ] Solo-user mode: also explicitly warms `dicoangelo+dev`'s portfolio symbols on boot — gives him instant dashboard load
- **Client-side:**
- [ ] HoldingsTable's `useQueries` fan-out: `staleTime: 5 * 60_000`, `refetchOnMount: false` — verify and tighten
- [ ] Optional client stagger: 100ms intervals between symbol fetches (server-side queue still primary)
- **Live verification:**
- [ ] Cold-load `/dashboard` 10 times, expect 0 quotes/history 502s across all loads
- [ ] Cache hit ratio observable via `/api/v1/health/integrations` (US-008 dependency)
- [ ] README "When you outgrow free tier" callout pointing to Polygon Starter ($29/mo) with the env var change documented

---

### US-007: Authenticated smoke tests + golden-state fixture + shared test infrastructure

**Description:** As a developer about to ship, I want CI to fail if any signed-in protected route returns 401, 404, 500, or known-mock-data. AND I want a canonical seeded test user ("golden state") used across smoke tests, sales screenshots, and support reproduction — so we never have to invent fixtures three times.

**Files:**
- `tests/integration/auth-helper.ts` (new)
- `tests/integration/protected-routes.test.ts` (new)
- `tests/fixtures/golden-state.sql` (new)
- `schemas/api-shape.json` (new — expected response shape per route)
- `package.json` scripts + `.github/workflows/*` (if exists)

**Acceptance Criteria:**
- **P2 — reusable test infrastructure:**
- [ ] `tests/integration/auth-helper.ts` exports `mintTestSession()` using Supabase admin to create-or-fetch dedicated test user `dicoangelo+test@metaventionsai.com`, returns valid JWT
- [ ] Same helper used by smoke tests AND production synthetic monitor (US-008)
- [ ] Golden state fixture `tests/fixtures/golden-state.sql` seeds: 5 real positions (NVDA/AAPL/MSFT/GOOGL/AMZN with realistic shares + cost basis), 2 realized lots in `frontier_realized_lots`, 3 alert rules, enterprise comp subscription. Idempotent (delete-then-insert). Documented in CONTEXT.md operations section as the canonical screenshot/repro state.
- **P4 — API shape schema:**
- [ ] New `schemas/api-shape.json` declares the expected response JSON shape for every authed endpoint (uses JSON Schema, not just TypeScript)
- [ ] Smoke tests validate response against the schema using `ajv` or similar — catches shape drift, not just status codes
- **Per-route assertions:**
- [ ] `tests/integration/protected-routes.test.ts` enumerates every protected route and asserts:
  - GET `/api/v1/portfolio` → 200, `success: true`, `data.positions: array`, `data.cash: number`, `data.totalValue: number`, fixture has 5 positions
  - GET `/api/v1/portfolio/factors/AAPL,NVDA` → 200 OR 200-with-skipped per US-001 v1.2.6
  - GET `/api/v1/quotes/AAPL/history?days=7` → 200, `data.closes: number[]` length 5–7
  - GET `/api/v1/cvrf/beliefs` → 200, `data: object`
  - GET `/api/v1/cvrf/stats` → 200, `data.factors.factorWeights: object` (catches v1.2.2 regression)
  - GET `/api/v1/health/integrations` → 200, every entry validates `IntegrationHealthEntry` schema (US-004)
  - GET `/api/v1/billing/subscription` → 200, `data.plan: 'enterprise'` for the comp test user
  - GET `/api/v1/broker/status` → 200, `data.broker: string`
  - GET `/api/v1/alerts` → 200, `data: array` length 3 (matches fixture)
  - GET `/api/v1/earnings/upcoming` → 200, `data: array`
  - GET `/api/v1/digest/run?key=$CRON_SECRET` → 200, `data: { sent, failed, skipped, total }`
- [ ] Each test verifies response shape AND that no `mockMode: true` leaks for the test user (whose data is real)
- **Cleanup:**
- [ ] Tests use the test user's portfolio data only; teardown removes any test-created rows
- **CI:**
- [ ] `npm run test:integration` script gated on `INTEGRATION=true` env var; default `npm run test` excludes it
- [ ] CI workflow runs `npm run test:integration` after deploy on staging URL; fails the deploy if any smoke fails
- **Live verification:**
- [ ] Deliberately revert v1.2.6 useDatabase fix and confirm test catches the 404
- [ ] Deliberately change `factorWeights` server response to `weights` and confirm test catches the shape regression

---

### US-008: Observability + error-rate dashboard + cron-driven smoke as synthetic monitor

**Description:** As an operator, I want to know within hours when production starts erroring instead of weeks. AND I want production observability and CI smoke tests to share infrastructure so the same assertions catch the same regressions in two harnesses.

**Files:**
- `src/observability/ErrorCounter.ts` (new — process-level error counter)
- `src/observability/RequestTracing.ts` (new — request-ID middleware)
- `src/routes/health-errors.ts` (new — `GET /api/v1/health/errors`)
- `src/routes/health-summary.ts` (new — weekly digest)
- `src/notifications/email-templates/weekly-health-digest.ts` (new)
- `vercel.json` (new cron entry for synthetic monitor)
- Possibly Sentry integration via `client/src/lib/sentry.ts`

**Acceptance Criteria:**
- **P3 — tests + observability share infra:**
- [ ] New cron route `GET /api/v1/cron/synthetic-monitor` (Vercel cron, every 15 min, gated by `CRON_SECRET`) runs the SAME `protected-routes.test.ts` assertions from US-007 against production
- [ ] Failures post to Sentry with severity warning (single failure) or error (3 consecutive failures)
- [ ] Synthetic monitor results visible at `GET /api/v1/health/synthetic` (last 24h pass/fail per route)
- **Server-side error counter:**
- [ ] Fastify `onError` hook increments per-route counter in `ErrorCounter` (process memory, reset hourly)
- [ ] New endpoint `GET /api/v1/health/errors` returns `{ route, count, lastError, lastSeen }[]` for last 1 hour. Service-role gated.
- **Request tracing:**
- [ ] New middleware: every Fastify request gets `X-Request-Id` header (use existing `request.id` from Fastify); attach to response
- [ ] Client `axios.interceptors` propagates `X-Request-Id` from response → console log → Sentry tag
- [ ] Sentry events tagged with request-id so client + server logs cross-reference
- **Sentry integration audit:**
- [ ] Audit `client/src/lib/sentry.ts`. If Sentry IS configured (`SENTRY_DSN` set), use its API for error-rate metrics; if not, the in-process counter is the only source
- [ ] Document the choice + DSN status in CONTEXT.md operations section
- **Weekly digest:**
- [ ] New cron route `GET /api/v1/digest/health-summary` (Sundays 13:00 UTC, gated by CRON_SECRET) emails operator a summary: error rates per route, synthetic monitor pass rate, cache hit ratio (from US-006), integration health changes
- [ ] Email template `weekly-health-digest` follows existing pattern in `src/notifications/email-templates/`
- **Live verification:**
- [ ] Deliberately throw on `/api/v1/portfolio` for 30 seconds; counter increments; `/health/errors` reports it within 60s; if Sentry configured, alert fires
- [ ] Synthetic monitor runs successfully against production within 15 min of deploy
- [ ] Weekly digest delivers a real email on first Sunday after merge

---

### US-009: Env audit script + schema-driven contract + CI hook

**Description:** As an operator, I want a one-shot script that audits every Vercel + Railway env value for trailing whitespace, length truncation, and quoted-empty values. AND I want a JSON Schema declaring every env var's contract so new envs require schema updates (caught in PR) and the audit becomes the foundation for future auto-rotation.

**Files:**
- `schemas/env-schema.json` (new — env var contract)
- `scripts/audit-env.mjs` (new — audit script)
- `.github/workflows/env-audit.yml` (new — CI hook)
- `CONTEXT.md` (operations section addition for rotation runbook)

**Acceptance Criteria:**
- **P1 + P4 — schema-driven contract:**
- [ ] `schemas/env-schema.json` declares every env var with: `{ name, required: bool, regex?, length?, sourceUrl?, lastVerified, description }`
- [ ] Initial schema covers all current production envs: SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY, POLYGON_API_KEY (length=32), ALPHA_VANTAGE_API_KEY, DEEPSEEK_API_KEY, OPENAI_API_KEY, STRIPE_SECRET_KEY (regex=^sk_), STRIPE_WEBHOOK_SECRET, EMAIL_API_KEY, EMAIL_PROVIDER, RESEND_FROM_EMAIL, BROKER_CRED_ENC_KEY (length=64, regex=^[a-f0-9]+$), CRON_SECRET (length=64, regex=^[a-f0-9]+$), VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, BILLING_ENABLED, FRONTEND_URL, all VITE_* vars
- [ ] CI step: any PR adding `process.env.X` references to `src/` or `client/src/` without matching schema entry FAILS with helpful error pointing to `schemas/env-schema.json`
- **Audit script:**
- [ ] `scripts/audit-env.mjs`:
  - `vercel env pull .env.audit --environment=production`
  - For each line: parse `KEY="VALUE"`, check VALUE for trailing `\n`, leading/trailing whitespace, quoted empty (`""`), and schema-declared length/regex
  - Print colored report: ✓ clean, ⚠ suspicious, ✗ corrupted
  - Exit 1 if any ✗
  - Cleanup: delete `.env.audit` in finally
- [ ] Same audit for Railway via `railway variables --json` (if CLI supports) or documented manual diff
- [ ] CI: `.github/workflows/env-audit.yml` runs the audit weekly; fails action on ✗
- **Operations runbook:**
- [ ] CONTEXT.md operations section adds rotation runbook: "key rotated → update Polygon dashboard → run `node scripts/audit-env.mjs --update KEY=NEW_VALUE` → script handles printf + Vercel env add + Railway mirror"
- [ ] Documents the printf-not-echo lesson with a script that enforces it
- **Live verification:**
- [ ] Corrupt `POLYGON_API_KEY` to 30 chars on staging, run script, confirm ✗ output and exit 1. Restore the correct key.
- [ ] Add a fake `process.env.NEW_VAR` reference to a TS file without updating schema, confirm CI fails

---

## Functional Requirements

- **FR-1:** Every signed-in user must see real data, an explicit empty state, or a `<MockDataBanner>`. No hardcoded numeric literals in component default state. Type-level enforced via `DataSource<T>`.
- **FR-2:** Every protected API route must return 200 on first paint for an authed user. No 401-then-retry as normal flow.
- **FR-3:** `/api/v1/health/integrations` must make a real upstream call per provider. All entries follow the standardized `IntegrationProbeResult` shape.
- **FR-4:** Production WebSocket failures must surface as a terminal "offline · polling fallback" pill within 30 seconds with manual reconnect, using the reusable `<DegradedService>` primitive.
- **FR-5:** Polygon free tier (5 req/min) must support the dashboard cold-load path with 0 user-facing 502s. Cache layer extracted as standalone module with hit/miss telemetry.
- **FR-6:** Integration smoke tests must run in CI per protected route AND on a 15-min cron as synthetic production monitors, sharing the same assertions.
- **FR-7:** Production error rates must be observable via `/api/v1/health/errors` and a weekly email digest. Request-ID tracing threaded client → server → Sentry.
- **FR-8:** Env values must be auditable via `node scripts/audit-env.mjs`; schema-declared contracts catch new envs without entries; CI fails on corruption.
- **FR-9:** ARCHITECTURE.md and CONTEXT.md must accurately reflect the on-disk codebase. `arch.json` machine-checkable fingerprint detects future drift.
- **FR-10:** CONTEXT.md must include an Operations section: daily rituals, weekly checks, incident playbook, rotation runbook, upgrade triggers.
- **FR-11:** Auth state machine must be documented in ARCHITECTURE.md with explicit predicates per state.

## Non-Goals (Out of Scope)

- New product features (Stripe annual tier, Connect Alpaca polish, mobile-only flows, Backtest enhancements). v1.4+.
- Performance optimization (Lighthouse, bundle size, render speed) beyond what's needed to support FR-5.
- Visual redesign or UI direction shifts. Family aesthetic stays.
- Paid-tier provider upgrades (Polygon Starter, Upstash Redis). User explicitly deferred until 2nd active user.
- Brand-new endpoints unrelated to observability or smoke testing.
- Replacing existing libraries (recharts, axios, etc.).
- Building a full alerting / paging system. Sentry + email digest is the v1.3 ceiling; PagerDuty is v1.4+.

## Technical Considerations

- Stack stays React 19 + Vite 7 + TypeScript 5.9 client, Fastify on Vercel + Railway server, Supabase persistence.
- Two-tier deploy: client + REST on Vercel, long-lived WS on Railway. Both must be tested.
- Vercel `vercel.json` cache strategy was fixed in v1.2.6 (commit `94a4431`) — no further cache changes required.
- The v1.2.6 walkthrough screenshots in `.audit-2026-05-08/walkthrough/` are the baseline for "before"; capture v1.3.0 "after" into `.audit-2026-05-08/walkthrough/v130/`.
- Supabase MCP is available for migrations + execute_sql. Use it for any schema work in US-006 (cache table, possibly errors table) and US-008.
- Existing `MockDataBanner` component already accepts `force`, `pageKey`, `dismissible`, `message` props — reuse for US-002.
- Test infrastructure already uses Vitest + MSW. Integration tests in US-007 should follow patterns from `tests/unit/crypto.test.ts` and `tests/unit/digest-metrics.test.ts`.
- Cross-project memories `feedback_vercel_env_newline.md` and `feedback_polygon_key_truncation.md` capture env-corruption lessons used by US-009.
- US-001 (arch refresh) MUST run BEFORE all other stories. Other stories can parallelize after it lands.
- New `schemas/` directory at repo root holds machine-checkable artifacts: `arch.json`, `env-schema.json`, `health-integration.json`, `api-shape.json`. Each schema owned by the corresponding US.
- The 5 cross-cutting patterns are CONSTRAINTS on implementation, not separate stories. Every US must check off any pattern that applies to it.

## Success Metrics

**Reliability targets (the floor):**
- Mock-data leak count: **0** on a fresh user walkthrough across all 12 protected pages
- Cold-load 401 count: **0** on `/dashboard`, `/portfolio`, `/cvrf`, `/factors`
- `/health/integrations` lying-status count: **0**
- WS stuck-spinner duration: **0 seconds** — terminal state within 30s
- Polygon 502s on cold dashboard load: **0** at solo-user traffic
- Authed integration smoke tests: **≥ 11 protected routes** all green in CI + synthetic monitor
- Operator alert lag: **< 24 hours** for sustained error spike (from 3+ weeks today)
- Env audit script exit 0 with current production envs
- ARCHITECTURE.md drift: **0%** when running `arch-scanner` against HEAD

**Sustainability outputs (the durable yield):**
- **5 reusable primitives** delivered: `DataSource<T>`, `DegradedService`, `MemoryCache`/`SupabaseCache`/`CompositeCache`, `auth-helper.mintTestSession()`, `RequestTracing` middleware
- **4 machine-checkable schemas** committed to `schemas/`: `arch.json`, `env-schema.json`, `health-integration.json`, `api-shape.json`
- **1 documented state machine** (auth lifecycle) in ARCHITECTURE.md
- **1 documented golden-state fixture** in `tests/fixtures/golden-state.sql` reused across smoke tests, screenshots, and support
- **1 operations runbook** in CONTEXT.md covering daily/weekly checks + incident playbook + rotation runbook + upgrade triggers
- **Synthetic monitor** running production smoke tests on 15-min cron sharing US-007 assertions

## Open Questions

- US-006: Pre-warming "top 20 most-held symbols" — across all users (privacy: leaks symbol popularity to anyone reading cache) or scoped per-user (more storage, less efficient)? Default to "across all users, public symbols only" but flag for review when 2nd user joins.
- US-008: Is Sentry already configured in production? Audit `client/src/lib/sentry.ts` and `SENTRY_DSN` env before deciding implementation path. If configured, use its query API; if not, in-process counter is sole source.
- US-007: Does the test runner need Supabase service-role access in CI? Document the env requirement; use a long-lived test user with hardcoded credentials in `.env.test` if simpler.
- US-002: When ML page banners regime detection as demo, do we leave the visual chart with `opacity-60` (recommended) or hide entirely? Default to opacity-60 + banner — feature preview without lying.
- US-009: Should `audit-env.mjs --update` actually rotate keys (write to Vercel + Railway) or just lint? v1.3.0 = lint only. v1.4 = full rotation automation once schema is canonical.
- All US: should the `schemas/` directory be published as a separate package eventually so external monitoring/consumers can validate against the same contracts? Out of scope for v1.3.0; flag for v1.4+.
[/PRD]
