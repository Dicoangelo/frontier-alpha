# Frontier Alpha — End-User Walkthrough Audit

Date: 2026-05-08
Account: `dicoangelo+dev@metaventionsai.com` (enterprise comp)
Viewport: 1440x900 desktop
Build: v1.2.5 (post-DemoPreview fix, post-spacing trim)

## Method

Sign in → navigate every page in nav order → fill every form field that is fillable → trigger every button → screenshot before + after → record everything that looks broken, janky, or empty.

## Findings (running)

### 🔴 P0 — Dashboard breaks at first paint

**File:** `01-dashboard-fresh-login.png`

1. **`GET /api/v1/portfolio` returns 401 right after sign-in.** Auth token isn't being attached on the first call. Page still renders because `EmptyPortfolio` fallback fires, but the comp Enterprise account *should* have a portfolio (auto-trigger created one with $100K). Fixing the 401 is the priority.
2. **`GET /api/v1/portfolio/factors/NVDA,MSFT,AAPL,GOOGL,AMZN` returns 500.** Factor lookup is broken even when called from a paid surface. Server-side blow-up — needs server log inspection.
3. **Welcome modal centered but cut off** — the "Try Demo Portfolio" gradient CTA modal has no close affordance visible above the fold. Modal also covers the dashboard greeting line.
4. **Risk Metrics card** shows hardcoded fake numbers (Drawdown -27.0%, Sharpe 1.00, Beta 0.28) — these aren't computed from any real portfolio data because the portfolio fetch failed.
5. **AI-Powered Insights panel** shows three card-shaped insights with sample copy — all hardcoded mocks, no real LLM call.
6. **Mock Data Banner** — there should be a banner indicating this is mock data while the API failed; not visible.

