[PRD]
# PRD: Frontier Alpha v1.3.0 — End-User Reliability Wave

## Overview

The v1.2.6 walkthrough on 2026-05-08/09 closed visible bugs but exposed deeper structural issues. Test counts and integration health flags lied: `740 tests passing` while `/api/v1/portfolio` returned 404 for every signed-in user; `9 of 11 integrations live` while four of those status lights were Boolean-checked rather than functionally validated. Every failure was a "boundary bug" — auth-to-API handoff, env-to-runtime contract, vendor-tier-to-quota expectation — that unit tests cannot catch.

This release closes that class of bug. v1.3.0 is the work to make Frontier Alpha **end-user reliable** so the next time someone walks the app, they don't find five fabricated demo numbers and three silent 401/502 errors. Scope is reliability and integrity only — no new features, no redesign, no paid-tier dependencies.

## Goals

- **Zero silent fabrication.** Every authed component is exactly one of: real-data | empty-state | banner-marked-demo. No more "$125,000 portfolio" rendering when the user has $0 of positions.
- **Zero auth races on protected pages.** `/portfolio` and every Bearer-gated endpoint must return 200 on first paint for a signed-in user, not 401-then-retry.
- **Zero lying integration health.** `GET /api/v1/health/integrations` makes a real upstream call per provider before reporting `live`.
- **Zero stuck reconnect spinners.** WebSocket UX must enter a terminal state (live, offline-with-reason, or feed-degraded) within 30 seconds of any failure, with a manual reconnect affordance.
- **Zero invisible regressions.** Smoke tests sign in, hit every authed route, and assert 200 + expected shape; CI breaks if any of them returns mock or fails.
- **Catch the next env corruption automatically.** A scheduled audit + CI hook detects trailing newlines, length truncation, and quoted-empty values across Vercel + Railway envs.
- **Architecture documentation matches reality.** ARCHITECTURE.md and the on-disk codebase map agree at the file level after the v1.2.x integration wave + walkthrough fixes.

## Quality Gates

These commands must pass for every user story:
- `npx tsc --noEmit` from project root (server)
- `cd client && npx tsc --noEmit` (client)
- `npx vitest run --reporter=basic` (full server suite, currently 740 passing)

For UI stories, also include:
- Sign in via Playwright as `dicoangelo+dev@metaventionsai.com / metaventions2026` and verify the page in a real browser session
- Capture before/after screenshots into `.audit-2026-05-08/walkthrough/v130/`
- Console must report 0 errors after first paint (excluding intermittent upstream rate limits, which must show graceful UI)

For server stories, also include:
- `curl` the deployed endpoint after deploy and verify expected status code + JSON shape
- Vercel + Railway both deploy clean (no build errors)

## User Stories

### US-001: Re-anchor architecture documentation to current codebase

**Description:** As an AI agent or human contributor opening the repo for the first time after the v1.2.x wave, I want `ARCHITECTURE.md` and `CONTEXT.md` to accurately describe what's on disk so my mental model matches reality before I touch code.

**Why first:** Every other story below makes architectural decisions (where to wire health probes, where to introduce smoke tests, where the boundary between client and server lives). Those decisions are corrupted if the existing architecture map is stale. Run this BEFORE any other US.

**Files:** `ARCHITECTURE.md`, `CONTEXT.md`, possibly a regenerated `arch-scanner` output

**Acceptance Criteria:**
- [ ] Run `find src -name "*.ts" | wc -l`, compare to ARCHITECTURE.md's claimed server file count, update if drift > 5%
- [ ] Run `grep -rE "fastify\.(get|post|put|delete|patch)" src/routes/*.ts | wc -l` and update the claimed endpoint count if drift
- [ ] List every `src/routes/*.ts` module by name + one-line purpose; replace any stale entries
- [ ] Confirm all claimed integrations in `ARCHITECTURE.md` § "Backend Integrations" still exist in code (grep for the file paths it references)
- [ ] Reconcile `CONTEXT.md` § "Current State" against `package.json` version and the most recent `git log --oneline -20`
- [ ] Re-list `client/src/pages/*.tsx` against `App.tsx` route declarations — every Page component must have a `<Route>`; every `<Route>` must have a Page
- [ ] Verify Supabase migration count (`ls supabase/migrations/ | wc -l`) matches CONTEXT.md
- [ ] Document the v1.2.6 fixes inventory: VITE env-newline trap, Polygon truncation, AV premium endpoint, CDN cache trap, fastify-websocket v8, hooks-after-early-return — these all happened between the last arch refresh and now

