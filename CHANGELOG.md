# Changelog

All notable changes to Frontier Alpha are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
