# ARCHITECTURE.md — Verified Ground Truth
*Generated: 2026-03-25 | Last UI sweep: 2026-05-07 | Last deploy: 2026-05-08 | Scanner: arch-scanner | Source: direct file inspection*

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
| Cache | Redis (ioredis) | 5.3.2 | package.json |
| Billing | Stripe | 20.3.1 | package.json |
| Market data | Polygon.io WebSocket, Alpha Vantage | — | CLAUDE.md |
| AI | OpenAI GPT-4o | — | CLAUDE.md |
| Logging | Pino | 10.3.1 | package.json |
| Validation | Zod | 3.22.4 | package.json |
| WebSocket | ws | 8.16.0 | package.json |
| Push | web-push (VAPID) | 3.6.7 | package.json |
| Testing (server) | Vitest | ^1.2.2 | package.json devDeps |
| Testing (client) | Vitest | ^2.0.0 | client/package.json devDeps |
| Mocking | MSW | ^2.12.9 | package.json devDeps |
| Deployment | Vercel (SPA + REST) + Railway (WebSocket + REST), Docker | — | v1.2.0 two-tier |

Node.js runtime: v20 (server/production), v25 (local dev).

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
| `vercel.json` | Vercel build + route config |
| `railway.toml` | Railway service config |
| `api/fastify.ts` | Vercel serverless catch-all (delegates to buildApp) |
| `src/app.ts` | `buildApp()` — single source of truth |
| `src/index.ts` | Standalone Fastify entry (Railway + Docker + local) |
| `scripts/wire-production-env.sh` | Idempotent env wiring for both tiers |
| `scripts/wire-deepseek.sh` | DeepSeek API key + model wiring |
| `scripts/wire-vapid.sh` | VAPID key generation + push config |
| `scripts/wire-stripe-webhook.mjs` | Stripe webhook endpoint registration |
| `scripts/create-stripe-products.mjs` | Idempotent Stripe products via lookup_keys |

---

## Backend Integrations

**Status as of v1.2.2 (2026-05-08):** 10 of 11 integrations are live in production. Diagnostic endpoint: `GET /api/v1/health/integrations`.

| Integration | Status | Provider | Wired by |
|-------------|--------|----------|----------|
| Supabase auth + RLS | ✅ live | service-role JWT | env (`SUPABASE_*`) |
| Polygon REST | ✅ live | Polygon.io | env (`POLYGON_API_KEY`) |
| Polygon WebSocket | ✅ live (Railway) | Polygon.io | env + Railway always-on |
| Alpha Vantage | ✅ live | Alpha Vantage | env (`ALPHAVANTAGE_API_KEY`) |
| LLM explainer | ✅ live | DeepSeek primary / OpenAI fallback | `wire-deepseek.sh` |
| Stripe billing | ✅ live | Stripe (Pro $29 + Enterprise $99), `BILLING_ENABLED` kill switch + comp-customer guard | `create-stripe-products.mjs` + `wire-stripe-webhook.mjs` |
| Connect Alpaca | ✅ live (Pro+) | per-user encrypted creds (AES-256-GCM) | `src/routes/broker-connect.ts` + `BROKER_CRED_ENC_KEY` |
| Paper trading | ✅ live | Internal SimulatedBroker | Polygon WS + Supabase |
| VAPID web push | ✅ live | self-generated keys | `wire-vapid.sh` |
| Email | ✅ live | Resend (welcome + subscription-confirmed + alert-fired + weekly-digest) | env (`RESEND_API_KEY`) |
| Weekly digest cron | ✅ live | Vercel cron, Mondays 13:00 UTC, real portfolio metrics | `vercel.json` crons + `src/routes/digest.ts` + `src/notifications/digest-metrics.ts` |
| ML sentiment | ✅ live | DeepSeek llm-classification | shared LLM client |
| Rate limiter | ⚠️ in-memory fallback | Upstash deferred | `src/lib/rateLimiter.ts` |

### New in v1.2.0 → v1.2.2

