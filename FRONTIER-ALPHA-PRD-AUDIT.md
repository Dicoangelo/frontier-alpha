# Frontier Alpha PRD Audit — Session Context

## Mission

Audit 4 active PRDs (31 total stories) against the actual codebase. All show 0% done but shared components (Toast, MockDataBanner, LoadingSkeleton, EmptyState, PriceChart, WeightAllocation) already exist — PRDs were likely never updated after execution. Verify, update, and identify true remaining work.

## PRD Files (4 active, 2 completed)

### Completed (no action needed)
- `tasks/prd.json` — Phase 2 Perfect & Expand (30/30 done)
- `tasks/prd-v2-world-class.json` — v2 World Class (30/30 done)

### Active — Needs Audit

#### 1. v2 Completion (`tasks/prd-v2-completion.json`) — 0/16 done
16 stories: portfolio encryption, WebSocket hardening, toast system, mock data banner, accessibility, landing polish, mobile responsive, loading/error/empty states, risk metrics, CVRF features, earnings features

#### 2. Dashboard Upgrade (`tasks/prd-dashboard-upgrade.json`) — 0/6 done
6 stories: status bar, portfolio overview deltas, equity curve touch, position sparklines, weight donut, micro-interactions

#### 3. Trading Tab Upgrade (`tasks/prd-trading-upgrade.json`) — 0/6 done
6 stories: CSS variables, animations, mini price chart, market status, sparklines, order history

#### 4. Options Tab Upgrade (`tasks/prd-options-upgrade.json`) — 0/3 done
3 stories: CSS variables, animations, hover polish

## Pre-Audit Evidence (components that already exist)

| Component | File | Lines | Relevant Stories |
|-----------|------|-------|------------------|
| `useToast` hook | `client/src/hooks/useToast.ts` | 53 | US-007, US-021 |
| `Toast` component | `client/src/components/shared/Toast.tsx` | ? | US-007 |
| `MockDataBanner` | `client/src/components/shared/MockDataBanner.tsx` | ? | US-009 |
| `LoadingSkeleton` | `client/src/components/shared/LoadingSkeleton.tsx` | ? | US-017, US-018, TRADE-002 |
| `Skeleton` | `client/src/components/shared/Skeleton.tsx` | ? | US-017, US-018 |
| `EmptyState` | `client/src/components/shared/EmptyState.tsx` | ? | US-017, US-018 |
| `ErrorBoundary` | `client/src/components/shared/ErrorBoundary.tsx` | ? | US-017, US-018 |
| `VisuallyHidden` | `client/src/components/shared/VisuallyHidden.tsx` | ? | US-020 |
| `PriceChart` | `client/src/components/trading/PriceChart.tsx` | 263 | TRADE-003 |
| `WeightAllocation` | `client/src/components/portfolio/WeightAllocation.tsx` | 253 | DASH-005 |
| `EquityCurve` | `client/src/components/charts/EquityCurve.tsx` | 508 | DASH-003 |
| `PortfolioOverview` | `client/src/components/portfolio/PortfolioOverview.tsx` | 166 | DASH-002 |
| `PositionList` | `client/src/components/portfolio/PositionList.tsx` | 408 | DASH-004 |
| `ConnectionStatus` | `client/src/components/shared/ConnectionStatus.tsx` | ? | US-028 |
| `BottomSheet` | `client/src/components/shared/BottomSheet.tsx` | ? | US-016 |
| `PullToRefresh` | `client/src/components/shared/PullToRefresh.tsx` | ? | US-016 |

## Stories to Verify — v2 Completion (16 stories)

