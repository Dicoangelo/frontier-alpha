# Frontier Alpha

> **Cognitive Factor Intelligence Platform** -- AI-powered portfolio optimization with explainable recommendations and self-improving belief systems.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![Fastify](https://img.shields.io/badge/Fastify-4.x-000000?logo=fastify&logoColor=white)](https://fastify.dev/)
[![Vite](https://img.shields.io/badge/Vite-7.x-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3FCF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![Vitest](https://img.shields.io/badge/Vitest-Tests-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## What is Frontier Alpha?

Frontier Alpha brings **institutional-grade quantitative analysis** to retail investors with two critical innovations: **it explains itself**, and **it learns from its own decisions**.

Unlike black-box quant tools or simplistic robo-advisors, Frontier Alpha:

- Analyzes **80+ research-backed factors** across six categories (not just Fama-French 5).
- Evolves investment beliefs through **CVRF** (Conceptual Verbal Reinforcement Framework), a self-improving system that learns what works episode by episode.
- Provides **plain-language explanations** for every recommendation, powered by factor analysis and optional LLM enhancement.
- Forecasts **earnings impact** with expected moves, historical beat rates, and actionable positioning guidance.
- Runs **walk-forward backtests** with CVRF integration to validate strategies against real market history.

<!-- Screenshots placeholder: Add images to docs/screenshots/ and reference them here -->
<!-- ![Dashboard](docs/screenshots/dashboard.png) -->
<!-- ![Factor Analysis](docs/screenshots/factors.png) -->
<!-- ![CVRF Beliefs](docs/screenshots/cvrf.png) -->

---

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/Dicoangelo/frontier-alpha.git
cd frontier-alpha && npm install && cd client && npm install && cd ..

# 2. Configure environment
cp .env.example .env
# Edit .env with your Polygon.io and Alpha Vantage API keys (optional -- mock data works without them)

# 3. Start development
npm run dev:all
```

The client opens at `http://localhost:5173` and the API at `http://localhost:3000/api/v1/health`.

---

## Features

| Feature | Description |
|---------|-------------|
| **Factor Engine** | 80+ factor exposures: momentum, value, quality, volatility, size, sentiment, macro, sector |
| **Portfolio Optimizer** | Monte Carlo simulation with max Sharpe, min variance, and risk parity strategies |
| **CVRF Intelligence** | Self-improving belief system that learns from episode-over-episode performance |
| **Cognitive Explainer** | AI explanations for every recommendation with confidence scores and source attribution |
| **Earnings Oracle** | Calendar, forecasts, historical reactions, expected moves, and positioning recommendations |
| **Walk-Forward Backtest** | Test strategies with CVRF integration against real historical data |
| **Risk Alerts** | Real-time monitoring for drawdown, volatility, concentration, and eight other risk types |
| **Push Notifications** | Browser push alerts for risk events and earnings announcements |
| **PWA Support** | Installable as a native-like app with offline caching |

---

## Tech Stack

**Frontend** -- React 19, Vite 7, Zustand, React Query, Recharts, D3, Tailwind CSS, Lucide Icons

**Backend** -- Node.js 20, Fastify 4, TypeScript 5.3, Zod validation

**Database** -- Supabase (PostgreSQL), Row Level Security, real-time subscriptions

**Data Sources** -- Polygon.io (real-time quotes), Alpha Vantage (fundamentals and earnings), Ken French Library (academic factor returns)

**Infrastructure** -- Vercel (serverless + static), Docker, Railway, Sentry (observability)

**Testing** -- Vitest, Testing Library, MSW (Mock Service Worker)

---

## API

The production API is deployed on Vercel:

- **Health Check:** `/api/v1/health`
- **OpenAPI Spec:** `/api/openapi`

### Example Requests

```bash
# Real-time quote
curl https://frontier-alpha.vercel.app/api/v1/quotes/AAPL

# Factor exposures
curl https://frontier-alpha.vercel.app/api/v1/portfolio/factors/AAPL,NVDA,MSFT

# Optimize a portfolio
curl -X POST https://frontier-alpha.vercel.app/api/v1/portfolio/optimize \
  -H "Content-Type: application/json" \
  -d '{"symbols": ["AAPL","NVDA","MSFT","GOOGL","AMZN"], "config": {"objective": "max_sharpe"}}'

# Earnings forecast
curl https://frontier-alpha.vercel.app/api/v1/earnings/forecast/NVDA

# CVRF beliefs
curl https://frontier-alpha.vercel.app/api/v1/cvrf/beliefs
```

See the full [API Reference](docs/API.md) for all endpoints, request/response formats, and error codes.

---

## Architecture

```
frontier-alpha/
|-- api/                   Vercel serverless functions (deployment layer)
|-- client/                Vite + React 19 frontend
|   |-- src/components/    UI components organized by domain
|   |-- src/pages/         Route-level page components
|   |-- src/stores/        Zustand state management
|   `-- src/hooks/         Custom React hooks
|-- src/                   Fastify server + business logic
|   |-- factors/           Factor Engine (80+ factors)
|   |-- optimizer/         Monte Carlo portfolio optimizer
|   |-- cvrf/              CVRF Manager + persistence + integration
|   |-- earnings/          Earnings Oracle + historical analysis
|   |-- backtest/          Walk-forward backtest runner
|   `-- middleware/        Auth (Supabase JWT)
|-- supabase/migrations/   Database schema (4 migrations)
|-- ml/                    Optional Python ML engine
|-- tests/                 Test suites
`-- docs/                  Documentation
```

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

## Development

```bash
npm run dev:all          # Start API + client concurrently
npm run dev              # API server only (port 3000)
npm run client:dev       # Client only (port 5173)
npm test                 # Run server tests
npm run test:all         # Run all tests (server + client)
npm run test:coverage    # Coverage report
npm run db:migrate       # Apply Supabase migrations
npm run build            # Production build
```

See the [Developer Guide](docs/DEVELOPER.md) for complete setup instructions.

---

## License

MIT License. See [LICENSE](LICENSE) for details.

---

*Built by [Metaventions AI](https://github.com/Dicoangelo)*
