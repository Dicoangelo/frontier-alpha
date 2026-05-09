# ARCHITECTURE.md — Verified Ground Truth
*Last refresh: 2026-05-09 (post-v1.2.6 walkthrough wave) | Source: direct file inspection + `node scripts/arch-scanner.mjs` | Machine fingerprint: `schemas/arch.json`*

> **Drift policy:** Numeric metrics in this document are checked by `npm run arch:check` (CI). If you add/remove a route module, page, integration, store, hook, API module, or migration, regenerate the fingerprint via `npm run arch:scan`. CI will fail otherwise.

## Tech Stack (Verified)

| Layer | Technology | Version | Source |
|-------|-----------|---------|--------|
| Frontend | React | 19.2.0 | client/package.json |
| Build | Vite | 7.2.4 | client/package.json |
| Frontend TS | TypeScript | ~5.9.3 | client/package.json |
| State | Zustand | 5.0.11 | client/package.json |
| Data fetching | TanStack React Query | 5.90.20 | client/package.json |
| Charts | Recharts 3.7, D3 7.9 | — | client/package.json |
| Router | React Router DOM | 7.13.0 | client/package.json |
| Monitoring | @sentry/react | 10.38.0 | client/package.json |
| PWA | vite-plugin-pwa | 1.2.0 | client/package.json devDeps |
| CSS | Tailwind CSS | 4.1.18 | client/package.json devDeps |
| Backend | Fastify | 4.26.0 | package.json |
| Backend TS | TypeScript | ^5.3.3 | package.json |
| Database | Supabase (PostgreSQL + RLS) | 2.94.0 | package.json |
| Cache | Redis (ioredis, fallback) | 5.3.2 | package.json |
| Billing | Stripe | 20.3.1 | package.json |
| Market data | Polygon.io WebSocket, Alpha Vantage | — | CLAUDE.md |
| AI | DeepSeek primary / OpenAI fallback | — | wire-deepseek.sh |
| Logging | Pino | 10.3.1 | package.json |
| Validation | Zod | 3.22.4 | package.json |
| WebSocket | ws | 8.16.0 | package.json |
| Push | web-push (VAPID) | 3.6.7 | package.json |
| Testing (server) | Vitest | ^1.2.2 | package.json devDeps |
| Testing (client) | Vitest | ^2.0.0 | client/package.json devDeps |
| Mocking | MSW | ^2.12.9 | package.json devDeps |
| Deployment | Vercel (SPA + REST) + Railway (WebSocket + REST), Docker | — | v1.2.0 two-tier |

Node.js runtime: v20 (server/production), v25 (local dev only — Vercel + Railway both pin Node 20).

---

## Deployment Architecture

**Two-tier production split (v1.2.0, 2026-05-08):** the same codebase runs in two runtime modes. Vercel hosts the SPA + REST surface as serverless functions; Railway hosts a long-running Fastify process for the Polygon WebSocket gateway because Vercel serverless can't keep WS connections alive. Vercel cron runs the weekly digest hit at `/api/v1/digest/run` Mondays 13:00 UTC (added v1.2.0, real metrics in v1.2.1).

### Tier 1 — Vercel (Serverless)

| Field | Value |
|-------|-------|
| Domain | `frontier-alpha.metaventionsai.com` (apex) |
| Runtime | Vercel serverless (Node 20) |
| Entry | `api/fastify.ts` catch-all → `src/app.ts::buildApp()` |
| Hosts | React 19 SPA (static) + REST API (serverless) |
| Client config | `VITE_API_URL=''` (same-origin) |

### Tier 2 — Railway (Always-on)

| Field | Value |
|-------|-------|
| Default URL | `frontier-alpha-api-production.up.railway.app` |
| Custom domain | `api.frontier-alpha.metaventionsai.com` (TLS provisioning) |
| Runtime | Railway always-on Node 20 container |
| Entry | `src/index.ts` → standalone Fastify with `@fastify/websocket` |
| Hosts | Polygon WebSocket gateway + full REST API |
| Client config | `VITE_WS_URL=wss://frontier-alpha-api-production.up.railway.app/ws/quotes` |

### Why two tiers

- Vercel serverless functions cannot host long-lived WebSocket connections (15-minute hard ceiling, no persistent process).
- Polygon's real-time stream requires a single always-on subscriber that fans out to clients.
- Splitting the runtime keeps the SPA on Vercel's CDN edge while the WS gateway lives on Railway.
- Both surfaces import the same `src/app.ts::buildApp()` — zero code duplication, only deployment config differs.

### Deployment-related files

| File | Purpose |
|------|---------|
| `vercel.json` | Vercel build + route config (SPA cache fixed v1.2.6 — index.html no longer cached 1h) |
| `railway.toml` | Railway service config |
| `api/fastify.ts` | Vercel serverless catch-all (delegates to buildApp) |
| `src/app.ts` | `buildApp()` — single source of truth |
| `src/index.ts` | Standalone Fastify entry (Railway + Docker + local) |
| `scripts/wire-production-env.sh` | Idempotent env wiring for both tiers |
| `scripts/wire-deepseek.sh` | DeepSeek API key + model wiring |
| `scripts/wire-vapid.sh` | VAPID key generation + push config |
| `scripts/wire-stripe-webhook.mjs` | Stripe webhook endpoint registration |
| `scripts/create-stripe-products.mjs` | Idempotent Stripe products via lookup_keys |
| `scripts/arch-scanner.mjs` | Generates / verifies `schemas/arch.json` machine fingerprint |