---

### US-002: Mock-data integrity — Dashboard, ML, Tax, Alerts, Social, Options, Earnings

**Description:** As a fresh user with $100K cash and zero positions, I want every authenticated page to render either my real numbers, a clear empty state, or a banner-marked demo — never silent fabrication that I might mistake for my actual data.

**Files:**
- `client/src/pages/Dashboard.tsx` (Risk Metrics, AI Insights, Equity Curve, Holdings table)
- `client/src/pages/ML.tsx` (regime detection, factor attribution showcase)
- `client/src/pages/Tax.tsx` (YTD harvest, savings cards)
- `client/src/pages/Alerts.tsx` (factor drift, SEC filings)
- `client/src/pages/Social.tsx` (leaderboard rows)
- `client/src/pages/Options.tsx` (placeholder bid/ask prices)
- `client/src/pages/Earnings.tsx` (verify already empty-state correct)
- `client/src/components/dashboard/*`, `client/src/components/ml/*`

**Acceptance Criteria:**
- [ ] Audit each page above: list every component that renders numeric/string content. For each, identify its data source (API call, props, hardcoded literal)
- [ ] Every hardcoded literal that COULD be mistaken for user data is either: (a) replaced with empty-state, (b) wrapped in a clearly-labeled `<MockDataBanner>` block, or (c) deleted if it's lorem-ipsum
- [ ] Dashboard with `positions.length === 0`: Risk Metrics card hides or shows `—` placeholders with disabled state; AI Insights hides or shows "Add positions to get insights" CTA; Equity Curve hides
- [ ] Dashboard "Holdings" table never shows demo NVDA/MSFT/etc when user has 0 positions
- [ ] ML page banner-wraps the regime detection output (62.7% Bull, etc.) until real ML inference is wired — that's a v1.4 task not here
- [ ] Tax YTD harvest card shows `$0` with explanation when user has no realized gains, instead of `$9,189.48` mock
- [ ] Alerts: factor drift alerts hide entirely when there are no real factor exposures computed; SEC Filings tab shows empty-state instead of mock NVDA/MSFT events
- [ ] Social leaderboard banners as demo (already done v1.2.6); follow/unfollow still works against the demo data
- [ ] Options chain shows "Connect a position to see live chain" empty state instead of mock 1.00/1.00 strikes
- [ ] Live verification: sign in fresh, walk all 7 pages, screenshot each, console must show 0 mock-data leaks
- [ ] Negative test: a UI walking pass on a brand new account must render zero numeric values that aren't either real or banner-marked

---

### US-003: Auth lifecycle — eliminate the cold-load 401 race

**Description:** As a signed-in user reloading any protected page, I want the first API call to succeed with 200 and real data, not 401-fallback-to-empty-state because the auth store hadn't hydrated.

**Files:**
- `client/src/api/client.ts`
- `client/src/stores/authStore.ts`
- `client/src/components/auth/ProtectedRoute.tsx`
- `client/src/lib/supabase.ts`

