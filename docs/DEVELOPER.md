# Frontier Alpha Developer Guide

Setup, architecture, and development workflow for contributors.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Local Development](#local-development)
4. [Project Structure](#project-structure)
5. [Testing](#testing)
6. [Database Migrations](#database-migrations)
7. [Deployment](#deployment)
8. [Architecture Decisions](#architecture-decisions)

---

## Prerequisites

| Requirement | Version | Purpose |
|-------------|---------|---------|
| Node.js | 20+ | Runtime for server and build tooling |
| npm | 10+ | Package management |
| Git | 2.x | Version control |
| Supabase CLI | Latest | Database migrations (optional for local) |
| Python 3.8+ | Optional | ML engine (FinBERT sentiment, PyPortfolioOpt) |

Verify your environment:

```bash
node --version   # Should print v20.x or higher
npm --version    # Should print 10.x or higher
```

---

## Environment Setup

### 1. Clone the repository

```bash
git clone https://github.com/Dicoangelo/frontier-alpha.git
cd frontier-alpha
```

### 2. Install dependencies

```bash
npm install
cd client && npm install && cd ..
```

Or use the convenience script:

```bash
npm install && npm run client:install
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
# Required for real market data
POLYGON_API_KEY=your_polygon_api_key
ALPHA_VANTAGE_API_KEY=your_alpha_vantage_key

# Server
PORT=3000
NODE_ENV=development

# Database (optional -- uses mock data without these)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key

# Client-side Supabase (set in client/.env or root .env)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Optional
REDIS_URL=redis://localhost:6379
ML_SENTIMENT_ENDPOINT=http://localhost:8000
OPENAI_API_KEY=your-openai-key  # For LLM-enhanced explanations
```

**Note:** The application runs without API keys by using mock data generators. This is useful for UI development and testing without incurring API costs.

---

## Local Development

### Start everything

```bash
npm run dev:all
```

This starts both the Fastify API server (port 3000) and the Vite client dev server (port 5173) concurrently.

### Start individually

```bash
# API server with hot reload (tsx watch)
npm run dev

# Client dev server (Vite)
npm run client:dev
```

### Verify it works

- API health: http://localhost:3000/health
- Client: http://localhost:5173
- API quote: http://localhost:3000/api/v1/quotes/AAPL

### ML Engine (optional)

```bash
cd ml
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

---

## Project Structure

```
frontier-alpha/
|
|-- api/                        # Vercel serverless functions
|   |-- docs.ts                 # OpenAPI docs endpoint
|   |-- health.ts               # Root health check
|   |-- openapi.ts              # OpenAPI spec handler
|   `-- v1/                     # API v1 routes
|       |-- alerts/             # Risk alert endpoints
|       |-- auth/               # Auth-related endpoints
|       |-- backtest/           # Backtest runner
|       |-- cvrf/               # CVRF endpoints (beliefs, episodes, history, etc.)
|       |-- earnings/           # Earnings calendar, forecast, history
|       |-- explain.ts          # AI explanation endpoint
|       |-- health.ts           # Health check v1
|       |-- notifications/      # Push subscription management
|       |-- portfolio/          # Portfolio CRUD and optimization
|       |-- quotes/             # Quote endpoints
|       |-- settings/           # User settings
|       `-- ...
|
|-- client/                     # Vite + React frontend
|   |-- src/
|   |   |-- App.tsx             # Root component and routing
|   |   |-- main.tsx            # Entry point
|   |   |-- index.css           # Global styles (Tailwind)
|   |   |-- components/         # UI components by domain
|   |   |   |-- shared/         # Reusable components (Button, Card, ErrorBoundary, etc.)
|   |   |   |-- portfolio/      # Portfolio-specific components
|   |   |   |-- cvrf/           # CVRF visualization components
|   |   |   |-- earnings/       # Earnings calendar components
|   |   |   |-- charts/         # D3/Recharts chart components
|   |   |   |-- factors/        # Factor analysis displays
|   |   |   `-- ...
|   |   |-- pages/              # Route-level page components
|   |   |-- hooks/              # Custom React hooks
|   |   |-- stores/             # Zustand state stores
|   |   |-- lib/                # Utility libraries (Supabase client, Sentry)
|   |   |-- types/              # TypeScript type definitions
|   |   |-- api/                # API client functions
|   |   `-- service-worker.ts   # PWA service worker
|   |-- package.json
|   `-- vite.config.ts
|
|-- src/                        # Server-side source (Fastify)
|   |-- index.ts                # Server entry point and route registration
|   |-- types/                  # Shared TypeScript types
|   |-- factors/                # Factor Engine (80+ factors)
|   |-- optimizer/              # Portfolio Optimizer (Monte Carlo)
|   |-- core/                   # Cognitive Explainer, Earnings Oracle
|   |-- cvrf/                   # CVRF Manager, persistence, integration
|   |-- data/                   # Market Data Provider (Polygon, Alpha Vantage)
|   |-- earnings/               # Earnings Oracle with historical analysis
|   |-- backtest/               # Backtest Runner with walk-forward
|   |-- middleware/             # Auth middleware (Supabase JWT)
|   |-- services/              # Business logic services
|   |-- notifications/         # Push notification service
|   |-- lib/                   # Supabase admin client, utilities
|   |-- cache/                 # Caching layer
|   `-- ...
|
|-- ml/                         # Python ML engine
|   |-- main.py                 # FastAPI server
|   `-- requirements.txt
|
|-- supabase/
|   `-- migrations/             # SQL migration files
|       |-- 001_initial_schema.sql
|       |-- 002_portfolio_sharing.sql
|       |-- 003_cvrf_tables.sql
|       `-- 004_push_subscriptions.sql
|
|-- tests/                      # Test suites
|-- scripts/                    # Utility scripts
|-- docs/                       # Documentation
|-- package.json                # Root package with all scripts
|-- tsconfig.json               # TypeScript configuration
|-- vitest.config.ts            # Vitest configuration
|-- vercel.json                 # Vercel deployment configuration
|-- Dockerfile                  # Container build
`-- docker-compose.yml          # Docker Compose setup
```

---

## Testing

### Run all tests

```bash
# Server tests
npm test

# Client tests
npm run client:test

# Both
npm run test:all
```

### Unit tests

```bash
npm run test:unit          # Server unit tests
cd client && npm run test:run   # Client unit tests
```

### End-to-end tests

```bash
npm run test:e2e
```

### Test coverage

```bash
npm run test:coverage           # Server coverage
cd client && npm run test:coverage   # Client coverage
```

### Test framework

- **Vitest** is the test runner for both server and client.
- **MSW (Mock Service Worker)** is available for mocking API calls in tests.
- **Testing Library** (`@testing-library/react`) is used for component testing.
- **jsdom** provides the browser environment for client tests.

### Writing tests

Server tests go in `src/**/*.test.ts` or `tests/`. Client tests go in `client/src/__tests__/` or colocated as `*.test.tsx` files.

Example component test:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { EmptyState } from '../components/shared/EmptyState';

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(<EmptyState title="No data" description="Nothing to show" />);
    expect(screen.getByText('No data')).toBeInTheDocument();
    expect(screen.getByText('Nothing to show')).toBeInTheDocument();
  });
});
```

---

## Database Migrations

### Supabase migrations

Migrations are stored in `supabase/migrations/` and numbered sequentially:

| Migration | Description |
|-----------|-------------|
| `001_initial_schema.sql` | Core tables: portfolios, positions, settings, alerts, quotes, factors, earnings, prices |
| `002_portfolio_sharing.sql` | Portfolio sharing and collaboration features |
| `003_cvrf_tables.sql` | CVRF episode, decision, and belief state storage |
| `004_push_subscriptions.sql` | Push notification subscription storage |

### Applying migrations

```bash
# Push migrations to your Supabase project
npm run db:migrate

# Full database reset (destructive -- drops and recreates)
npm run db:reset
```

### Creating a new migration

Create a new SQL file in `supabase/migrations/` following the naming convention:

```
005_your_migration_name.sql
```

### Row Level Security

All user-scoped tables have RLS enabled. Each table has policies for:
- Users accessing their own data via `auth.uid()`.
- Service role bypass for server-side operations via `auth.jwt() ->> 'role' = 'service_role'`.

When adding new tables with user data, always enable RLS and add appropriate policies.

---

## Deployment

### Vercel (primary)

The project is configured for Vercel deployment:

- **Build command:** `cd client && npm install && npm run build`
- **Output directory:** `client/dist`
- **Framework:** Vite
- **API routes:** Serverless functions in `api/` directory
- **Rewrites:** SPA fallback for client-side routing

Deploy by pushing to the `main` branch, or manually:

```bash
npx vercel --prod
```

#### Environment variables on Vercel

Set these in the Vercel dashboard under "Settings > Environment Variables":

- `POLYGON_API_KEY`
- `ALPHA_VANTAGE_API_KEY`
- `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `OPENAI_API_KEY` (optional, for LLM explanations)
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (for push notifications)

### Docker

```bash
docker compose up --build
```

The `Dockerfile` builds the server and client, and `docker-compose.yml` orchestrates the full stack including dependencies.

### Railway

A `railway.toml` configuration is included for Railway deployment as an alternative.

---

## Architecture Decisions

### CVRF (Conceptual Verbal Reinforcement Framework)

CVRF is the core innovation of Frontier Alpha. It is a belief evolution system inspired by reinforcement learning concepts but applied to investment beliefs rather than actions.

**Design rationale:**
- Traditional optimizers are stateless -- they produce the same output given the same inputs regardless of history.
- CVRF maintains a belief state that evolves through episodes, capturing what worked and what did not.
- Each CVRF cycle compares two consecutive episodes, extracts insights from the better-performing one, and generates a meta-prompt that adjusts factor weights and risk parameters.
- This creates a "self-improving" optimization loop where past performance informs future decisions.

**Key components:**
- `CVRFManager` -- Orchestrates episodes, decisions, and belief updates.
- `PersistentCVRFManager` -- Adds database persistence via Supabase.
- `integration.ts` -- Bridges CVRF beliefs into portfolio optimization and risk assessment.

### Walk-Forward Backtesting

The backtest engine uses walk-forward methodology rather than simple historical backtesting:

- The data is divided into sequential episodes (configurable, default 21 trading days).
- Each episode runs a full optimization cycle.
- CVRF beliefs can be applied to each episode, creating a realistic simulation of the evolving system.
- This prevents look-ahead bias and produces more realistic performance estimates.

### Factor Model

The factor engine calculates 80+ factor exposures organized into six categories (style, quality, volatility, sentiment, macro, sector). This goes beyond the standard Fama-French 5-factor model to capture a richer set of return drivers.

**Data flow:**
1. Historical prices are fetched from Polygon.io (or Alpha Vantage fallback).
2. Returns are computed and regressed against factor returns from the Ken French Data Library.
3. Additional proprietary factors (sentiment, macro sensitivity) are calculated from supplementary data.
4. Exposures are cached with configurable TTL.

### Dual Deployment Model

The codebase supports two deployment modes:

1. **Fastify server** (`src/index.ts`) -- A persistent server with WebSocket support, used for local development and self-hosted deployments. Routes are registered programmatically.

2. **Vercel serverless** (`api/` directory) -- Each file in `api/v1/` is a standalone serverless function. These share business logic from `src/` but handle HTTP differently (using `VercelRequest`/`VercelResponse`).

This dual approach allows the same business logic to run on a traditional server or a serverless platform without code duplication.

### State Management (Client)

The client uses Zustand for state management:

- Lightweight and performant compared to Redux.
- Each domain has its own store (portfolio, earnings, CVRF, settings).
- React Query (`@tanstack/react-query`) handles server state, caching, and background refetching.
- Zustand stores handle client-only state (UI preferences, form state, local filters).

### Error Handling

- **Server:** All endpoints return the standard `{ success, data|error, meta }` envelope. Errors include a machine-readable `code` and human-readable `message`.
- **Client:** An `ErrorBoundary` component wraps the app and individual sections. Errors are reported to Sentry and logged to the API as backup. Network errors trigger retry-capable empty states.
- **Observability:** Sentry integration on the client captures exceptions, breadcrumbs, and performance traces.