---

## Backend Integrations

**Status as of v1.2.6 (2026-05-09):** 13 of 14 integrations are live in production. Diagnostic endpoint: `GET /api/v1/health/integrations`. Only `polygonWebSocket` on Vercel remains "by-design degraded" — Vercel serverless cannot host long-lived WebSockets, so Railway covers that tier (and the WS handshake itself was repaired in v1.2.6 commit `fb3aed5` after a `@fastify/websocket@^10` v8-API-shape mismatch was wedging Railway).

**14 integration entries** (verified by grep of `integrations\.<name>` assignments in `src/routes/health.ts`):

| Integration key | Status | Provider | Wired by | File ref |
|---|---|---|---|---|
| `supabase` | ✅ live | service-role JWT | env (`SUPABASE_*`) | `src/lib/supabase.ts` |
| `polygon` | ✅ live | Polygon.io REST | env (`POLYGON_API_KEY`, 32-char) | `src/data/MarketDataProvider.ts` |
| `polygonWebSocket` | ✅ live (Railway) / ⚠️ degraded by design (Vercel) | Polygon.io WS | env + Railway always-on | `src/routes/websocket.ts` |
| `alphaVantage` | ✅ live (free tier) | Alpha Vantage | env (`ALPHAVANTAGE_API_KEY`) | `src/data/MarketDataProvider.ts` |
| `llmExplainer` | ✅ live | DeepSeek primary, OpenAI fallback | `wire-deepseek.sh` | `src/explanation/ExplanationService.ts` |
| `stripe` | ✅ live | Stripe ($29 / $99 tiers, comp-customer guard) | `create-stripe-products.mjs`, `wire-stripe-webhook.mjs` | `src/routes/billing.ts` |
| `alpaca` | ✅ live (paper) | Internal `SimulatedBroker` (paper) + `AlpacaAdapter` (live) | `src/trading/*.ts` | `src/trading/AlpacaAdapter.ts` |
| `connectAlpaca` | ✅ live (Pro+) | per-user encrypted Alpaca creds (AES-256-GCM) | `BROKER_CRED_ENC_KEY` | `src/routes/broker-connect.ts` |
| `vapidPush` | ✅ live | self-generated VAPID keys | `wire-vapid.sh` | `src/notifications/PushService.ts` |
| `emailDelivery` | ✅ live | Resend (welcome / sub-confirm / alert-fired / weekly-digest) | env (`RESEND_API_KEY`) | `src/notifications/email-templates/` |
| `rateLimiter` | ✅ live | Supabase Postgres `rate_limit_check` RPC + in-memory fallback | env (`SUPABASE_SERVICE_KEY`) | `src/lib/rateLimiter.ts` |
| `weeklyDigestCron` | ✅ live | Vercel cron Mondays 13:00 UTC | `vercel.json` cron + `CRON_SECRET` | `src/routes/digest.ts` |
| `mlSentiment` | ✅ live | DeepSeek (shared LLM client) | `wire-deepseek.sh` | `src/sentiment/SentimentAnalyzer.ts` |
| `compGuard` | ℹ️ informational | code-level sentinel — `comp_*` IDs immune to all four billing webhook branches | n/a | `src/routes/billing.ts` |

> **Health probe limitation (US-004 scope):** several entries currently flip "live" purely on Boolean env presence rather than a real upstream call. US-004 in the v1.3.0 PRD upgrades each probe to a real round-trip and standardizes the response shape under `IntegrationProbeResult` + `schemas/health-integration.json`.

### v1.2.x change history (compressed)

- **v1.2.0** — Two-tier deploy, Stripe live, DeepSeek primary LLM, paper trading via SimulatedBroker, Connect Alpaca per-user, `/api/v1/health/integrations` endpoint, `BILLING_ENABLED` kill switch, email wave, subscription gating via `<UpgradeGate>`.
- **v1.2.1** — Real portfolio metrics in weekly digest cron, per-symbol fetch resilience, no zeroed-out emails for unresolvable portfolios.
- **v1.2.2** — Comp-customer guard: `comp_*` sentinel IDs immune to all four billing webhook branches; checkout returns 409 `COMP_ACCOUNT`.
- **v1.2.3** — Health endpoint surfaces `connectAlpaca`, `weeklyDigestCron`, `compGuard`. Email entry trims provider name.
- **v1.2.4** — VITE env trailing-newline regression hardened at the read site (`getWebSocketUrl().trim()`); `/terms` and `/privacy` static routes added.
- **v1.2.5** — Durable Supabase rate limiter (`rate_limit_check` RPC + `frontier_rate_limits` table). Eliminates need for Upstash Redis at current scale.
- **v1.2.6** — End-user walkthrough wave, see "v1.2.6 walkthrough fixes" section below.

### v1.2.6 walkthrough fixes (2026-05-08 → 2026-05-09)

11 commits across two waves of parallel agents, addressing every issue surfaced by the screenshot-driven audit at `.audit-2026-05-08/walkthrough/AUDIT.md`. The PRD is at `tasks/prd-v1.2.6-walkthrough-fixes.md` and the v1.3.0 PRD (`tasks/prd-v1.3.0-reliability-wave.md`) is the structural follow-up that turns each of these point-fixes into reusable infrastructure.

