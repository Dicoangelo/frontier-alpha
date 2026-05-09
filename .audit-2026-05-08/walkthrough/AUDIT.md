# Frontier Alpha — End-User Walkthrough Audit
**Date:** 2026-05-08
**Account:** `dicoangelo+dev@metaventionsai.com` (enterprise comp, $100K cash, fresh)
**Viewport:** 1440x900 desktop
**Build:** v1.2.5 → 1.2.6 (post-walkthrough fixes)

## Method

Sign in as fresh enterprise dev account → walk every nav entry → fill at least one form per page → screenshot every state → record everything broken, janky, or empty. Numbered screenshots in `walkthrough/`.

---

## Fixed during the walkthrough

### ✅ FIXED — Portfolio API always 404'd
**File:** `03-portfolio.png` (before), `05-portfolio-loaded.png` (after)
**Root cause:** `routes/portfolio.ts` gated DB lookup on `server.useDatabase`, but the field was never declared on `AppServer` or set in `buildApp()`. Always read undefined → fell through to in-memory branch → 404.
**Fix:** commit `5277a74` — wired `useDatabase: Boolean(SUPABASE_SERVICE_KEY)` and `currentPortfolio: null` in AppServer.
**Bonus:** unblocks `routes/ml.ts` and `routes/tax.ts` which read the same flag.

### ✅ FIXED — Portfolio page React error #310
**File:** `04-portfolio-fixed.png` (still error at first), `05-portfolio-loaded.png` (clean)
**Root cause:** `useMemo` and `useCountUp` calls lived BELOW an early `if (isLoading) return ...`. When the loading state changed, hook count differed → React aborted render.
**Fix:** commit `70e67c7` — moved all hook calls above the conditional returns.

---

## 🔴 Still broken — needs a fix round

### 1. Factors page — `/api/v1/portfolio/factors/:symbols` returns 500
**File:** `11-factors.png` — full page shows the `DataLoadError` with "Failed to load factor data".
**Console:** `Failed to load resource: the server responded with a status of 500 () @ /api/v1/portfolio/factors/AAPL,AMZN,GOOGL,MSFT,NVDA`
**Cause:** the route loops `getHistoricalPrices()` for each symbol + SPY. If any single fetch throws (rate limit, malformed cache, etc.), the whole batch 500s with `'Factor calculation failed'`.
**Fix:** wrap per-symbol fetch in try/catch, skip failures, log; only 500 if zero symbols resolved.

### 2. CVRF page — full ErrorBoundary crash
**File:** `12-cvrf.png` — "Something went wrong" with `Error ID: ui_1778296609139_3y0874`
**Cause:** Likely the same hook-order class of bug, or unhandled API error. Needs investigation.
**Fix:** load CVRF page, capture stack trace, fix.

### 3. Sidebar nav — "Backtest" missing entirely
**File:** see any sidebar in `02–18`. The sidebar groups are Overview / Execution / Intelligence / Account. **Backtest is not a sidebar entry**, but `/backtest` is a real working page (`20-backtest.png` looks great).
**Fix:** add Backtest link to the Intelligence group (next to ML).

### 4. Connection banner — "Reconnecting · 1 · 1s" stuck on every page
**File:** `02-dashboard.png`, `03-portfolio.png`, every page
**Cause:** WebSocket fails to reach Railway `wss://frontier-alpha-api-production.up.railway.app/ws/quotes` from this client. Already attempted v1.2.4 fix to `getWebSocketUrl()`, but the production WS endpoint either 502s or returns text/html.
**Fix:** verify Railway `frontier-alpha-api` is actually serving the `/ws/quotes` route; test the WS handshake directly with `wscat`.

### 5. Greeting shows "Dicoangelo+dev"
**File:** `02-dashboard.png` — header reads `Good evening, Dicoangelo+dev`
**Cause:** `getDisplayName(email)` strips the `@domain.com` and capitalizes, but doesn't strip `+suffix` aliases.
**Fix:** trim `+...` before capitalization.

### 6. Welcome modal (onboarding) interrupts dashboard
**File:** `01-dashboard-fresh-login.png`
**Cause:** First-time login modal appears centered with "Try Demo Portfolio / Take a Quick Tour / Skip for now". Modal fully obstructs dashboard hero. Fine UX-wise, but the gradient banner at top is extreme — feels like an ad.
**Suggested:** soften the gradient banner; offer dismiss-with-X without forcing a CTA pick.

