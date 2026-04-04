# Changelog

All notable changes to Frontier Alpha are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