**Acceptance Criteria:**
- [ ] Audit current behavior: open `/dashboard?nocache=$(date +%s)` as fresh Playwright session, count 401 responses on first paint
- [ ] `ProtectedRoute` waits for `authStore.session` to be non-null OR explicitly resolved-as-null before rendering its children. While waiting it shows the existing skeleton/spinner, NOT children
- [ ] `api.interceptors.request.use` retains its current Supabase fallback (already added v1.2.6) but adds explicit retry on 401: refresh session via `supabase.auth.refreshSession()`, replay the request once
- [ ] `authStore` exposes a new `isReady: boolean` flag that flips true when the initial Supabase session-load has completed (success or null)
- [ ] Hooks gating data fetches (`useQuery`, etc.) use `enabled: useAuthStore(s => s.isReady)` so requests don't fire pre-hydration
- [ ] Smoke test: cold-reload `/dashboard`, `/portfolio`, `/cvrf`, `/factors` — assert exactly 0 of the first 5 requests return 401
- [ ] Edge case: a session that has expired (Supabase token TTL passed) triggers refresh transparently. No "401 → mock data" fallback when refresh is available
- [ ] Live verification: Playwright cold-load each protected route 10 times, capture 401 count from network trace; budget = 0

---

### US-004: Health probe upgrade — real upstream calls, not Boolean(env)

**Description:** As an operator, I want `/api/v1/health/integrations` to validate that every claimed-live integration actually responds to a request, not just that the env var is set. We had four lying status lights this session.

**Files:** `src/routes/health.ts`

**Acceptance Criteria:**
- [ ] For Polygon: call `/v2/aggs/ticker/AAPL/prev?apiKey=X` with a 3s timeout. Status `live` only when HTTP 200 AND `data.status === 'OK'`. Status `degraded` with reason on `Unknown API Key` or rate-limit response
- [ ] For Alpha Vantage: call `/query?function=GLOBAL_QUOTE&symbol=AAPL&apikey=X` with 3s timeout. Status `live` only when no `Information` / `Note` / `Error Message` in response body
- [ ] For Stripe: call `stripe.balance.retrieve()` (cheapest paid endpoint). Status `live` only when no exception
- [ ] For Resend: call `resend.domains.list()` or similar cheap GET. Status `live` only on 200
- [ ] For Supabase: do a `select 1` round-trip via supabaseAdmin (existing connection)
- [ ] For Polygon WebSocket: optional — defer or just keep the existing "by-design degraded" entry
- [ ] Probes run in parallel via `Promise.all`, total endpoint latency budget < 4 seconds
- [ ] Probe results cached for 60 seconds in process memory so `/health` isn't a full-fan-out on every hit
- [ ] When `BROKER_CRED_ENC_KEY` is set, run the existing `isCryptoReady()` round-trip (already shipped v1.2.3)
- [ ] When `CRON_SECRET` is set, do a HEAD to `/api/v1/digest/run` with the secret to confirm gate auth works
- [ ] Response shape unchanged from current — just the values become honest
- [ ] Live verification: corrupt the Polygon key on a staging env, confirm `/health/integrations` flips Polygon to degraded within 60s

---

### US-005: WebSocket UX hardening — manual reconnect + reason

**Description:** As a user whose WebSocket failed, I want the connection banner to tell me what happened and offer a one-click reconnect, instead of either hiding the problem or yelling "Reconnecting · 1 · 1s" forever.

**Files:** `client/src/components/shared/ConnectionStatus.tsx`, `client/src/api/websocket.ts`

**Acceptance Criteria:**
- [ ] Terminal `offline` state shows: red dot, "Live feed offline · using polling fallback" copy, close-reason tooltip on hover (e.g. "WebSocket closed with code 1006"), and a "Reconnect" text button
- [ ] Clicking "Reconnect" calls `wsClient.resetWebSocket()` (new method) which clears the abandoned flag, resets failure counter, and attempts a fresh handshake
- [ ] If the manual reconnect succeeds, banner disappears (back to normal "live"); if it fails, returns to offline pill within 5 seconds with updated close-reason
- [ ] Banner is not the loud full-width type-rail used for actual errors — make it pill-shaped, glass-slab, dim. The user should NOT think their data is wrong; they should think "live updates are off, polling instead"
- [ ] Mobile: banner doesn't cover important content; positioned bottom-right with safe-area-inset
- [ ] Live verification: Disable network in DevTools → banner enters offline within 5s. Re-enable network + click Reconnect → banner clears within 5s

---

### US-006: Provider rate-limit architecture — survive parallel dashboard fans