### 7. Mock data on dashboard when API fails
**File:** `02-dashboard.png` shows $125,000 portfolio with 5 positions and live equity curve, but the user has $100K cash and 0 positions. The dashboard renders mock data when the API errors.
**Fix:** when portfolio API fails, show the EmptyPortfolio state OR show an explicit `MockDataBanner` so the user knows the numbers aren't theirs.

---

## 🟡 Polish / minor

| File | Issue |
|---|---|
| `02-dashboard.png` | "Risk Metrics" card uses fake numbers (Drawdown -27%, Sharpe 1.00) — not computed from any real portfolio. Same mock-data-leak as #7. |
| `02-dashboard.png` | "AI-Powered Insights" cards are 4 hardcoded mocks, no LLM call. Should call `/api/v1/explain/portfolio` or label as "Demo insight". |
| `02-dashboard.png` | "Holdings" table sparkline column shows blank img placeholders, "Change" column reads "↑ 0.00%" — broken sparkline + no real diff. |
| `08-trade.png` | "No Broker Connected" banner offers Connect Broker / Use Demo Mode. Demo mode CTA is fine, but Connect Broker dropdown disabled because user is enterprise-comp (no real Alpaca). Suggest: hide the empty-state if Demo mode is the actual session. |
| `09-optimize.png` | Optimize page renders cleanly but Run Optimization button without portfolio loaded would 400. Should disable until ≥2 positions exist OR auto-load demo. |
| `10-options.png` | Options chain populates with AAPL strikes, all bid/ask = 1.00 / 1.00 / 12,500 vol. Mock data clearly visible. Replace with cached Polygon options-chain or label "demo data". |
| `11-factors.png` | Factor cards (Style/Macro/Sector/Volatility/Sentiment) render before the load error — but clicking any of the tabs likely also 500s. |
| `13-ml.png` | Beautiful page but every metric is hardcoded (Bull regime 64.7%, +27% lift, Feb 12 retrain). Should pull from training pipeline state OR label demo. |
| `14-earnings.png` | Empty states are good — calendar shows "0 / 0 / 1" stats, "Add positions to track their earnings". One real position (NVDA) but doesn't surface its earnings date. |
| `15-social.png` | Social leaderboard with "AlphaSeeker / QuantMaster" — mock community. Should either ship with real social system or hide entirely until launch. |
| `16-alerts.png` | Alerts page shows real-looking factor drift alerts (Critical badge), but for a brand new account with one position they're synthetic. Same mock-data-leak. |
| `17-tax.png` | Tax page shows $9,189.48 YTD harvest, $2,148.72 estimated savings — fake. Brand new account has no realized gains. |
| `18-settings.png` | All sections render. Profile email shows correctly. Broker section accepts API key/secret but no validation feedback. |
| `19-help.png` | Renders cleanly. Search bar present. |
| `20-backtest.png` | Backtest configuration panel renders — no /backtest sidebar link though (#3). |

---

## ⚠️ Cross-cutting concerns

1. **Mock-data-leak** is the single biggest UX problem. Every authenticated page renders convincing-looking demo numbers (Risk Metrics, AI Insights, Tax savings, Social leaderboard, ML metrics). For a new user, this is misleading at best, fraudulent-looking at worst.
   - **Fix pattern:** every component should distinguish "have data" / "loading" / "error / fallback to demo with banner". The `MockDataBanner` component exists; route every demo-data path through it.

2. **WS connection never connects** even with the v1.2.4 envelope fix. Banner persists on every page. Either the Railway WS endpoint is dead OR the auth handshake fails. Worth checking Railway logs.

3. **Loading skeletons → content pop** happens on every page. Skeletons aren't matching final shape. Most noticeable on Dashboard and Portfolio.

---

## Suggested next compilation

In priority order (smallest blast radius first):

1. **Fix `/api/v1/portfolio/factors/:symbols` 500** — per-symbol catch + log. ~10 min.
2. **Fix CVRF crash** — load page, find stack, fix. ~15 min.
3. **Strip `+suffix` from greeting** — one-line fix in `getDisplayName`. ~3 min.
4. **Add Backtest to sidebar Intelligence group** — one entry. ~5 min.
5. **Replace dashboard mock data with empty-state** — render `EmptyPortfolio` on dashboard when portfolio is empty (not just when API errors). ~30 min.
6. **WS reconnect investigation** — trace the actual Railway response. ~30 min.
7. **MockDataBanner across every fake-data surface** (Tax, ML, Alerts, Social) — ~1 hour.