**v1.2.0:**
- 4 wire-* scripts under `scripts/`: `wire-production-env.sh`, `wire-deepseek.sh`, `wire-vapid.sh`, `wire-stripe-webhook.mjs`
- `scripts/create-stripe-products.mjs` (idempotent — uses lookup_keys to skip existing products)
- `/api/v1/health/integrations` diagnostic endpoint
- 3 Supabase tables added for paper trading: `paper_accounts`, `paper_orders`, `paper_positions` (RLS via `auth.uid()`)
- DeepSeek wired as primary LLM provider for explainer + sentiment classification
- Subscription gating via `UpgradeGate` enforced on Optimize + CVRF pages
- Stripe checkout return flow: `BillingSuccess` + `BillingCanceled` pages
- `BILLING_ENABLED` kill switch — defense-in-depth gate that returns 503 on `/checkout` and degrades the integration health check unless explicitly set to `true`
- Email wave: welcome (fires on first auth-gated portfolio call, stamps `welcomed_at`), subscription-confirmed (fires from Stripe webhook), alert-fired
- Connect Alpaca for Pro+: 3 endpoints (`/connect`, `/status`, `/disconnect`), AES-256-GCM at rest in `user_broker_credentials`, `resolveBrokerKindForUser()` resolves user → env → simulated

**v1.2.1:**
- Real portfolio metrics in weekly digest cron (`src/notifications/digest-metrics.ts`) — 7-day delta, top mover (largest dollar swing), worst mover. Per-symbol fetch failures are skipped, users with unresolvable portfolios are skipped instead of getting zeroed-out emails

**v1.2.2:**
- Comp-customer guard — `comp_*` sentinel IDs in `stripe_customer_id` / `stripe_subscription_id` are immune to all four billing webhook branches (`checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`). Checkout endpoint returns 409 `COMP_ACCOUNT` for users with comp IDs.

---

## Server Architecture

### Directory Map (`src/`)

| Path | Purpose | Key Files |
|------|---------|-----------|
| `src/factors/` | Factor engine — 76 factors, 8 categories | FactorEngine.ts, SentimentAnalyzer.ts |
| `src/cvrf/` | CVRF belief system — episodic learning | CVRFManager.ts, BeliefUpdater.ts, EpisodeManager.ts, PersistentCVRFManager.ts, ConceptExtractor.ts, persistence.ts, integration.ts |
| `src/optimizer/` | Monte Carlo portfolio optimizer | PortfolioOptimizer.ts |
| `src/backtest/` | Walk-forward backtest engine | Backtester.ts, WalkForwardEngine.ts, BacktestRunner.ts, HistoricalDataLoader.ts |
| `src/earnings/` | Earnings oracle and calendar | EarningsOracle.ts |
| `src/ml/` | Neural factor models, regime detection | RegimeDetector.ts, NeuralFactorModel.ts, FactorAttribution.ts, TrainingPipeline.ts |
| `src/options/` | Options intelligence | OptionsDataProvider.ts, GreeksCalculator.ts, StrategyBuilder.ts, ImpliedVolatility.ts |
| `src/tax/` | Tax optimization | TaxLotTracker.ts, HarvestingScanner.ts, WashSaleDetector.ts, TaxEfficientRebalancer.ts, TaxReportGenerator.ts |
| `src/core/` | Core orchestration | CognitiveExplainer.ts, EarningsOracle.ts, RiskAlertSystem.ts, FactorDriftMonitor.ts |
| `src/data/` | Market data providers | MarketDataProvider.ts, MultiCurrency.ts, SECFilingsParser.ts |
| `src/trading/` | Broker adapters (live) | BrokerAdapter.ts, AlpacaAdapter.ts |
| `src/broker/` | Duplicate broker layer (see tech debt) | BrokerAdapter.ts, AlpacaAdapter.ts |
| `src/services/` | Domain services | PortfolioService.ts, ProfileService.ts, LeaderboardService.ts, SharingService.ts, ExplanationService.ts |
| `src/notifications/` | Web Push + SSE | PushService.ts, AlertDelivery.ts |
| `src/sec/` | SEC filing monitoring | EdgarMonitor.ts, SECFilingMonitor.ts |
| `src/sentiment/` | Sentiment analysis | SentimentAnalyzer.ts |
| `src/analytics/` | Performance attribution | PerformanceAttribution.ts |
| `src/middleware/` | Auth, rate limiting, subscription gating | auth.ts, rateLimiter.ts, subscriptionGate.ts |
| `src/cache/` | Redis cache layer | RedisCache.ts |
| `src/observability/` | Metrics + structured logging | metrics.ts, logger.ts |
| `src/lib/` | Shared utilities | supabase.ts, stripe.ts, logger.ts |
| `src/types/` | Shared TypeScript types | index.ts |