**Description:** As any user loading the dashboard, I want all 5 holding sparklines to populate without 502s, even on the free Polygon tier. We hit the 5/min cap on every cold load right now.

**Files:** `src/data/MarketDataProvider.ts`, `src/routes/quotes.ts`, possibly new `src/data/CacheWarmer.ts`

**Acceptance Criteria:**
- [ ] `inflightHistoricalPrices` Map dedup (already in v1.2.6) — verify it's still in place
- [ ] Add a per-process bottleneck: max 4 concurrent Polygon calls in flight at a time. Excess requests queue and resolve in FIFO order. Use a small library (`p-queue`) or hand-roll
- [ ] Persistent cache improvement: on every successful Polygon fetch, write the rows to `frontier_historical_prices` Supabase table with an `expires_at = now() + 1 day`. Subsequent reads check the table BEFORE Polygon
- [ ] New `CacheWarmer` daemon stub: on server boot (`src/index.ts`) and on Vercel cron (every hour), pre-fetch the top 20 most-held symbols across all `frontier_portfolios.symbol` so cache is hot before users arrive
- [ ] Client-side: HoldingsTable's `useQueries` fan-out should `staleTime: 5 * 60_000` and `refetchOnMount: false` — don't refetch on every tab switch. (Already partly true; verify and tighten)
- [ ] Optional client stagger: send the 5 history requests at 100ms intervals instead of all-parallel, so the server-side queue doesn't have to do all the work
- [ ] Live verification: cold-load `/dashboard` with 5 holdings, expect 0 quotes/history 502s. Repeat 10× — error count must be 0
- [ ] Documented upgrade path: README has a "When you outgrow free tier" callout pointing to Polygon Starter ($29/mo, 100 req/min) and explaining the env var change

---

### US-007: Authenticated smoke tests for every protected route

**Description:** As a developer about to ship, I want CI to fail if any signed-in protected route returns 401, 404, 500, or known-mock-data. The 740-tests-passing-while-portfolio-404s situation must be impossible going forward.

**Files:** `tests/integration/` (new directory), possibly `tests/integration/auth-helper.ts`

**Acceptance Criteria:**
- [ ] New helper `tests/integration/auth-helper.ts` — exports `mintTestSession()` that uses Supabase admin to create-or-fetch a dedicated test user, returns a valid JWT
- [ ] Test file `tests/integration/protected-routes.test.ts` enumerates every protected route and asserts:
  - GET `/api/v1/portfolio` → 200 with `{ success: true, data: { positions: [...] } }`
  - GET `/api/v1/portfolio/factors/AAPL,NVDA` → 200 OR 200-with-skipped (per US-001 v1.2.6)
  - GET `/api/v1/quotes/AAPL/history?days=7` → 200 with `closes: number[]` length 5–7
  - GET `/api/v1/cvrf/beliefs` → 200 with `{ success: true, data: ... }`
  - GET `/api/v1/cvrf/stats` → 200 with `factors.factorWeights` (the shape mismatch from US-002 v1.2.6 — the test catches that regression)
  - GET `/api/v1/health/integrations` → 200 with the expected `summary` shape and `integrations` keys
  - GET `/api/v1/billing/subscription` → 200 with current plan
  - GET `/api/v1/broker/status` → 200 with broker kind
  - GET `/api/v1/alerts` → 200 with array
  - GET `/api/v1/earnings/upcoming` → 200 with array
  - GET `/api/v1/digest/run?key=$CRON_SECRET` → 200 with summary