| Symptom | Root cause | Fix commit | Files touched |
|---|---|---|---|
| `GET /api/v1/portfolio` always 404 for authed users | `server.useDatabase` was never declared on `AppServer` or set in `buildApp()`; always read undefined → fell to in-memory branch | `5277a74` | `src/app.ts`, `src/types/index.ts` |
| Portfolio page React error #310 (hooks below early return) | `useMemo` / `useCountUp` lived under `if (isLoading) return ...`; loading→loaded transition tripped React's hook-order check | `70e67c7` | `client/src/pages/Portfolio.tsx` |
| `/portfolio/factors/:symbols` 500 on first bad symbol | per-symbol fetches were inside one `Promise.all`; one rate-limit threw the whole batch | `06d89ae` | `src/routes/portfolio.ts` |
| Greeting reads "Dicoangelo+dev" | `getDisplayName()` stripped domain but not `+suffix` aliases | `d5a1749` | `client/src/lib/displayName.ts` |
| `/backtest` page worked but had no sidebar entry | nav config missed Backtest in Intelligence group | `e48d965` | `client/src/components/layout/Sidebar.tsx` |
| Welcome modal too aggressive on first paint | sovereign gradient at full saturation; no localStorage dismissal | `1b04a65` | `client/src/components/onboarding/WelcomeModal.tsx` |
| Holdings sparkline + change column blank/zero | column rendered seeded-PRNG mock; no real history endpoint | `ee86990` | `client/src/components/dashboard/HoldingsTable.tsx`, `src/routes/quotes.ts` (new `:symbol/history`), `client/src/api/quotes.ts` |
| Railway WS handshake always failed (banner stuck at "Reconnecting · 1 · 1s") | `@fastify/websocket@^10` v8 API shape: `connection.socket.on` is undefined; v7 shim was assumed | `fb3aed5` | `src/routes/websocket.ts` (server v7/v8 shim), `client/src/api/websocket.ts` (terminal-state after 3 fails) |
| Dashboard rendered $125K demo for $100K-cash, zero-position users | empty-state branch missing in PortfolioOverview | `fd10c4c` | `client/src/components/dashboard/EmptyPortfolio.tsx`, `client/src/pages/Dashboard.tsx` |
| Mock-data leaks on Tax / ML / Alerts / Social / Options | no banner; demo seed values rendered as if user data | `4bf26ee` | `MockDataBanner.tsx` (force/pageKey/dismissible/message props) + 5 page files |
| CVRF page ErrorBoundary crash on fresh user | client typed `weights`; server returns `factorWeights` (shape regression v1.2.2) | `791292f` | `client/src/api/cvrf.ts` (3 normalizers) + 9 CVRF components + page-level `SectionErrorBoundary` |
| `index.html` cached 1h on Vercel CDN — broken builds stuck for users | `vercel.json` cache-control matched everything; needed to exclude HTML | `94a4431` | `vercel.json` |
| Polygon REST 401s in production despite key-set in dashboard | `vercel env add` consumed via `echo` truncated the 32-char key to 30 chars (newline corruption) | `6c971eb` | n/a (env rotation; `printf` lesson) |
| Auth race on cold reload (first protected fetch fired before authStore hydrated) | `axios.interceptors.request` had no fallback to read Supabase session if authStore wasn't ready | `9a47e1f` | `client/src/api/client.ts` |
| Parallel dashboard fetches doubled upstream load | no in-flight dedup on `MarketDataProvider.getHistoricalPrices()` | `836e630` | `src/data/MarketDataProvider.ts` |

The v1.2.6 wave closed visible bugs but exposed deeper structural issues that v1.3.0 addresses: Boolean-checked health probes, runtime-rather-than-type-level mock-data guarding, and architecture documentation that drifts faster than humans can update it. See `tasks/prd-v1.3.0-reliability-wave.md`.

---

## Auth Lifecycle

> **Status:** documented contract. US-003 in v1.3.0 PRD will harden the implementation against the contract (currently the `loading`/`unauthed` split is not exhaustively guarded — protected pages can briefly fire requests before `initialized = true`).

### State machine

```
                           ┌────────────────┐
                           │ uninitialized  │   no Supabase call yet
                           └───────┬────────┘
                                   │ initialize()
                                   ▼
                           ┌────────────────┐
                           │   loading      │   awaiting getSession()
                           └───┬────────┬───┘
                       session │        │ no session
                               ▼        ▼
                     ┌──────────┐    ┌──────────┐
                     │  authed  │    │ unauthed │
                     └────┬─────┘    └────┬─────┘
                          │               │
                  401 or  │               │ login()
                  expired │               ▼
                          ▼          (back to authed)
                  ┌────────────┐
                  │  expired   │  exp <= now()
                  └─────┬──────┘
                        │ refreshSession()
                        ▼
                  ┌────────────┐
                  │ refreshing │
                  └─────┬──────┘
                        │ ok / fail
                        ▼
                  authed | unauthed
```

### State predicates

| State | Predicate | Notes |
|---|---|---|
| `uninitialized` | `!initialized && !loading` | Pre-mount of `AppRoutes`. |
| `loading` | `loading === true` (and `!initialized`) | `initialize()` running. |
| `authed` | `initialized && session?.access_token && !isExpired(session)` | Session present and unexpired. |
| `unauthed` | `initialized && !session` | Resolved-as-null session. |
| `expired` | `initialized && session?.access_token && isExpired(session)` | Token past expiry; refresh required. |
| `refreshing` | Awaiting `supabase.auth.refreshSession()` | Should hold incoming requests until resolved (US-003 work). |