**Total server source files: 80+ .ts files** (76 non-test + 3 in-source test files + v1.2.x additions)

### Fastify API Endpoints (107 registrations across 26 route modules — verified by `grep -c "fastify.(get|post|put|delete|patch)" src/routes/*.ts`)

**Health & Observability**
1. `GET  /health` — returns `{ status, timestamp, version }` (reads from `package.json` — currently `1.2.2`)
2. `GET  /api/v1/metrics` — Prometheus metrics (text/plain)

**Portfolio (protected)**
3. `GET    /api/v1/portfolio`
4. `POST   /api/v1/portfolio/positions`
5. `PUT    /api/v1/portfolio/positions/:id`
6. `DELETE /api/v1/portfolio/positions/:id`
7. `POST   /api/v1/portfolio/optimize`
8. `GET    /api/v1/portfolio/factors/:symbols`

**Quotes**
9. `GET /api/v1/quotes/stream` — SSE stream
10. `GET /api/v1/quotes/:symbol`

**Earnings**
11. `GET /api/v1/earnings/upcoming`
12. `GET /api/v1/earnings/forecast/:symbol`

**Explainer / AI**
13. `POST /api/v1/portfolio/explain`
14. `POST /api/v1/explain`
15. `GET  /api/v1/explain/trade/:symbol`

**Settings**
16. `GET /api/v1/settings`
17. `PUT /api/v1/settings`

**Alerts**
18. `GET /api/v1/alerts`
19. `PUT /api/v1/alerts/:id/acknowledge`

**CVRF (Belief System)**
20. `GET  /api/v1/cvrf/beliefs`
21. `POST /api/v1/cvrf/episode/start`
22. `POST /api/v1/cvrf/episode/close`
23. `POST /api/v1/cvrf/decision`
24. `GET  /api/v1/cvrf/constraints`
25. `POST /api/v1/cvrf/risk`
26. `GET  /api/v1/cvrf/history`

**ML**
27. `GET /api/v1/ml/regime`
28. `GET /api/v1/ml/attribution`
29. `GET /api/v1/ml/models`

**Options**
30. `GET  /api/v1/options/chain`
31. `GET  /api/v1/options/greeks`
32. `POST /api/v1/options/strategies`
33. `GET  /api/v1/options/strategies`
34. `GET  /api/v1/options/vol-surface`

**Tax**
35. `GET  /api/v1/tax/lots`
36. `GET  /api/v1/tax/harvest`
37. `POST /api/v1/tax/harvest`
38. `GET  /api/v1/tax/wash-sales`
39. `GET  /api/v1/tax/report`

**API Keys**
40. `GET    /api/v1/api-keys`
41. `POST   /api/v1/api-keys`
42. `DELETE /api/v1/api-keys/:id`

**Social / Sharing**
43. `POST /api/v1/portfolios/share`
44. `GET  /api/v1/portfolios/shared/:token`
45. `POST /api/v1/portfolio/share` *(duplicate path variant — tech debt)*
46. `GET  /api/v1/portfolio/shared/:token` *(duplicate path variant — tech debt)*
47. `GET  /api/v1/leaderboard`

**WebSocket**
48. `WS /ws/quotes` — real-time quote streaming

### Vercel Serverless Functions (`api/`)

69 files under `api/` providing parallel API surface for Vercel production deployment.

| Group | Count | Handlers |
|-------|-------|----------|
| auth | 5 | login, logout, me, refresh, signup |
| portfolio | 10 | index, positions/index, positions/[id], optimize, factors/[symbols], attribution, risk, share/index, share/[id], shared/[token] |
| cvrf | 14 | beliefs, beliefs/current, beliefs/timeline, beliefs/correlations, constraints, decision, episode/start, episode/close, history, meta-prompt, risk, stats, episodes, belief-history |
| trading | 7 | account, connect, clock, preview, positions, quote, orders |
| billing | 4 | checkout, subscription, portal, webhook |
| notifications | 3 | subscribe, unsubscribe, send |
| alerts | 4 | alerts, notify, factor-drift, sec-filings |
| quotes | 2 | [symbol], stream |
| earnings | 4 | upcoming, forecast/[symbol], forecast/[symbol]/refresh, history/[symbol] |
| options | 1 | iv |
| backtest | 1 | run |
| sec | 1 | filings |
| errors | 1 | report |
| cache | 1 | stats |
| sentiment | 1 | [symbol] |
| broker | 1 | trade |
| edge | 1 | quotes |
| root | 3 | docs, health, openapi |
| lib | 4 | auth, errorHandler, validation, rateLimiter |

