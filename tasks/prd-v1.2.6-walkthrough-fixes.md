[PRD]
# PRD: Frontier Alpha v1.2.6 — End-User Walkthrough Fixes

## Overview

Live walkthrough of the production app on 2026-05-08 (account `dicoangelo+dev@metaventionsai.com`, enterprise comp) surfaced 7 production bugs and a cross-cutting "mock-data-leak" UX problem documented in `.audit-2026-05-08/walkthrough/AUDIT.md`. Two issues were already fixed inline (Portfolio API 404, React error #310 hooks order). This release closes the rest.

The unifying problem: every authenticated page on Frontier Alpha renders convincing-looking demo numbers even when the user has zero positions or the API errored. For a fresh user this is misleading. We will replace the leak with proper empty states and a `MockDataBanner` on every demo-data path.

## Goals

- Every authenticated page either shows real data, an explicit empty state, or a `MockDataBanner` — never silent fake numbers.
- Two hard crashes (CVRF page, factors endpoint 500) become graceful degraded states.
- WebSocket banner reflects reality (live or known-degraded), not a permanent "Reconnecting · 1 · 1s" loop.
- Backtest is reachable from the sidebar.
- Greeting renders the user's name without `+suffix` aliases bleeding through.

## Quality Gates

These commands must pass for every user story:
- `npx tsc --noEmit` (server) — must report no errors
- `cd client && npx tsc --noEmit` (client) — must report no errors
- `npx vitest run --reporter=basic` — all tests pass (currently 740/740)

For UI stories, also include:
- Verify the fixed page in the live deploy with Playwright MCP — capture before/after screenshots in `.audit-2026-05-08/walkthrough/v126/` directory
- Console must report 0 errors after navigation

For API stories, also include:
- `curl` the production endpoint and verify expected status code

## User Stories

### US-001: Fix `/api/v1/portfolio/factors/:symbols` 500 with per-symbol resilience

**Description:** As an authenticated user, I want the factors page to load even when one of my tickers fails to fetch historical prices, so that a single bad ticker does not blank the whole page.

**File:** `src/routes/portfolio.ts` (lines 331–368, the `GET /api/v1/portfolio/factors/:symbols` handler)

**Acceptance Criteria:**
- [ ] Per-symbol `getHistoricalPrices()` call is wrapped in try/catch
- [ ] Failed symbols are logged via `logger.warn({ err, symbol }, 'factors: skipping symbol')` and excluded from the `prices` map
- [ ] If at least one symbol resolves, response returns 200 with the partial result
- [ ] If every symbol fails, response is 500 with `{ code: 'NO_FACTOR_DATA', message: 'All symbol fetches failed', skipped: [...] }`
- [ ] Response shape includes a new optional `meta.skipped: string[]` array listing failed symbols when non-empty
- [ ] Live verification: navigate to `/factors` while signed in as `dicoangelo+dev@metaventionsai.com`, confirm the page renders factor cards instead of "Couldn't load data"

---

### US-002: Fix CVRF page ErrorBoundary crash

**Description:** As an authenticated user, I want the CVRF page to render (or show a graceful empty state) instead of the full-page "Something went wrong" screen.

**File:** `client/src/pages/CVRF.tsx` and any child component flagged in the Sentry stack

**Acceptance Criteria:**
- [ ] Reproduce the crash in Playwright by signing in and navigating to `/cvrf`. Capture the Sentry error ID and full stack
- [ ] Identify the root cause (likely either hook-order issue similar to Portfolio US-2 or unhandled API response shape from `/api/v1/cvrf/beliefs`)
- [ ] Fix the underlying error
- [ ] Wrap any remaining unsafe access in optional chaining + `.map(...) ?? []` patterns
- [ ] Add a fallback empty state when the CVRF manager has zero beliefs (which is the case for a fresh user)
- [ ] Live verification: `/cvrf` renders without the ErrorBoundary catch, console shows 0 errors

---

### US-003: Strip `+suffix` aliases from greeting display name

**Description:** As an authenticated user, I want my greeting to read "Good evening, Dicoangelo" instead of "Good evening, Dicoangelo+dev" when I sign in with an email alias.

**File:** Search for `getDisplayName` in `client/src/` — likely in `client/src/lib/` or `client/src/utils/`

**Acceptance Criteria:**
- [ ] Locate `getDisplayName(email)` (used in `client/src/pages/Dashboard.tsx` line ~465)
- [ ] Strip everything from the first `+` to the `@` before splitting on `@`
- [ ] Add unit test: input `dicoangelo+dev@metaventionsai.com` → output `Dicoangelo` (capitalized first letter)
- [ ] Add unit test: input `jane.doe@example.com` → output `Jane.doe` or `Jane Doe` matching existing convention
- [ ] Live verification: dashboard greeting reads "Good evening, Dicoangelo"

---

### US-004: Add Backtest entry to sidebar Intelligence group

**Description:** As an authenticated user, I want to navigate to Backtest from the sidebar without typing the URL.

**File:** `client/src/components/layout/Sidebar.tsx` (or wherever the nav groups are defined)

**Acceptance Criteria:**
- [ ] New entry "Backtest" added to the "Intelligence" sidebar group, positioned after "ML"
- [ ] Uses the same icon pattern as adjacent items (lucide-react icon — `LineChart` or `History` is appropriate)
- [ ] Routes to `/backtest`
- [ ] Active-state styling matches the other nav items (sovereign-gradient `before:` rail)
- [ ] Mobile nav (`MobileNav.tsx`) also includes the entry if applicable
- [ ] Live verification: sidebar shows Backtest under Intelligence group, clicking it navigates to `/backtest`

---

### US-005: Replace dashboard mock data with empty state when portfolio is empty

**Description:** As a fresh user with $100K cash and zero positions, I want the dashboard to show an "Add your first position" empty state, not a fake $125K portfolio with 5 holdings.

**Files:**
- `client/src/pages/Dashboard.tsx`
- `client/src/components/dashboard/*` (the mock-data sources)

**Acceptance Criteria:**
- [ ] When `portfolio.positions.length === 0` AND `portfolio.id !== 'demo'`, render `<EmptyPortfolio onAddPosition={...} />` for the entire dashboard, not just the holdings card
- [ ] Risk Metrics card hides when there are no positions OR shows "—" placeholders with a disabled state
- [ ] AI-Powered Insights card hides when there are no positions OR shows "Add positions to get insights" CTA
- [ ] Holdings table hides when there are no positions
- [ ] Equity curve chart hides when there are no positions
- [ ] Greeting + Quick Actions row remains visible
- [ ] Live verification: sign in as fresh `dicoangelo+dev@metaventionsai.com` (after deleting their NVDA position), dashboard shows empty state

---

### US-006: WebSocket banner reflects reality, not stuck-reconnecting forever

**Description:** As any user, I want the connection banner to either show "Live", be hidden, or show an actionable error — not a permanent "Reconnecting · 1 · 1s" loop on every page.

**Files:**
- `client/src/api/websocket.ts`
- `client/src/components/shared/ConnectionStatus.tsx`
- Investigate Railway `frontier-alpha-api` `/ws/quotes` endpoint health

**Acceptance Criteria:**
- [ ] Use `wscat -c wss://frontier-alpha-api-production.up.railway.app/ws/quotes` from terminal to verify the endpoint is reachable
- [ ] If endpoint is dead, fix the Railway deployment or update the env var to a working URL
- [ ] If endpoint is reachable but the client can't connect, capture the WebSocket close code in `ws.onclose` and surface it in the banner
- [ ] After 3 reconnect failures, banner switches from "Reconnecting" to "Live feed offline · using polling fallback" — done state, not infinite spinner
- [ ] Live verification: load the dashboard, banner either disappears (live), shows "Live" pill, or shows the offline message — never stuck on "Reconnecting"

---

### US-007: MockDataBanner across all demo-data surfaces

**Description:** As any user, I want a clear visual marker on every page that displays demo data, so I know which numbers reflect my real portfolio versus example data.

**Files:**
- `client/src/components/shared/MockDataBanner.tsx` (already exists — verify the API)
- `client/src/pages/Tax.tsx`
- `client/src/pages/ML.tsx`
- `client/src/pages/Alerts.tsx`
- `client/src/pages/Social.tsx`
- `client/src/pages/Options.tsx` (options chain currently shows 1.00/1.00 mock prices)
- `client/src/pages/Dashboard.tsx` (Risk Metrics + AI Insights when no real data)

**Acceptance Criteria:**
- [ ] On every page that renders demo / placeholder / hardcoded data, a `<MockDataBanner />` is displayed at the top of the content area
- [ ] Banner copy: "Showing demo data — connect a portfolio to see your numbers"
- [ ] Banner has dismiss-for-session button (localStorage flag, not server-side persisted)
- [ ] When real data is available for the page (e.g., user adds positions and Tax has real lots), the banner hides
- [ ] Live verification: each of the 6 pages above shows the banner; after adding real positions, banners on relevant pages disappear

---

### US-008: Welcome modal soften gradient + dismiss-X without forcing CTA

**Description:** As a new user, I want the onboarding modal to feel like an introduction, not an aggressive ad. The gradient banner is too saturated and there is no clear close X.

**File:** Search for "Welcome to Frontier Alpha" in `client/src/`

**Acceptance Criteria:**
- [ ] Replace the saturated magenta-cyan gradient banner header with a softer halo gradient (use `--gradient-halo` instead of `--gradient-sovereign`)
- [ ] Ensure the existing close X is visible and positioned top-right with adequate touch target (min 44x44 px)
- [ ] "Skip for now" button is secondary (text-only) instead of solid button, so the visual hierarchy steers users to "Try with Demo Portfolio"
- [ ] Modal does not appear after the first dismissal (localStorage flag)
- [ ] Live verification: sign in fresh, modal appears once with softer styling and reachable close affordance; refresh, modal does not reappear

---

### US-009: Holdings table sparkline + 7D change wiring

**Description:** As a user with positions, I want to see a real 7-day price sparkline and percentage change for each holding instead of "↑ 0.00%" placeholders.

**File:** `client/src/components/dashboard/HoldingsTable.tsx` (or whatever renders the table seen in `02-dashboard.png`)

**Acceptance Criteria:**
- [ ] Sparkline column reads from `getHistoricalPrices(symbol, 7)` and renders an inline SVG sparkline
- [ ] Change column shows real `(currentPrice - priorClose7d) / priorClose7d * 100` percentage with sign + color
- [ ] Failed-fetch fallback shows "—" instead of "↑ 0.00%"
- [ ] Live verification: dashboard with NVDA position shows real sparkline + non-zero %

---

## Functional Requirements

- FR-1: All authenticated pages must report 0 console errors after first paint when navigated by Playwright signed in as the dev account.
- FR-2: Per-symbol fetch failures in the factor handler must not 500 the entire batch.
- FR-3: When the API returns an empty result set, the page must render the corresponding `EmptyState` component, never synthesize placeholder numbers.
- FR-4: When demo data is intentionally rendered (Social leaderboard, ML model showcase), `<MockDataBanner />` must be visible at the top of the content area.
- FR-5: WebSocket reconnect logic must enter a terminal "offline" state after N failed attempts, not loop forever.
- FR-6: Sidebar nav must include every routed page that an enterprise user has access to.
- FR-7: Greeting and any other user-facing display name must strip `+suffix` aliases.

## Non-Goals (Out of Scope)

- Stripe annual tier (deferred to v1.3.x)
- Connect Alpaca improvements beyond what's needed to dismiss the "No broker connected" banner in demo mode
- Mobile-specific layout improvements beyond what bubbles up from the issues above
- Replacing Social leaderboard mock with a real social system (just label it as demo)
- New ML or CVRF features
- Adding more tests beyond the regression cases this PRD requires
- Performance optimization (Lighthouse, bundle size)

## Technical Considerations

- Stack is React 19 + Vite 7 + TypeScript on the client, Fastify on Vercel + Railway on the server, Supabase as the durable store.
- Two-tier deploy: client + REST run on Vercel; long-lived WebSocket runs on Railway. WS investigation in US-006 must consider both tiers.
- Quality gate `npx tsc --noEmit` must run from the project root for server and from `client/` for client.
- Vitest exclude pattern already skips `tests/.graveyard/` — do not add tests there.
- Test runner is `vitest`, not Jest. Use existing patterns from `tests/unit/crypto.test.ts` and `tests/unit/digest-metrics.test.ts`.
- The `MockDataBanner` component already exists at `client/src/components/shared/`; verify its props before US-007 work begins.
- Do not commit `.audit-2026-05-08/walkthrough/v126/` screenshots — add them to a `.gitignore` entry if needed, OR commit them under that directory but not larger than 500KB each.
- Each user story must be a separate commit with the format `fix(area): brief description (US-XXX)` for traceability.

## Success Metrics

- 0 ErrorBoundary catches across the 12 authenticated pages when walked by Playwright.
- 0 unguarded mock-data leaks (every page either has real data, an EmptyState, or a MockDataBanner).
- WebSocket banner enters a stable state (live, hidden, or offline-with-reason) within 30 seconds of page load.
- All 9 user stories independently verified via Playwright + console-error count.
- v1.2.6 ships clean: 740+ vitest passing (no regressions), TypeScript clean, deployed successfully to Vercel.

## Open Questions

- US-006: If Railway WS endpoint is fundamentally broken under Vercel cross-origin, do we accept that and label "Live feed offline" as the expected state, or invest in fixing the WS handshake? Decision needed before US-006 starts.
- US-007: Does the existing `MockDataBanner` accept a `dismissible` prop, or does the implementing agent need to add it? Verify before splitting work in parallel.
- US-008: User requested softer welcome modal — is this a one-time onboarding that should also be reachable later (e.g., "Show tour again" in settings)? If yes, add it as an open task for v1.2.7.
[/PRD]
