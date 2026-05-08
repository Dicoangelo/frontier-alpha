# Changelog

All notable changes to Frontier Alpha are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