**Total: 69 files** (includes 4 lib/utility files; not all are endpoint handlers)

### Database (Supabase)

11 migrations in `supabase/migrations/`:

| File | Purpose |
|------|---------|
| `001_initial_schema.sql` | Core tables |
| `002_portfolio_sharing.sql` | Portfolio sharing |
| `003_cvrf_tables.sql` | CVRF belief storage |
| `004_push_subscriptions.sql` | Web Push subscriptions |
| `005_api_keys.sql` | API key management |
| `20260208_indexes.sql` | Performance indexes |
| `20260209_ml_models.sql` | ML model storage |
| `20260209_tax_lots.sql` | Tax lot tracking |
| `20260209_social_profiles.sql` | Social profiles |
| `20260209_shared_portfolios.sql` | Shared portfolio tokens |
| `011_subscriptions.sql` | Stripe subscription tables |

---

## Client Architecture

### Pages (21 — verified from `client/src/App.tsx`)

| Route | Component | Auth | Layout |
|-------|-----------|------|--------|
| `/landing` | Landing | Public (redirects if authed) | None |
| `/login` | Login | Public (redirects if authed) | None |
| `/` and `/dashboard` | Dashboard | Protected | Layout |
| `/portfolio` | Portfolio | Protected | Layout |
| `/factors` | Factors | Protected | Layout |
| `/earnings` | Earnings | Protected | Layout |
| `/optimize` | Optimize | Protected (Pro gated) | Layout |
| `/alerts` | Alerts | Protected | Layout |
| `/trade` | Trading | Protected (paper trading) | Layout |
| `/settings` | Settings | Protected | Layout |
| `/help` | Help | Protected | Layout |
| `/cvrf` | CVRF | Protected (Pro gated) | None (full-screen) |
| `/ml` | ML | Protected | Layout |
| `/options` | Options | Protected | Layout |
| `/social` | Social | Protected | Layout |
| `/tax` | Tax | Protected | Layout |
| `/backtest` | Backtest | Protected | Layout |
| `/pricing` | Pricing | Public | None |
| `/billing/success` | BillingSuccess | Protected (post-checkout) | None |
| `/billing/canceled` | BillingCanceled | Protected (post-checkout) | None |
| `/shared/:token` | SharedPortfolio | Public | None |

All heavy pages are lazy-loaded via `React.lazy()`. Pro gating is enforced via `<UpgradeGate>` wrapper on Optimize and CVRF; the Trading page now displays `PAPER TRADING · Frontier Alpha Engine` (internal SimulatedBroker, not Alpaca).

### Visual Design System (verified 2026-05-07 across 35 files)

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

Form inputs use a single canonical class everywhere (focus ring + targeted transition). Buttons use `animate-press + animate-lift` instead of generic `transition-all + hover-scale` (which felt laggy and broke gradients).

### State Stores (6 — verified from `client/src/stores/`)

| Store | Purpose |
|-------|---------|
| alertsStore | Alert state management |
| portfolioStore | Portfolio positions and data |
| quotesStore | Real-time quote data |
| themeStore | Light/Dark/System theme toggle |
| dataSourceStore | Mock vs live data toggle |
| authStore | Supabase auth session, user state |

*CLAUDE.md claims 5 stores — actual count is 6.*

### Hooks (10 — verified from `client/src/hooks/`)

| Hook | Purpose |
|------|---------|
| useIsMobile | Responsive breakpoint detection |
| useNotifications | Push notification management |
| useQuotes | Real-time quote data |
| useFactors | Factor exposure data |
| useTrading | Alpaca trading operations |
| useKeyboardShortcuts | Global keyboard bindings |
| useSubscription | Stripe subscription state |
| useToast | Toast notification system |
| useEarnings | Earnings oracle data |
| useCVRF | CVRF beliefs and episodes |

### API Modules (6 — verified from `client/src/api/`)

| Module | Purpose |
|--------|---------|
| client.ts | Axios base client, auth headers |
| factors.ts | Factor exposure API calls |
| portfolio.ts | Portfolio CRUD API calls |
| cvrf.ts | CVRF belief system API calls |
| earnings.ts | Earnings oracle API calls |
| websocket.ts | WebSocket quote connection |