- [ ] Each test verifies the response shape AND that no `mockMode: true` flag is leaking when the test user has real data
- [ ] Tests use the test user's portfolio data fixtures, not the dev account's. Cleanup-on-teardown so they don't pollute production
- [ ] CI step `npm run test:integration` added to `.github/workflows/*` (if it exists, otherwise to `package.json` scripts)
- [ ] Existing `npm run test` continues to pass without integration tests (they're a separate command, gated on `INTEGRATION=true` env or similar)
- [ ] Live verification: deliberately revert the v1.2.6 useDatabase fix and confirm the test catches the 404

---

### US-008: Observability — error-rate dashboard + weekly digest

**Description:** As an operator, I want to know within hours when production starts erroring instead of weeks. The "Reconnecting · 1 · 1s" stuck state went 3+ weeks unnoticed because no one was watching error rates.

**Files:** `src/observability/` (new metrics module), possibly Sentry webhook + Vercel cron

**Acceptance Criteria:**
- [ ] Server-side error counter: every Fastify `onError` hook increments a per-route counter in process memory (or Supabase if we want durable). Reset hourly
- [ ] New endpoint `GET /api/v1/health/errors` returns `{ route, count, lastError, lastSeen }[]` for the last 1 hour. Service-role gated
- [ ] If using Sentry already (verify `client/src/lib/sentry.ts`): create a Sentry alert rule that fires when `error.count > 50` in 15 minutes. Documented in CONTEXT.md
- [ ] New weekly cron route `GET /api/v1/digest/health-summary` (Vercel cron, Sundays 13:00 UTC, gated by `CRON_SECRET`) that emails the operator (`dicoangelo@metaventionsai.com`) a summary of the past week's error rates per route
- [ ] Email template `weekly-health-digest` follows existing pattern (`src/notifications/email-templates/`)
- [ ] Live verification: deliberately throw on `/api/v1/portfolio` for 30 seconds, confirm error counter increments, confirm `/health/errors` reports it

---

### US-009: Env value audit — script + CI check

**Description:** As an operator, I want a one-shot script that audits every Vercel + Railway env value for trailing whitespace, length truncation, and quoted-empty values; and a CI hook that catches new corruptions before they ship.

**Files:** `scripts/audit-env.mjs` (new), `.github/workflows/env-audit.yml` (new)

**Acceptance Criteria:**
- [ ] `scripts/audit-env.mjs` does:
  - `vercel env pull .env.audit --environment=production`
  - For every line: parse `KEY="VALUE"`, check `VALUE` for trailing `\n`, leading/trailing whitespace, quoted empty (`""`), and (for known keys) expected length
  - Known-length checks: `BROKER_CRED_ENC_KEY` must be exactly 64 hex chars, `CRON_SECRET` must be exactly 64 hex chars, `POLYGON_API_KEY` 32 chars, `STRIPE_SECRET_KEY` starts with `sk_live_` or `sk_test_`
  - Print a colored report: ✓ clean, ⚠ suspicious (trailing whitespace), ✗ corrupted (length mismatch)
  - Exit 1 if any ✗
- [ ] Script does the same audit for Railway via `railway variables --json` (if CLI supports JSON output) OR a documented manual step
- [ ] Cleans up `.env.audit` on exit (delete file in finally)
- [ ] Documented in README under "Operations" section
- [ ] Optional CI: GitHub Action runs the audit on a Vercel deploy hook OR weekly schedule. Fails the action if exit code != 0
- [ ] Live verification: corrupt `POLYGON_API_KEY` to 30 chars, run script, confirm ✗ output and exit 1. Restore the correct key

---

## Functional Requirements

- **FR-1:** Every signed-in user must see real data, an explicit empty state, or a `<MockDataBanner>` on every authenticated page. No hardcoded numeric literals in component default state.
- **FR-2:** Every protected API route must return 200 on first paint for an authed user with valid Supabase session in localStorage. No 401-then-retry as a normal flow.
- **FR-3:** `/api/v1/health/integrations` must make a real upstream call per provider. Probe results cached for 60s.
- **FR-4:** Production WebSocket failures must surface as a terminal "offline · polling fallback" pill within 30 seconds with manual reconnect.
- **FR-5:** Polygon free tier (5 req/min) must support the dashboard cold-load path without any HTTP 502s reaching the user.
- **FR-6:** Integration smoke tests must run in CI per protected route, asserting 200 + expected shape.
- **FR-7:** Production error rates must be observable via `GET /api/v1/health/errors` and a weekly email digest.
- **FR-8:** Env values must be auditable on demand via `node scripts/audit-env.mjs`; corruption (trailing newline, length mismatch) must fail audit with exit 1.
- **FR-9:** ARCHITECTURE.md and CONTEXT.md must accurately reflect the on-disk codebase as of this PRD.

## Non-Goals (Out of Scope)

- New product features (Stripe annual tier, Connect Alpaca polish, mobile-only flows, Backtest enhancements). Those are v1.4+.
- Performance optimization (Lighthouse score, bundle size, render speed).
- Visual redesign or UI direction shifts. Family aesthetic stays.
- Paid-tier provider upgrades (Polygon Starter $29/mo, Upstash Redis). User explicitly deferred until 2nd active user.
- Brand new endpoints unrelated to the bugs above.
- Replacing existing libraries (recharts, axios, etc.).

## Technical Considerations

- Stack stays React 19 + Vite 7 + TypeScript 5.9 client, Fastify on Vercel + Railway server, Supabase persistence.
- Two-tier deploy: client + REST on Vercel, long-lived WS on Railway. Both must be tested in this release.
- Vercel `vercel.json` cache strategy was fixed in v1.2.6 (commit `94a4431`) — no further cache changes required unless a new bug surfaces.
- The v1.2.6 walkthrough screenshots in `.audit-2026-05-08/walkthrough/` are the baseline for "before" — capture v1.3.0 "after" into `.audit-2026-05-08/walkthrough/v130/`.
- Supabase MCP is available for migrations + execute_sql. Use it for any schema work in US-006 (cache table, errors table) and US-008.
- Existing `MockDataBanner` component (`client/src/components/shared/MockDataBanner.tsx`) accepts `force`, `pageKey`, `dismissible`, `message` props — reuse for US-002.
- Test infrastructure already uses Vitest + MSW. Integration tests in US-007 should follow same patterns from `tests/unit/crypto.test.ts` and `tests/unit/digest-metrics.test.ts`.
- `feedback_vercel_env_newline.md` and `feedback_polygon_key_truncation.md` cross-project memories already capture the env-corruption lessons for the audit script (US-009).
- US-001 (arch refresh) MUST run BEFORE all other stories. Other stories can parallelize after it lands.

## Success Metrics

- **Mock-data leak count: 0** on a fresh user walkthrough across all 12 protected pages (down from 6+ pages today).
- **Cold-load 401 count: 0** on `/dashboard`, `/portfolio`, `/cvrf`, `/factors` (down from 1 per page today).
- **`/health/integrations` lying-status count: 0** (down from 4 in v1.2.6).
- **WS stuck-spinner duration: 0 seconds.** Banner enters terminal state within 30s.
- **Polygon 502s on cold dashboard load: 0** at solo-user traffic (down from 4-5 per load).
- **Authed integration smoke tests: ≥ 11 protected routes** all green in CI.
- **Operator alert lag: < 24 hours** for any sustained error spike (down from 3+ weeks).
- **Env audit script exit 0** with current production envs.
- **ARCHITECTURE.md drift: 0%** when running `arch-scanner` against HEAD.

## Open Questions

- US-006: Pre-warming cache for "top 20 most-held symbols" — is that across all users (privacy concern: leaks symbol popularity to anyone reading cache) or scoped per-user (more storage, less efficient)? Default to "across all users, public symbols only" but flag for review.
- US-008: Sentry vs in-process counter — does Frontier Alpha already have Sentry configured in production? Audit `client/src/lib/sentry.ts` and `SENTRY_DSN` env before deciding the implementation. If Sentry IS configured, use its query API instead of rolling our own counter.
- US-007: Does the test runner need Supabase service-role access in CI (to mint sessions)? If yes, document the env requirement; if not, use a long-lived test user with hardcoded credentials in `.env.test`.
- US-002: When ML page banners regime detection as demo, do we leave the visual chart/cards or hide them entirely? Recommendation: keep the visual but render with `opacity-60` + banner — gives the user a feature preview without lying about state.
[/PRD]