`isExpired(session)` = `session.expires_at * 1000 < Date.now() - 60_000` (60-second skew tolerance).

### Allowed component renders per state

| State | Allowed render | Forbidden render |
|---|---|---|
| `uninitialized` | nothing (mount only) | any data fetch |
| `loading` | full-screen `<Spinner />` (Layout-less) | protected children, redirect |
| `authed` | Layout + ErrorBoundary + page | landing/login routes |
| `unauthed` | redirect to `/landing` | protected children |
| `expired` | hold render; trigger refresh | data fetch |
| `refreshing` | hold incoming requests until resolved | new requests racing |

### Implementation references

| File | Role |
|---|---|
| `client/src/stores/authStore.ts` | Zustand store; owns `user`, `session`, `loading`, `initialized`, `subscription`. |
| `client/src/lib/supabase.ts` | Wraps `@supabase/supabase-js`. Exposes `getSession()`, `signIn()`, `signOut()`, `onAuthStateChange()`. |
| `client/src/api/client.ts` | Axios instance. Request interceptor injects `Authorization: Bearer <access_token>`; falls back to direct Supabase session read if authStore not yet hydrated (`9a47e1f`, v1.2.6). US-003 will add explicit 401-then-refresh-then-replay. |
| `client/src/App.tsx` | `<ProtectedRoute>` + `<PublicRoute>` gates. Today they render `<Spinner />` while `!initialized || loading`. |

### Known gaps closed by US-003

- `ProtectedRoute` short-circuits on `loading || !initialized`, so the contract's `uninitialized → loading → authed` is honored — but data-fetching hooks beneath it are NOT all gated on `useAuthStore(s => s.initialized)`, which is why some pages fire a request that races with auth hydration. US-003 introduces an `isReady` flag and `enabled: useAuthStore(s => s.isReady)` on every protected hook.
- No automatic 401-replay-with-refresh — `9a47e1f` adds the Supabase fallback header read but not the refresh-and-retry leg. US-003 closes this.

---

## Server Architecture

### Directory Map (`src/`)

| Path | Purpose | Key Files |
|------|---------|-----------|
| `src/factors/` | Factor engine — 76 factors, 12 logical groups | FactorEngine.ts, SentimentAnalyzer.ts |
| `src/cvrf/` | CVRF belief system — episodic learning | CVRFManager.ts, BeliefUpdater.ts, EpisodeManager.ts, PersistentCVRFManager.ts, ConceptExtractor.ts, persistence.ts, integration.ts |
| `src/optimizer/` | Monte Carlo portfolio optimizer | PortfolioOptimizer.ts |
| `src/backtest/` | Walk-forward backtest engine | Backtester.ts, WalkForwardEngine.ts, BacktestRunner.ts, HistoricalDataLoader.ts |
| `src/earnings/` | Earnings oracle and calendar | EarningsOracle.ts |
| `src/ml/` | Neural factor models, regime detection | RegimeDetector.ts, NeuralFactorModel.ts, FactorAttribution.ts, TrainingPipeline.ts |
| `src/options/` | Options intelligence | OptionsDataProvider.ts, GreeksCalculator.ts, StrategyBuilder.ts, ImpliedVolatility.ts |
| `src/tax/` | Tax optimization | TaxLotTracker.ts, HarvestingScanner.ts, WashSaleDetector.ts, TaxEfficientRebalancer.ts, TaxReportGenerator.ts |
| `src/core/` | Core orchestration | CognitiveExplainer.ts, EarningsOracle.ts, RiskAlertSystem.ts, FactorDriftMonitor.ts |
| `src/data/` | Market data providers | MarketDataProvider.ts (in-flight dedup, v1.2.6), MultiCurrency.ts, SECFilingsParser.ts |
| `src/trading/` | Broker adapters | BrokerAdapter.ts, AlpacaAdapter.ts, SimulatedBroker.ts |
| `src/services/` | Domain services | PortfolioService.ts, ProfileService.ts, LeaderboardService.ts, SharingService.ts, ExplanationService.ts |
| `src/notifications/` | Web Push + SSE + email | PushService.ts, AlertDelivery.ts, `email-templates/` |
| `src/sec/` | SEC filing monitoring | EdgarMonitor.ts, SECFilingMonitor.ts |
| `src/sentiment/` | Sentiment analysis | SentimentAnalyzer.ts |
| `src/analytics/` | Performance attribution | PerformanceAttribution.ts |
| `src/middleware/` | Auth, rate limiting, subscription gating | auth.ts, rateLimiter.ts, subscriptionGate.ts |
| `src/cache/` | Redis cache layer (legacy fallback) | RedisCache.ts |
| `src/observability/` | Metrics + structured logging | metrics.ts, logger.ts |
| `src/lib/` | Shared utilities | supabase.ts, stripe.ts, logger.ts, rateLimiter.ts, errorHandler.ts |
| `src/types/` | Shared TypeScript types | index.ts (incl. `IntegrationHealthEntry`) |
| `src/routes/` | Fastify route plugins (26 modules — see below) | … |

**Total server source files: 113 .ts** (110 non-test + 3 in-source `.test.ts` next to their subjects). Verified 2026-05-09 via `find src -name "*.ts" | wc -l`.