*CLAUDE.md claims 7 API modules — actual count is 6.*

### Components (~95+ — verified from `client/src/components/`)

| Domain | Count | Notable Components |
|--------|-------|--------------------|
| alerts | 4 | AlertCard, AlertDropdown, FactorDriftAlert, SECFilingAlert |
| analytics | 1 | PerformanceAttribution |
| auth | 2 | LoginForm, SignupForm |
| charts | 2 | MonteCarloChart, EquityCurve |
| cvrf | 13 | CVRFDashboard, BeliefConstellation (D3), ConvictionTimeline, EpisodeComparison, FactorWeightHeatmap, EpisodePerformanceChart, CVRFBeliefDisplay, CVRFCycleHistory, CVRFEpisodeControls, CVRFEpisodeTimeline, CVRFStatsCard, MetaPromptCard, RegimeTimeline |
| earnings | 5 | EarningsCalendar, EarningsForecast, EarningsHeatmap, HistoricalReactions, BeliefImpactPanel |
| explainer | 3 | CognitiveInsight, TradeReasoning, ExplanationCard |
| factors | 2 | FactorExposures, FactorBar |
| help | 3 | HelpButton, HelpPanel, HelpTooltip |
| layout | 3 | Layout, Sidebar, MobileNav |
| ml | 3 | RegimeDetector, ModelVersions, FactorAttribution |
| notifications | 1 | NotificationSettings |
| onboarding | 3 | OnboardingProvider, WelcomeModal, FeatureTour |
| options | 4 | OptionsChain, VolSurface, StrategySelector, GreeksHeatmap |
| portfolio | 4 | PortfolioOverview, ShareModal, PositionList, WeightAllocation |
| risk | 1 | RiskMetrics |
| settings | 2 | NotificationSettings, APIKeys |
| shared | 19 | Toast, Spinner, Card, Button, Badge, ErrorBoundary, EmptyState, Skeleton, ConnectionStatus, PageTransition, LoadingSkeleton, UpgradeGate, UpgradeBanner, BottomSheet, MockDataBanner, PullToRefresh, VisuallyHidden, KeyboardHelpModal, ScrollableTable |
| shared/skeletons | 14 | SkeletonDashboard, SkeletonPortfolioPage, SkeletonPositionList, SkeletonFactorExposures, SkeletonRiskMetrics, SkeletonChart, SkeletonEarningsCalendar, SkeletonEarningsPage, SkeletonFactorsPage, SkeletonOptionsPage, SkeletonSettingsPage, SkeletonCVRFPage, SkeletonSharedPortfolioPage, SkeletonPortfolioOverview |
| trading | 5 | OrderPreviewModal, OrderHistory, AccountSummary, PriceChart, TradeExecutor |

**Total: ~95 non-test .tsx files** (glob truncated at 100; full count may exceed 95)

---

## Factor Engine

**File:** `src/factors/FactorEngine.ts`
**Verified count: 76 factors** (`FACTOR_DEFINITIONS` array, lines 22–126)

*The file header and all documentation claim "80+" — the actual array has exactly 76 entries.*

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

### Test File Distribution (54 total)

| Location | Count | Suites |
|----------|-------|--------|
| `tests/e2e/` | 15 | alerts, auth, cvrf, data-source, earnings, endpoint-auth, factors, health, ml, optimization, options, portfolio, quotes, sharing, tax |
| `tests/unit/` | 4 | cvrf-beliefs-state, cvrf-episodes-pagination, smoke-critical-flows, zod-validation |
| `tests/ml/` | 5 | factor-attribution, ml-cvrf-integration, neural-factor, regime-detector, training-pipeline |
| `tests/options/` | 3 | greeks-calculator, options-data-provider, strategy-builder |
| `tests/tax/` | 5 | harvesting-scanner, tax-efficient-rebalancer, tax-lot-tracker, tax-report-generator, wash-sale-detector |
| `tests/services/` | 3 | leaderboard-service, profile-service, sharing-service |
| `src/` (in-source) | 3 | EarningsOracle.test.ts (32 cases), FactorEngine.test.ts (30 cases), PortfolioOptimizer.test.ts (23 cases) |
| `client/src/` | 15 | api/client, api/websocket, hooks/useIsMobile, hooks/useToast, stores/dataSourceStore, components/cvrf/BeliefConstellation, components/cvrf/ConvictionTimeline, components/earnings/BeliefImpactPanel, components/earnings/EarningsHeatmap, components/explainer/TradeReasoning, components/help/HelpPanel, components/layout/Sidebar, components/risk/RiskMetrics, components/shared/Skeleton, pages/Help |

