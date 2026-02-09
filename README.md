<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=0:1a1a2e,50:0d47a1,100:00d9ff&height=200&section=header&text=Frontier%20Alpha&fontSize=60&fontColor=ffffff&animation=fadeIn&fontAlignY=35&desc=Cognitive%20Factor%20Intelligence%20Platform&descSize=20&descAlignY=55" />
</p>

<p align="center">
  <strong>AI-powered portfolio optimization with explainable recommendations and self-improving belief systems</strong>
</p>

<p align="center">
  <em>"Let the invention be hidden in your vision"</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Tests-205-00d9ff?style=for-the-badge" alt="Tests" />
  <img src="https://img.shields.io/badge/Lines-62,000+-0d47a1?style=for-the-badge" alt="Lines" />
  <img src="https://img.shields.io/badge/Files-242+-1a1a2e?style=for-the-badge" alt="Files" />
  <img src="https://img.shields.io/badge/Endpoints-29+-00d9ff?style=for-the-badge" alt="Endpoints" />
  <img src="https://img.shields.io/badge/Version-1.0.4-0d47a1?style=for-the-badge" alt="Version" />
  <img src="https://img.shields.io/badge/Status-Production-success?style=for-the-badge" alt="Status" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=white" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.3-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Fastify-4.x-000000?style=for-the-badge&logo=fastify&logoColor=white" alt="Fastify" />
  <img src="https://img.shields.io/badge/Vite-7.x-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/Supabase-PostgreSQL-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase" />
  <img src="https://img.shields.io/badge/Polygon.io-Market_Data-7C3AED?style=for-the-badge" alt="Polygon.io" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/GPT--4o-Cognitive_Explainer-412991?style=for-the-badge&logo=openai&logoColor=white" alt="GPT-4o" />
  <img src="https://img.shields.io/badge/Factor_Engine-80+_Factors-0d47a1?style=for-the-badge" alt="Factor Engine" />
  <img src="https://img.shields.io/badge/CVRF-Episodic_Learning-00d9ff?style=for-the-badge" alt="CVRF" />
  <img src="https://img.shields.io/badge/PWA-Installable-1a1a2e?style=for-the-badge&logo=pwa&logoColor=white" alt="PWA" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Metaventions_AI-Architected_Intelligence-1a1a2e?style=for-the-badge" alt="Metaventions AI" />
</p>

<p align="center">
  <a href="https://frontier-alpha.metaventionsai.com">
    <img src="https://img.shields.io/badge/Live_Demo-frontier--alpha.vercel.app-00d9ff?style=for-the-badge" alt="Live Demo" />
  </a>
</p>

---

## Summary • Architecture • Features • Quick Start • Core Systems • API • Development • Roadmap • Contact

---

## Executive Summary

A **62,000+ line**, **242-file** full-stack TypeScript platform that brings **institutional-grade quantitative analysis** to retail investors with two critical innovations: **it explains itself**, and **it learns from its own decisions**.

Unlike black-box quant tools or simplistic robo-advisors, Frontier Alpha:

- Analyzes **80+ research-backed factors** across six categories — momentum, value, quality, volatility, size, sentiment, macro, and sector
- Evolves investment beliefs through **CVRF** (Conceptual Verbal Reinforcement Framework) — a self-improving system that learns what works episode by episode
- Provides **plain-language explanations** for every recommendation, powered by factor analysis and optional LLM enhancement via GPT-4o
- Forecasts **earnings impact** with expected moves, historical beat rates, and actionable positioning guidance
- Runs **walk-forward backtests** with CVRF integration to validate strategies against real market history
- Streams **real-time market data** via WebSocket with SSE and polling fallback

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          FRONTIER ALPHA PLATFORM                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                        CLIENT (React 19 + Vite 7)                     │  │
│  │                                                                       │  │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────────────┐ │  │
│  │  │ Portfolio   │ │ Factor     │ │ Earnings   │ │ CVRF Beliefs      │ │  │
│  │  │ Dashboard   │ │ Explorer   │ │ Calendar   │ │ Visualization     │ │  │
│  │  └────────────┘ └────────────┘ └────────────┘ └────────────────────┘ │  │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────────────┐ │  │
│  │  │ Risk Alerts │ │ Backtest   │ │ Explainer  │ │ Options Chain     │ │  │
│  │  │ Monitor     │ │ Runner     │ │ Cards      │ │ Analysis          │ │  │
│  │  └────────────┘ └────────────┘ └────────────┘ └────────────────────┘ │  │
│  │                                                                       │  │
│  │  58 Components │ Zustand │ React Query │ Recharts │ D3 │ Tailwind    │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│                              REST + SSE                                     │
│                                    │                                        │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                      SERVER (Fastify 4 + Node 20)                     │  │
│  │                                                                       │  │
│  │  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────────────┐ │  │
│  │  │  Factor Engine   │ │  CVRF Manager   │ │  Earnings Oracle        │ │  │
│  │  │  80+ factors     │ │  Belief updater │ │  Forecasts + history    │ │  │
│  │  │  6 categories    │ │  Episode mgmt   │ │  Expected moves         │ │  │
│  │  │  Sentiment       │ │  Concept extract│ │  Beat rates             │ │  │
│  │  └─────────────────┘ └─────────────────┘ └─────────────────────────┘ │  │
│  │  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────────────┐ │  │
│  │  │  Optimizer       │ │  Explainer      │ │  Backtest Runner        │ │  │
│  │  │  Monte Carlo     │ │  LLM + template │ │  Walk-forward           │ │  │
│  │  │  Max Sharpe      │ │  GPT-4o         │ │  CVRF integration       │ │  │
│  │  │  Min variance    │ │  Confidence     │ │  Historical replay      │ │  │
│  │  └─────────────────┘ └─────────────────┘ └─────────────────────────┘ │  │
│  │  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────────────┐ │  │
│  │  │  Risk Alerts     │ │  Notifications  │ │  Analytics + Cache      │ │  │
│  │  │  11 alert types  │ │  Push (browser) │ │  Sentry observability   │ │  │
│  │  └─────────────────┘ └─────────────────┘ └─────────────────────────┘ │  │
│  │                                                                       │  │
│  │  29+ Endpoints │ Zod Validation │ Supabase JWT Auth │ TypeScript      │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                        DATA LAYER                                     │  │
│  │                                                                       │  │
│  │  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────────────┐ │  │
│  │  │ Supabase         │ │ Polygon.io      │ │ Alpha Vantage           │ │  │
│  │  │ PostgreSQL + RLS │ │ Real-time quotes│ │ Fundamentals + earnings │ │  │
│  │  │ Real-time subs   │ │ WebSocket stream│ │ Ken French Library      │ │  │
│  │  └─────────────────┘ └─────────────────┘ └─────────────────────────┘ │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  OPTIONAL: Python ML Engine (uvicorn :8000)                           │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Directory Structure

```
frontier-alpha/
├── api/                      Vercel serverless functions (deployment layer)
├── client/                   Vite + React 19 frontend
│   └── src/
│       ├── components/       58 UI components across 18 domains
│       │   ├── portfolio/    Portfolio dashboard + optimizer
│       │   ├── factors/      Factor explorer + visualizations
│       │   ├── earnings/     Earnings calendar + forecasts
│       │   ├── cvrf/         CVRF beliefs visualization
│       │   ├── explainer/    Cognitive insight cards
│       │   ├── risk/         Risk alert monitor
│       │   ├── charts/       Recharts + D3 visualizations
│       │   ├── trading/      Trade execution interface
│       │   ├── options/      Options chain analysis
│       │   └── ...           alerts, analytics, auth, settings, etc.
│       ├── pages/            Route-level page components
│       ├── stores/           Zustand state management
│       └── hooks/            Custom React hooks
├── src/                      Fastify server + business logic
│   ├── factors/              Factor Engine (80+ factors)
│   ├── optimizer/            Monte Carlo portfolio optimizer
│   ├── cvrf/                 CVRF Manager + persistence + integration
│   ├── earnings/             Earnings Oracle + historical analysis
│   ├── backtest/             Walk-forward backtest runner
│   ├── services/             ExplanationService, PortfolioService
│   ├── sentiment/            Sentiment analysis engine
│   ├── trading/              Trade execution layer
│   ├── options/              Options pricing + chain analysis
│   ├── analytics/            Usage analytics
│   ├── notifications/        Push notification system
│   ├── cache/                Caching layer
│   ├── observability/        Sentry integration
│   ├── middleware/           Auth (Supabase JWT)
│   └── types/                Shared type definitions
├── supabase/migrations/      Database schema (6 migrations)
├── ml/                       Optional Python ML engine
├── tests/                    Test suites (205 total)
└── docs/                     Documentation
```