### Fastify Route Modules — 26 modules, 108 endpoint registrations

Verified 2026-05-09 via `grep -rE "fastify\.(get|post|put|delete|patch)" src/routes/*.ts | wc -l`. The fingerprint `schemas/arch.json` is the canonical per-module count.

| Module | Endpoints | Purpose |
|---|---|---|
| `alerts.ts` | 7 | Alert rules + factor-drift + SEC-filings + ack |
| `api-keys.ts` | 3 | User API key CRUD |
| `auth.ts` | 5 | Login/logout/me/refresh/signup (Supabase passthrough) |
| `backtest.ts` | 1 | Walk-forward backtest run |
| `billing.ts` | 3 | Stripe checkout / subscription / portal (webhook is a separate plain handler in same module) |
| `broker-connect.ts` | 3 | Per-user encrypted Alpaca creds — connect / status / disconnect |
| `broker.ts` | 3 | Broker status / trade preview / trade execute |
| `cache.ts` | 3 | Cache stats + admin |
| `cvrf.ts` | 14 | Belief system endpoints — beliefs (current/timeline/correlations), constraints, decision, episode start/close, history, meta-prompt, risk, stats, episodes, belief-history |
| `digest.ts` | 1 | Weekly digest cron entry (`/api/v1/digest/run?key=$CRON_SECRET`) |
| `earnings.ts` | 4 | Upcoming / forecast / forecast-refresh / history |
| `errors.ts` | 1 | Client-side error report ingestion |
| `explain.ts` | 3 | LLM explainer — portfolio / generic / trade |
| `health.ts` | 5 | `/health`, `/api/v1/metrics`, `/api/v1/health`, `/api/v1/health/integrations`, deep health |
| `ml.ts` | 3 | Regime / attribution / model versions |
| `notifications.ts` | 4 | Push subscribe / unsubscribe / send / preferences |
| `options.ts` | 6 | Chain / greeks / strategies (read+write) / vol-surface / IV |
| `portfolio.ts` | 11 | CRUD + optimize + factors (per-symbol resilient, v1.2.6) + attribution + risk + share + shared-by-token |
| `quotes.ts` | 3 | `:symbol`, stream (SSE), `:symbol/history` (added v1.2.6 for sparklines) |
| `sec.ts` | 2 | Filings list + detail |
| `sentiment.ts` | 1 | LLM-classified sentiment per symbol |
| `settings.ts` | 4 | Profile / preferences / notifications / display |
| `social.ts` | 3 | Leaderboard + follow / unfollow |
| `tax.ts` | 5 | Lots / harvest (read+write) / wash-sales / report |
| `trading.ts` | 9 | Account / clock / preview / quote / orders / positions / connect (paper) |
| `websocket.ts` | 1 | `/ws/quotes` (Railway-only effective; v8 shim) |

**Total: 108** endpoint registrations across 26 modules.

### Vercel Serverless Functions (`api/`)

Post-consolidation surface: only **4 .ts files** remain in `api/`. The catch-all `api/fastify.ts` delegates every route to `src/app.ts::buildApp()`. There are zero hand-written Vercel endpoint handlers anymore (the legacy 69-file surface was archived during the v1.2.0 consolidation).

| File | Purpose |
|---|---|
| `api/fastify.ts` | Catch-all serverless entry; delegates to buildApp |
| `api/openapi.ts` | OpenAPI spec serve |
| `api/docs.ts` | Swagger UI |
| `api/edge/quotes.ts` | Edge-runtime quote endpoint (latency-sensitive) |

Plus two static spec files: `api/openapi-spec.json`, `api/openapi-spec.yaml`.

### Database (Supabase)

**13 migrations** in `supabase/migrations/` (locally tracked):

| File | Purpose |
|---|---|
| `001_initial_schema.sql` | Core tables |
| `002_portfolio_sharing.sql` | Portfolio sharing |
| `003_cvrf_tables.sql` | CVRF belief storage |
| `004_push_subscriptions.sql` | Web Push subscriptions |
| `005_api_keys.sql` | API key management |
| `011_subscriptions.sql` | Stripe subscription tables |
| `20260208_indexes.sql` | Performance indexes |
| `20260209_ml_models.sql` | ML model storage |
| `20260209_shared_portfolios.sql` | Shared portfolio tokens |
| `20260209_social_profiles.sql` | Social profiles |
| `20260209_tax_lots.sql` | Tax lot tracking |
| `20260508_add_welcomed_at.sql` | Welcome email gate |
| `20260508_paper_trading.sql` | `paper_accounts`, `paper_orders`, `paper_positions` |

> **Note:** `frontier_rate_limits` table + `rate_limit_check` RPC (v1.2.5) were applied directly via Supabase MCP and do NOT have a corresponding file in `supabase/migrations/` yet. Out-of-band schema. Folding it back into a tracked migration is a v1.3.0 cleanup item but not a US-001 deliverable.

---

## Client Architecture

### Pages (24 page files, 26 `<Route>` declarations in App.tsx)