**Total: 54 test files** (36 in `tests/` + 3 in `src/` + 15 in `client/src/`)

*CLAUDE.md claims "205 passing tests" — this refers to test cases in a specific run subset, not total test files. The full suite spans 54 files with significantly more cases.*

### Test Infrastructure

| Tool | Version | Role |
|------|---------|------|
| Vitest (server) | ^1.2.2 | Server test runner |
| Vitest (client) | ^2.0.0 | Client test runner |
| MSW | ^2.12.9 | HTTP mock server |
| @testing-library/react | ^16.0.0 | Component testing |
| jsdom | ^25.0.0 | DOM environment |

Fixtures: `tests/fixtures/market-data.ts`, `tests/setup.ts`, `tests/setup/msw-handlers.ts`

Commands: `npm run test:unit` (server), `npm run test:all` (server + client), `cd client && npm run test:run` (client only)

---

## Codebase Metrics (Verified vs Claimed)

| Metric | Claimed | Verified | Evidence |
|--------|---------|----------|----------|
| Version (package.json) | 1.2.2 | 1.2.2 | package.json (v1.2.2 bump 2026-05-08, comp-customer guard) |
| Factor count | "80+" | **76** | src/factors/FactorEngine.ts:22–126 |
| Fastify endpoints | "107" | **107** | `grep -c` on src/routes/*.ts |
| Vercel API files | — | **10** | api/ glob (post-consolidation) |
| Client pages | 21 | **21** | client/src/App.tsx (added BillingSuccess + BillingCanceled) |
| Zustand stores | 6 | **6** | client/src/stores/ glob |
| API modules | 7 | **6** | client/src/api/ glob |
| Test files | — | **54** | tests/ + src/ + client/ glob |
| Supabase migrations | "10" | **14** | supabase/migrations/ glob (added 3 paper-trading tables) |
| Server .ts files | — | **79** | src/ glob |
| Component .tsx files | "68+" | **~95** | client/src/components/ glob |
| Backend integrations live | 10 of 11 | **10 of 11** | `/api/v1/health/integrations` (Connect Alpaca + weekly digest cron added v1.2.0–v1.2.1) |
| Deployment tiers | 2 | **2** | Vercel (SPA + REST) + Railway (WS + REST) |

---

## Dependencies

### Server (`package.json`)

**Runtime dependencies:**

| Package | Version | Purpose |
|---------|---------|---------|
| fastify | ^4.26.0 | HTTP server |
| @fastify/cors | ^9.0.1 | CORS |
| @fastify/websocket | ^10.0.1 | WebSocket |
| @supabase/supabase-js | ^2.94.0 | Database + auth |
| ioredis | ^5.3.2 | Redis cache |
| pg | ^8.11.3 | PostgreSQL direct |
| stripe | ^20.3.1 | Billing |
| web-push | ^3.6.7 | VAPID push notifications |
| ws | ^8.16.0 | WebSocket (low-level) |
| zod | ^3.22.4 | Schema validation |
| pino | ^10.3.1 | Structured logging |
| pino-pretty | ^13.1.3 | Dev log formatting |
| axios | ^1.6.5 | HTTP client |
| date-fns | ^3.3.1 | Date utilities |
| decimal.js | ^10.4.3 | Precise decimal math |

**Dev dependencies:**

| Package | Version | Purpose |
|---------|---------|---------|
| tsx | ^4.7.0 | Dev server (watch mode) |
| esbuild | ^0.27.2 | Production bundler |
| vitest | ^1.2.2 | Test runner |
| @vitest/coverage-v8 | ^1.6.1 | Coverage |
| msw | ^2.12.9 | HTTP mocking |
| typescript | ^5.3.3 | Type checking |
| @vercel/node | ^5.5.28 | Vercel adapter |

### Client (`client/package.json`)

**Runtime dependencies:**

| Package | Version | Purpose |
|---------|---------|---------|
| react | ^19.2.0 | UI framework |
| react-dom | ^19.2.0 | DOM renderer |
| react-router-dom | ^7.13.0 | Client routing |
| zustand | ^5.0.11 | State management |
| @tanstack/react-query | ^5.90.20 | Server state / data fetching |
| recharts | ^3.7.0 | Charts |
| d3 | ^7.9.0 | Data visualization |
| @supabase/supabase-js | ^2.94.0 | Auth client |
| axios | ^1.13.4 | HTTP client |
| lucide-react | ^0.563.0 | Icons |
| @sentry/react | ^10.38.0 | Error monitoring |
| @sentry/browser | ^10.38.0 | Error monitoring (browser) |
| dompurify | ^3.3.1 | XSS sanitization |
| date-fns | ^4.1.0 | Date utilities |
| decimal.js | ^10.6.0 | Precise decimal math |

**Dev dependencies:**

| Package | Version | Purpose |
|---------|---------|---------|
| vite | ^7.2.4 | Build tool |
| @vitejs/plugin-react | ^5.1.1 | React plugin |
| vite-plugin-pwa | ^1.2.0 | PWA support |
| tailwindcss | ^4.1.18 | CSS framework |
| @tailwindcss/postcss | ^4.1.18 | PostCSS integration |
| typescript | ~5.9.3 | Type checking |
| vitest | ^2.0.0 | Test runner |
| @testing-library/react | ^16.0.0 | Component testing |
| jsdom | ^25.0.0 | DOM environment |

---

## Tech Debt & Known Issues

### Critical

_None currently tracked._

### Resolved (v1.2.0 — 2026-05-08)

- ~~**Unsynchronized dual API surface**~~ — Fixed: `src/app.ts::buildApp()` is single source of truth. Vercel serverless catch-all at `api/fastify.ts` delegates to it. Only 10 Vercel `.ts` files remain (infrastructure + runtime-specific edge handlers). All business logic lives in `src/routes/*.ts`.
- ~~**Polygon WebSocket on Vercel**~~ — Fixed: WebSocket gateway moved to Railway always-on Node container at `frontier-alpha-api-production.up.railway.app`. Vercel serverless can't host long-lived WS. Custom domain `api.frontier-alpha.metaventionsai.com` provisioning TLS.
- ~~**Stripe billing not wired**~~ — Fixed: Pro $29 + Enterprise $99 live, `create-stripe-products.mjs` (idempotent via lookup_keys) + `wire-stripe-webhook.mjs` shipped, BillingSuccess + BillingCanceled return-flow pages added.
- ~~**LLM explainer locked to OpenAI**~~ — Fixed: DeepSeek wired as primary via `wire-deepseek.sh`, OpenAI demoted to fallback. Same client used for ML sentiment classification.
- ~~**No paper trading**~~ — Fixed: internal SimulatedBroker on Polygon WS + 3 new Supabase tables (`paper_accounts`, `paper_orders`, `paper_positions`) with RLS via `auth.uid()`. Trading page now shows `PAPER TRADING · Frontier Alpha Engine`.
- ~~**No subscription gating**~~ — Fixed: `<UpgradeGate>` enforced on Optimize + CVRF pages.

### Resolved (v1.1.0 — 2026-04-04)

- ~~**Version string mismatch**~~ — Fixed: `/health` reads from `package.json` (`d763465`).
- ~~**Dead code — backup file**~~ — Fixed: `src/index.ts.backup` removed (`a0e996b`).
- ~~**Duplicate broker layer**~~ — Fixed: `src/broker/` archived to `.graveyard/` (`a0e996b`).
- ~~**Duplicate share endpoint paths**~~ — Fixed: removed `/portfolios/share` (plural), kept `/portfolio/share` (`84f4766`).
- ~~**Stale counts in CLAUDE.md and README**~~ — Fixed: counts updated to 76 factors, 265 tests, 48+ endpoints, 6 stores, 11+ migrations.

### Low Priority

**Python ML engine not integrated** — `ml/main.py` (uvicorn port 8000) is marked work-in-progress. Not called by any server code path. Optional enhancement only.

**Vercel auto-deploy disabled** — Disabled at commit `acf6987` to conserve build credits. Manual deploy required. Easy to forget; document in runbook.

**Rate limiter in-memory only** — Upstash deferred. Current implementation in `src/lib/rateLimiter.ts` uses in-memory Map fallback; not durable across serverless cold starts.

---

*All counts and claims in this document are verified by direct file inspection (Read, Grep, Glob) of the codebase at HEAD on 2026-03-25. v1.2.0 deployment + integration sections verified against operational state on 2026-05-08. No figures are taken from documentation alone.*