| ID | Title | Priority | AC | Depends | Key Check |
|----|-------|----------|-----|---------|-----------|
| US-007 | Toast notification system | P1 | 10 | — | useToast hook + Toast component exist |
| US-009 | Mock data banner wiring | P2 | 10 | US-007 | MockDataBanner exists |
| US-010 | Encrypt portfolio sharing | P1 | 12 | — | ShareModal.tsx exists, check encryption |
| US-015 | Landing page polish | P2 | 11 | — | Landing.tsx (274 lines) |
| US-016 | Portfolio table mobile | P2 | 10 | — | BottomSheet + PullToRefresh exist |
| US-017 | Loading/error/empty — main pages | P2 | 12 | — | Skeleton + EmptyState + ErrorBoundary exist |
| US-018 | Loading/error/empty — secondary pages | P3 | 11 | US-017 | Same components |
| US-019 | Risk metrics thresholds | P2 | 12 | — | Check risk/ components |
| US-020 | Accessibility audit | P3 | 12 | — | VisuallyHidden exists |
| US-021 | Wire toasts to mutations | P3 | 12 | US-007 | Check if useToast used in mutations |
| US-023 | CVRF constellation interactive | P3 | 12 | — | CVRF.tsx is 13 lines (stub?) |
| US-024 | Conviction timeline | P3 | 11 | — | Check cvrf/ components |
| US-025 | 'Why This Trade' traces | P4 | 12 | US-023 | Check trading explainer |
| US-026 | CVRF belief panel on earnings | P4 | 10 | — | Earnings.tsx (247 lines) |
| US-027 | Earnings calendar heatmap | P4 | 12 | — | Check earnings/ components |
| US-028 | WebSocket reconnection | P1 | 10 | — | ConnectionStatus exists |

## Stories to Verify — Dashboard Upgrade (6 stories, 0 AC in PRD)

| ID | Title | Key File | Key Check |
|----|-------|----------|-----------|
| DASH-001 | Status bar pulse + router fix | Dashboard.tsx (489L) | Check for status bar, animations |
| DASH-002 | Portfolio deltas + responsive | PortfolioOverview.tsx (166L) | Check for delta indicators |
| DASH-003 | Equity curve touch + crosshair | EquityCurve.tsx (508L) | Check for touch handlers |
| DASH-004 | Position sparklines | PositionList.tsx (408L) | Check for inline charts |
| DASH-005 | Weight donut chart | WeightAllocation.tsx (253L) | Check for chart implementation |
| DASH-006 | Micro-interaction polish | Multiple files | Check for framer-motion/transitions |

## Stories to Verify — Trading Upgrade (6 stories)

| ID | Title | AC | Key Check |
|----|-------|----|-----------|
| TRADE-001 | CSS variable compliance | 5 | Grep for hardcoded hex colors in Trading.tsx |
| TRADE-002 | Staggered animations + skeleton | 4 | Check for LoadingSkeleton usage |
| TRADE-003 | Mini price chart widget | 7 | PriceChart.tsx (263L) exists |
| TRADE-004 | Market status progress bar | 5 | Check Trading.tsx for market hours UI |
| TRADE-005 | Position sparklines + hover | 5 | Check for sparkline in trading components |
| TRADE-006 | Order history timeline | 6 | Check for order history component |

## Stories to Verify — Options Upgrade (3 stories, 0 AC in PRD)

| ID | Title | Key Check |
|----|-------|-----------|
| OPT-001 | CSS variable compliance (37 colors) | Grep hardcoded colors in Options.tsx (1,443L) |
| OPT-002 | Staggered animations + skeleton | Check for animation/skeleton patterns |
| OPT-003 | Hover polish + micro-interactions | Check for hover states |

## Tech Stack

- **Frontend:** React 18 + Vite + TypeScript + Zustand + React Router + Recharts + D3
- **Backend:** Fastify + PostgreSQL (Supabase) + Redis + WebSocket
- **Deps:** @tanstack/react-query, lucide-react, decimal.js, dompurify, @sentry/react
- **Pages:** 20 (Dashboard, Portfolio, Trading, Options, CVRF, Earnings, Factors, Alerts, Backtest, ML, Social, Tax, Settings, Help, Landing, Login, Pricing, Optimize, SharedPortfolio)

## Quality Gates

```bash
cd client && npm run build    # Vite build
cd client && npm test         # Vitest
cd client && npm run lint     # ESLint
```

## Expected Outcome

With Toast, MockDataBanner, LoadingSkeleton, EmptyState, PriceChart, WeightAllocation, EquityCurve, ConnectionStatus all already existing, many stories are likely done or partially done. The audit should reveal the true remaining backlog is much smaller than 31 stories.