---

## Features

| Feature | Description |
|---------|-------------|
| **Factor Engine** | 80+ factor exposures across momentum, value, quality, volatility, size, sentiment, macro, and sector categories |
| **Portfolio Optimizer** | Monte Carlo simulation with max Sharpe, min variance, and risk parity optimization strategies |
| **CVRF Intelligence** | Self-improving belief system that learns from episode-over-episode performance — investment convictions that evolve |
| **Cognitive Explainer** | Plain-language AI explanations for every recommendation with confidence scores and source attribution (GPT-4o + template fallback) |
| **Earnings Oracle** | Calendar, forecasts, historical reactions, expected moves, and positioning recommendations |
| **Walk-Forward Backtest** | Test strategies with CVRF integration against real historical market data |
| **Risk Alerts** | Real-time monitoring for drawdown, volatility, concentration, and 8 other risk event types |
| **Options Analysis** | Options chain visualization, pricing models, and strategy analysis |
| **Real-time Streaming** | WebSocket market data with SSE and polling fallback for universal connectivity |
| **Push Notifications** | Browser push alerts for risk events and earnings announcements |
| **PWA Support** | Installable as a native-like app with offline caching and background sync |
| **Sentiment Analysis** | Market sentiment scoring from multiple data sources |

---

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/Dicoangelo/frontier-alpha.git
cd frontier-alpha && npm install && cd client && npm install && cd ..

# 2. Configure environment
cp .env.example .env
# Edit .env with your Polygon.io and Alpha Vantage API keys
# (optional — mock data works without them)

# 3. Start development
npm run dev:all
```

The client opens at `http://localhost:5173` and the API at `http://localhost:3000/api/v1/health`.