`Help.test.tsx` is excluded from the page count (it's a test file). One page (`Dashboard`) is mounted at two paths (`/` and `/dashboard`). Page-to-route audit: every page in `client/src/pages/*.tsx` corresponds to at least one route declaration; every route declaration imports a real page module. No orphans.

| Route | Component | Auth | Layout |
|-------|-----------|------|--------|
| `/landing` | Landing | Public (redirects if authed) | None |
| `/login` | Login | Public (redirects if authed) | None |
| `/reset-password` | ResetPassword | Public | None |
| `/terms` | Terms | Public | None |
| `/privacy` | Privacy | Public | None |
| `/` | Dashboard | Protected | Layout |
| `/dashboard` | Dashboard | Protected | Layout |
| `/portfolio` | Portfolio | Protected | Layout |
| `/factors` | Factors | Protected | Layout |
| `/earnings` | Earnings | Protected | Layout |
| `/optimize` | Optimize | Protected (Pro gated) | Layout |
| `/alerts` | Alerts | Protected | Layout |
| `/trade` | Trading | Protected (paper trading) | Layout |
| `/settings` | Settings | Protected | Layout |
| `/help` | Help | Protected | Layout |
| `/cvrf` | CVRF | Protected (Pro gated) | Layout |
| `/ml` | ML | Protected | Layout |
| `/options` | Options | Protected | Layout |
| `/social` | Social | Protected | Layout |
| `/tax` | Tax | Protected | Layout |
| `/backtest` | Backtest | Protected | Layout |
| `/pricing` | Pricing | Public | None |
| `/billing/success` | BillingSuccess | Protected (post-checkout) | None |
| `/billing/canceled` | BillingCanceled | Protected (post-checkout) | None |
| `/shared/:token` | SharedPortfolio | Public | None |
| `*` | Navigate to `/` | n/a | n/a |

All heavy pages are lazy-loaded via `React.lazy()`. Pro gating is enforced via `<UpgradeGate>` wrapper on Optimize and CVRF; the Trading page now displays `PAPER TRADING · Frontier Alpha Engine` (internal SimulatedBroker, not Alpaca).

### Visual Design System

Aligned to the Metaventions AI family aesthetic (`metaventionsai.com` / `careers.metaventionsai.com` / `friendlyface.metaventionsai.com`). See `DESIGN-SYSTEM.md` for token-level spec.

| Layer | Pattern | Used by |
|-------|---------|---------|
| **Surfaces** | `glass-slab` (subtle), `glass-slab-floating` (elevated), `glass-modal` (overlays) | All section cards, sheets, modals |
| **Brand band** | `bg-[image:var(--gradient-sovereign)]` magenta→amethyst→cyan | Primary CTAs, active rails, headers |
| **Top rail** | `sovereign-bar` 3px gradient | Every modal, page-shell top |
| **Type rails** | 3px `before:` left rail in semantic color + matching shadow glow | Toast, ErrorBoundary, ConnectionStatus, ModelStatusBanner, banner alerts |
| **Active route** | 3px gradient `before:` rail + `bg-[var(--color-accent-light)]` | Sidebar, MobileNav (top rail variant) |
| **Motion** | `animate-press`, `animate-lift`, `animate-stagger`, `animate-enter`, `animate-fade-in`, `animate-slide-in-{left,right}`, `animate-pulse-subtle` | All interactive controls + overlays |
| **Mono kicker** | `mono text-[10px] sm:text-xs tracking-[0.3em] uppercase text-theme-muted` | Page headers, section labels, table headers |
| **Anti-CLS** | `tabular-nums` on every numeric, explicit `min-h-[Npx]` on chart wrappers, size-matched skeletons | Dashboard widgets, all chart cards, all stat tiles |

### State Stores (6 — verified)

| Store | Purpose |
|-------|---------|
| `alertsStore` | Alert state management |
| `authStore` | Supabase auth session, user state, subscription |
| `dataSourceStore` | Mock vs live data toggle |
| `portfolioStore` | Portfolio positions and data |
| `quotesStore` | Real-time quote data |
| `themeStore` | Light/Dark/System theme toggle |

### Hooks (13 — verified)

| Hook | Purpose |
|------|---------|
| `useCVRF` | CVRF beliefs and episodes |
| `useDataFreshness` | Data-freshness indicators |
| `useEarnings` | Earnings oracle data |
| `useFactors` | Factor exposure data |
| `useIntegrationsHealth` | `/api/v1/health/integrations` polling |
| `useIsMobile` | Responsive breakpoint detection |
| `useKeyboardShortcuts` | Global keyboard bindings |
| `useNotifications` | Push notification management |
| `useQuotes` | Real-time quote data |
| `useStagger` | Staggered list animation |
| `useSubscription` | Stripe subscription state |
| `useToast` | Toast notification system |
| `useTrading` | Alpaca / paper trading operations |

### API Modules (7 — verified)

| Module | Purpose |
|---|---|
| `client.ts` | Axios base client + auth-header interceptor (with Supabase fallback, v1.2.6) |
| `cvrf.ts` | CVRF belief system API calls (3 normalizers, v1.2.6) |
| `earnings.ts` | Earnings oracle API calls |
| `factors.ts` | Factor exposure API calls |
| `portfolio.ts` | Portfolio CRUD API calls |
| `quotes.ts` | Quote + history API calls (history added v1.2.6) |
| `websocket.ts` | WebSocket quote connection (terminal-state guard, v1.2.6) |

### Components (110 .tsx non-test files across 21 domains)

Verified via `find client/src/components -name "*.tsx" -not -name "*.test.tsx" | wc -l`. Notable subsystems: alerts (4), analytics (1), auth (2), charts (2), cvrf (13), dashboard (~10), earnings (5), explainer (3), factors (2), help (3), landing (varies), layout (3), ml (3), notifications (1), onboarding (3), options (4), portfolio (4), risk (1), settings (2), shared (~19 + 14 skeletons), trading (5).

---

## Factor Engine

**File:** `src/factors/FactorEngine.ts`
**Verified count: 76 factors** (`FACTOR_DEFINITIONS` array, lines 22–126)

| Group | Count | Factors |
|-------|-------|---------|
| Style / Fama-French 5 | 5 | market, size, value, profitability, investment |
| Momentum | 3 | momentum_12m, momentum_6m, momentum_1m |
| Volatility | 5 | volatility, low_vol, idio_vol, bollinger_width, atr_normalized |
| Quality | 8 | roe, roa, gross_margin, debt_equity, current_ratio, accruals, asset_turnover, earnings_variability |
| Sentiment | 6 | sentiment_news, sentiment_social, sentiment_options, analyst_revision, short_interest, volume_ratio |
| Macro | 14 | interest_rate_sens, inflation_beta, credit_spread_beta, dollar_beta, oil_beta, vix_beta, yield_curve_slope, gold_beta, real_rate_sens, pmi_beta, consumer_confidence_beta, equity_bond_corr, risk_on_off, cross_asset_momentum |
| Growth | 7 | revenue_growth, earnings_growth, fcf_yield, dividend_yield, buyback_yield, capex_intensity, rd_intensity |
| Valuation | 6 | pe_ratio, pb_ratio, ps_ratio, ev_ebitda, peg_ratio, earnings_yield |
| Technical | 4 | rsi_14, macd_signal, price_gap, mean_reversion_5d |
| Liquidity | 3 | bid_ask_spread, turnover_ratio, amihud_illiquidity |
| Earnings & Events | 4 | earnings_surprise, guidance_revision, insider_activity, institutional_flow |
| Sector (GICS) | 11 | sector_tech, sector_healthcare, sector_financials, sector_energy, sector_consumer_disc, sector_consumer_staples, sector_industrials, sector_materials, sector_utilities, sector_real_estate, sector_comm_services |

**Total: 76** (5+3+5+8+6+14+7+6+4+3+4+11)

Canonical `category` values in code: `style`, `volatility`, `quality`, `sentiment`, `macro`, `sector`. The Growth, Valuation, Technical, Liquidity, and Earnings groups are logical groupings that map into these six categories in the `category` field.

---

## Test Coverage

### Server suite

| Location | Files | Tests | Notes |
|---|---|---|---|
| `tests/` (e2e + unit + ml + options + tax + services) | 36 | … | 4 stale v1-Vercel-handler files archived to `tests/.graveyard/` (v1.2.5) |
| `src/` (in-source) | 3 | EarningsOracle (31) + FactorEngine (30) + PortfolioOptimizer (23) | |

**`npx vitest run` → 39 test files, 740 tests passing in ~5s** (verified 2026-05-09).

### Client suite

15+ test files under `client/src/**/*.test.tsx?` covering api/, hooks/, stores/, and select components/pages. Run via `cd client && npm run test:run`.

### Test Infrastructure

| Tool | Version | Role |
|------|---------|------|
| Vitest (server) | ^1.2.2 | Server test runner |
| Vitest (client) | ^2.0.0 | Client test runner |
| MSW | ^2.12.9 | HTTP mock server |
| @testing-library/react | ^16.0.0 | Component testing |
| jsdom | ^25.0.0 | DOM environment |

Fixtures: `tests/fixtures/market-data.ts`, `tests/setup.ts`, `tests/setup/msw-handlers.ts`. The v1.3.0 PRD (US-007) introduces a canonical `tests/fixtures/golden-state.sql` seed reused by smoke tests, screenshots, and support reproduction.

Commands: `npm run test:unit` (server), `npm run test:all` (server + client), `cd client && npm run test:run` (client only), `npm run arch:check` (drift check).

---

## Codebase Metrics (Verified vs Claimed)

> **Source:** `node scripts/arch-scanner.mjs` against HEAD on 2026-05-09. Numeric drift > 5% fails CI via `npm run arch:check`.

| Metric | Verified | Evidence command |
|---|---|---|
| package.json version | **1.2.6** | `node -p "require('./package.json').version"` |
| Server .ts files | **113** (110 non-test + 3 in-source test) | `find src -name "*.ts" \| wc -l` |
| Fastify route modules | **26** | `ls src/routes/*.ts \| grep -v test \| wc -l` |
| Fastify endpoint registrations | **108** | `grep -rE "fastify\.(get\|post\|put\|delete\|patch)" src/routes/*.ts \| wc -l` |
| Vercel `api/` .ts files | **4** | `find api -name "*.ts" \| wc -l` |
| Supabase migrations (tracked) | **13** | `ls supabase/migrations/ \| wc -l` |
| Backend integration entries | **14** | `grep -E "integrations\.[a-zA-Z]+" src/routes/health.ts \| sort -u` |
| Client pages (.tsx, non-test) | **24** | `ls client/src/pages/*.tsx \| grep -v test \| wc -l` |
| Client `<Route>` declarations | **26** | `grep -cE "<Route\\s" client/src/App.tsx` (incl. `*` and dup `/` + `/dashboard`) |
| Client components (.tsx, non-test) | **110** | `find client/src/components -name "*.tsx" -not -name "*.test.tsx" \| wc -l` |
| Zustand stores | **6** | `ls client/src/stores/*.ts \| grep -v test \| wc -l` |
| Hooks | **13** | `ls client/src/hooks/*.ts \| grep -v test \| wc -l` |
| Client API modules | **7** | `ls client/src/api/*.ts \| grep -v test \| wc -l` |
| Server tests passing | **740** | `npx vitest run --reporter=basic` (2026-05-09) |
| Backend integrations live | **13 of 14** | `/api/v1/health/integrations` (only Vercel WS by-design degraded) |
| Deployment tiers | **2** | Vercel (SPA + REST) + Railway (WS + REST) |

Compare against `schemas/arch.json` for the machine-checkable fingerprint.

---

## Dependencies

### Server (`package.json`)

Runtime: fastify ^4.26.0, @fastify/cors ^9.0.1, @fastify/websocket ^10.0.1, @supabase/supabase-js ^2.94.0, ioredis ^5.3.2, pg ^8.11.3, stripe ^20.3.1, web-push ^3.6.7, ws ^8.16.0, zod ^3.22.4, pino ^10.3.1, pino-pretty ^13.1.3, axios ^1.6.5, date-fns ^3.3.1, decimal.js ^10.4.3.

Dev: tsx ^4.7.0, esbuild ^0.27.2, vitest ^1.2.2, @vitest/coverage-v8 ^1.6.1, msw ^2.12.9, typescript ^5.3.3, @vercel/node ^5.5.28.

### Client (`client/package.json`)

Runtime: react ^19.2.0, react-dom ^19.2.0, react-router-dom ^7.13.0, zustand ^5.0.11, @tanstack/react-query ^5.90.20, recharts ^3.7.0, d3 ^7.9.0, @supabase/supabase-js ^2.94.0, axios ^1.13.4, lucide-react ^0.563.0, @sentry/react ^10.38.0, @sentry/browser ^10.38.0, dompurify ^3.3.1, date-fns ^4.1.0, decimal.js ^10.6.0.

Dev: vite ^7.2.4, @vitejs/plugin-react ^5.1.1, vite-plugin-pwa ^1.2.0, tailwindcss ^4.1.18, @tailwindcss/postcss ^4.1.18, typescript ~5.9.3, vitest ^2.0.0, @testing-library/react ^16.0.0, jsdom ^25.0.0.

---

## Tech Debt & Known Issues

### Critical

_None currently tracked. The v1.3.0 PRD (`tasks/prd-v1.3.0-reliability-wave.md`) addresses the structural debt that the v1.2.6 walkthrough surfaced (Boolean health probes, runtime mock-data guarding, doc drift)._

### Resolved (v1.2.6 — 2026-05-09)

See "v1.2.6 walkthrough fixes" table above. 11 fix commits + audit, captured in `.audit-2026-05-08/walkthrough/AUDIT.md`.

### Resolved (v1.2.0 — 2026-05-08)

- ~~**Unsynchronized dual API surface**~~ — Fixed: `src/app.ts::buildApp()` is single source of truth. Vercel serverless catch-all at `api/fastify.ts` delegates to it. Only 4 Vercel `.ts` files remain (catch-all + openapi + docs + edge/quotes). All business logic lives in `src/routes/*.ts`.
- ~~**Polygon WebSocket on Vercel**~~ — Fixed: WebSocket gateway moved to Railway always-on Node container. v1.2.6 then repaired the v8 API shape in the WS plugin.
- ~~**Stripe billing not wired**~~ — Fixed: Pro $29 + Enterprise $99 live, idempotent products, return-flow pages added.
- ~~**LLM explainer locked to OpenAI**~~ — Fixed: DeepSeek primary; OpenAI fallback. Same client used for ML sentiment.
- ~~**No paper trading**~~ — Fixed: internal SimulatedBroker on Polygon WS + 3 new Supabase tables with RLS via `auth.uid()`.
- ~~**No subscription gating**~~ — Fixed: `<UpgradeGate>` enforced on Optimize + CVRF pages.

### Resolved (v1.1.0 — 2026-04-04)

- ~~**Version string mismatch**~~ — `/health` reads from `package.json` (`d763465`).
- ~~**Dead code — backup file**~~ — `src/index.ts.backup` removed (`a0e996b`).
- ~~**Duplicate broker layer**~~ — `src/broker/` archived to `.graveyard/` (`a0e996b`).
- ~~**Duplicate share endpoint paths**~~ — Removed `/portfolios/share` (plural), kept `/portfolio/share` (`84f4766`).
- ~~**Stale counts in CLAUDE.md and README**~~ — Updated.

### Low Priority

- **`frontier_rate_limits` not file-tracked** — applied via Supabase MCP (v1.2.5); should be folded into a tracked migration in v1.3.x.
- **Python ML engine not integrated** — `ml/main.py` (uvicorn port 8000) is marked WIP. Optional enhancement only.
- **Vercel auto-deploy disabled** — Disabled at commit `acf6987`. Manual deploy required.
- **Legacy `src/cache/RedisCache.ts`** — fallback only; v1.3.0 US-006 introduces an extracted cache module under `src/data/cache/`.

---

*All counts and claims in this document are verified by direct file inspection (Read, Grep, Glob) of the codebase at HEAD on 2026-05-09. The fingerprint at `schemas/arch.json` is the source of truth for numeric drift detection. Run `npm run arch:scan` after any code change that touches the route map, page list, integrations, or migrations; CI runs `npm run arch:check` on every PR.*