**Live Demo**: [frontier-alpha.metaventionsai.com](https://frontier-alpha.metaventionsai.com)

---

## Core Systems

### Factor Engine (80+ Factors)

The Factor Engine computes quantitative factor exposures across six research-backed categories, going well beyond the standard Fama-French 5-factor model.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FACTOR ENGINE                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐              │
│  │ MOMENTUM   │ │   VALUE    │ │  QUALITY   │ │ VOLATILITY │              │
│  │ Price trend│ │ P/E, P/B   │ │ ROE, margin│ │ Beta, std  │              │
│  │ RSI, MACD  │ │ EV/EBITDA  │ │ Debt ratio │ │ Drawdown   │              │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘              │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐              │
│  │    SIZE    │ │ SENTIMENT  │ │   MACRO    │ │   SECTOR   │              │
│  │ Market cap │ │ News/social│ │ Rates, FX  │ │ Relative   │              │
│  │ Float      │ │ Analyst    │ │ Commodities│ │ Performance│              │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘              │
│                                                                             │
│  Input: Ticker(s) → 80+ factor scores → Composite ranking → Explanation    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

| File | Purpose |
|------|---------|
| `src/factors/FactorEngine.ts` | Core factor computation engine |
| `src/factors/SentimentAnalyzer.ts` | Sentiment-specific factor analysis |
| `src/factors/index.ts` | Module exports |

### CVRF Intelligence (Episodic Learning)

The **Conceptual Verbal Reinforcement Framework** is a self-improving belief system. Unlike static factor models, CVRF learns from its own track record — adjusting conviction strength based on what actually worked.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CVRF — EPISODIC LEARNING LOOP                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Episode N                                                                  │
│    │                                                                        │
│    ▼                                                                        │
│  [Concept Extractor] → Extract beliefs from recommendations                │
│    │                                                                        │
│    ▼                                                                        │
│  [Belief Updater] → Compare predictions vs actual outcomes                 │
│    │                   Reinforce correct beliefs                            │
│    │                   Weaken incorrect beliefs                             │
│    ▼                                                                        │
│  [Episode Manager] → Track performance across episodes                     │
│    │                   Detect regime changes                               │
│    ▼                                                                        │
│  [Persistent CVRF] → Store beliefs in Supabase                             │
│    │                   Survive restarts                                     │
│    ▼                                                                        │
│  Episode N+1 → Better recommendations                                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

| File | Purpose |
|------|---------|
| `src/cvrf/CVRFManager.ts` | Core belief management and update logic |
| `src/cvrf/BeliefUpdater.ts` | Reinforcement learning on belief strength |
| `src/cvrf/ConceptExtractor.ts` | Extract investment concepts from analysis |
| `src/cvrf/EpisodeManager.ts` | Track and compare episode performance |
| `src/cvrf/PersistentCVRFManager.ts` | Supabase persistence layer |
| `src/cvrf/integration.ts` | Integration with optimizer and backtest |

### Earnings Oracle

Forecasts earnings impact with historical analysis, expected moves, and positioning guidance.

| Capability | Description |
|-----------|-------------|
| **Calendar** | Upcoming earnings dates with consensus estimates |
| **Historical Reactions** | Past earnings surprises and price moves |
| **Expected Moves** | Options-implied move magnitude |
| **Beat Rates** | Historical beat/miss frequency by ticker |
| **Positioning** | Pre/post-earnings trade recommendations |

### Cognitive Explainer (LLM + Template)

Every recommendation comes with a plain-language explanation. The system uses a dual-mode approach:

| Mode | Provider | Use Case |
|------|----------|----------|
| **LLM Enhanced** | GPT-4o | Rich narrative with market context and nuance |
| **Template Fallback** | Built-in | Structured explanation from factor scores (no API needed) |

Both modes include confidence scores and source attribution so the user knows exactly why a recommendation was made.

### Real-time Streaming

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    REAL-TIME DATA PIPELINE                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Polygon.io ──WebSocket──▶ Server ──SSE──▶ Client                          │
│                              │                                              │
│                              ├── Quote cache (in-memory)                    │
│                              ├── Risk alert evaluation                      │
│                              └── Push notification triggers                 │
│                                                                             │
│  Fallback chain: WebSocket → SSE → Polling (30s interval)                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## API

The production API is deployed on Vercel at `https://frontier-alpha.metaventionsai.com`.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/health` | GET | Health check |
| `/api/openapi` | GET | OpenAPI specification |
| `/api/v1/quotes/:symbol` | GET | Real-time quote |
| `/api/v1/portfolio/factors/:symbols` | GET | Factor exposures |
| `/api/v1/portfolio/optimize` | POST | Portfolio optimization |
| `/api/v1/earnings/forecast/:symbol` | GET | Earnings forecast |
| `/api/v1/cvrf/beliefs` | GET | Current CVRF beliefs |

### Example Requests

```bash
# Real-time quote
curl https://frontier-alpha.metaventionsai.com/api/v1/quotes/AAPL

# Factor exposures
curl https://frontier-alpha.metaventionsai.com/api/v1/portfolio/factors/AAPL,NVDA,MSFT

# Optimize a portfolio
curl -X POST https://frontier-alpha.metaventionsai.com/api/v1/portfolio/optimize \
  -H "Content-Type: application/json" \
  -d '{"symbols": ["AAPL","NVDA","MSFT","GOOGL","AMZN"], "config": {"objective": "max_sharpe"}}'

# Earnings forecast
curl https://frontier-alpha.metaventionsai.com/api/v1/earnings/forecast/NVDA

# CVRF beliefs
curl https://frontier-alpha.metaventionsai.com/api/v1/cvrf/beliefs
```

See the full [API Reference](docs/API.md) for all 29+ endpoints, request/response formats, and error codes.

---

## Development

```bash
npm run dev:all          # Start API + client concurrently
npm run dev              # API server only (port 3000)
npm run client:dev       # Client only (port 5173)
npm test                 # Run server tests (watch mode)
npm run test:unit        # Server unit tests (single run)
npm run test:all         # All tests (server + client) — 205 total
npm run test:coverage    # Coverage report
npm run lint             # ESLint
npm run build            # Production build
npm run db:migrate       # Apply Supabase migrations
npm run ml:start         # Optional Python ML engine (port 8000)
```

See the [Developer Guide](docs/DEVELOPER.md) for complete setup instructions.

---

## Documentation

| Document | Description |
|----------|-------------|
| [API Reference](docs/API.md) | Complete endpoint documentation with examples |
| [User Guide](docs/USER_GUIDE.md) | End-user guide: features, workflows, PWA installation |
| [Developer Guide](docs/DEVELOPER.md) | Setup, architecture decisions, testing, deployment |
| [Protocol](docs/PROTOCOL.md) | Discovery and innovation protocol |
| [Changelog](CHANGELOG.md) | Version history and feature log |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 19, Vite 7, TypeScript 5.3, Tailwind CSS, Zustand, React Query |
| **Visualization** | Recharts, D3.js, Lucide Icons |
| **Backend** | Node.js 20, Fastify 4, TypeScript 5.3, Zod validation |
| **Database** | Supabase (PostgreSQL), Row Level Security, real-time subscriptions |
| **Market Data** | Polygon.io (real-time quotes), Alpha Vantage (fundamentals + earnings) |
| **Academic Data** | Ken French Library (academic factor returns) |
| **AI** | GPT-4o (cognitive explanations) |
| **Infrastructure** | Vercel (serverless + static), Docker, Railway, Sentry |
| **Testing** | Vitest (205 tests), Testing Library, MSW (Mock Service Worker) |
| **PWA** | Service Worker, Web Push API, offline caching |

---

## Roadmap

### Phase 1 — Complete

- [x] Factor Engine (80+ factors across 6 categories)
- [x] Portfolio Optimizer (Monte Carlo, max Sharpe, min variance, risk parity)
- [x] CVRF Intelligence (episodic learning, belief persistence)
- [x] Cognitive Explainer (GPT-4o + template dual-mode)
- [x] Earnings Oracle (calendar, forecasts, historical reactions)
- [x] Walk-Forward Backtest (CVRF-integrated historical replay)
- [x] Risk Alert System (11 alert types, real-time monitoring)
- [x] Push Notifications (browser push for risk + earnings events)
- [x] PWA Support (installable, offline caching)
- [x] Real-time Streaming (WebSocket → SSE → Polling fallback)
- [x] Options Chain Analysis
- [x] Supabase Auth + RLS
- [x] Vercel Deployment + CI/CD

### Phase 2 — Next

- [ ] Social sentiment aggregation (X, Reddit, StockTwits)
- [ ] Multi-portfolio management
- [ ] Sector rotation signals
- [ ] Advanced options strategies (spreads, iron condors)
- [ ] Mobile companion app
- [ ] Collaborative portfolios
- [ ] Webhook integrations (Slack, Discord alerts)

---

## License

MIT License — See [LICENSE](LICENSE)

---

## Contact

**Metaventions AI**
Dico Angelo
dicoangelo@metaventionsai.com

<p align="center">
  <a href="https://metaventionsai.com">
    <img src="https://img.shields.io/badge/Metaventions_AI-Website-00d9ff?style=for-the-badge" alt="Website" />
  </a>
  <a href="https://github.com/Dicoangelo">
    <img src="https://img.shields.io/badge/GitHub-Dicoangelo-1a1a2e?style=for-the-badge&logo=github" alt="GitHub" />
  </a>
</p>

<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=0:1a1a2e,50:0d47a1,100:00d9ff&height=100&section=footer" />
</p>
