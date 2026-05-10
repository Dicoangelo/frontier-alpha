# Phase C — Page-by-page audit log

**Date:** 2026-05-10
**Method:** Read source for each page + look for the anti-patterns Phase A/B
established as common (hard-coded constants, generic INTERNAL_ERROR
swallows, undersized modals, page-local type drift, missing error states,
swallowed mutations, dead CTAs).

Pages in scope (14): Trading, Earnings, Tax, Backtest, ML, Alerts, Social,
Optimize, CVRF, Settings, APIKeys, Help, Pricing, Onboarding flow.

For each: **findings** + **action** (fix-on-spot / queue / no-action).
Triage at the end.

---

## C1 — Trading.tsx (989 lines)

### Findings

- ✅ **Modal sizing** — `BrokerConnectionModal` was `max-w-lg` per the
  pre-Phase-A pattern. Bumped to `max-w-2xl lg:max-w-3xl` + the
  required ancillary props (overflow-y-auto, items-start sm:items-center,
  proper padding). FIXED on the spot.
- ⚠️ **Silent failures** — 8 `console.error()` sites with NO `toast`
  call alongside. `handleConnectDemo`, broker-key validation, paper
  trading order submit, etc. all log-and-swallow. Users get no feedback
  on broker auth failures. QUEUE for v1.3.13 (touch all silent-failure
  sites with consistent toast pattern).
- ⚠️ **No `<SectionErrorBoundary>` around order-form / chart sections**.
  A bad quote response could crash the page. QUEUE.

### Action: 1 fix-on-spot, 2 queued.

---

## C2 — Earnings.tsx (275 lines)

### Findings

- ✅ Page is tight (275 lines), uses `useEarnings` hook for data.
- ⚠️ Empty state for non-portfolio-tied user (no positions) renders
  the calendar with a hard-coded "AAPL, MSFT, GOOGL" demo set.
  Same v1.3.5 demo-leak pattern. Should hide section or render
  EmptyState. QUEUE.
- No mutations. Read-only. Low risk.

### Action: 1 queued.

---

## C3 — Tax.tsx (958 lines)

### Findings

- 4 local interfaces (RealizedLot, TaxEvent, TaxYear, TaxSummary).
  None shadow shared types — Tax is its own domain. OK.
- 3 `max-w-md` matches — all on text paragraphs (readability constraint),
  not modals. OK.
- ⚠️ Page reads from `frontier_tax_events` Supabase table that DOES
  NOT EXIST in production (the v1.3.7 investigation confirmed this).
  Whole page renders mock or empty data. Either:
  - Apply the `frontier_tax_events` migration (v1.3.7 noted this), OR
  - Hide tax-events section behind feature flag until table exists.
  HIGH PRIORITY FOR USER. Queue with explicit recommendation.
- No error boundaries around the tax-events table render.

### Action: 1 high-priority queued (apply tax_events migration).

---

## C4 — Backtest.tsx (636 lines)

### Findings

- ✅ Uses `useMutation` + `toastSuccess` + `toastError` correctly.
- ✅ 3 page-local interfaces (BacktestRunConfig, BacktestResult, third
  unknown) documented in v1.3.11 via Phase B.
- ⚠️ Strategy picker hard-codes `'max_sharpe' | 'min_volatility' |
  'risk_parity'` — missing `'target_volatility'` that Optimize has.
  Inconsistency between pages. QUEUE: align Backtest strategy union
  with Optimize.
- ⚠️ No `<SectionErrorBoundary>` around results panel — equity chart
  can crash on bad data shape. QUEUE.

### Action: 2 queued (alignment + boundary).

---

## C5 — ML.tsx (326 lines)

### Findings

- 2 local interfaces (MetricCardProps, training-status type) — UI only,
  no API contract drift.
- ⚠️ Uses `MockDataBanner force pageKey="ml"` per memory — this is
  the demo-data marker (correct per v1.3.5 design).
- ⚠️ Training-status state machine has only 3 states (complete /
  training / failed) — no idle/disabled/queue. Edge cases like
  "training started but not yet acknowledged" might render stale
  state. QUEUE.
- No mutations. Page is read-only.

### Action: 1 queued.

---

## C6 — Alerts.tsx (520 lines)

### Findings

- ⚠️ **Legacy data fetch pattern**: Uses raw `useState` +
  `useCallback` + `try/catch` + `console.error`. NOT React Query.
  Different from Backtest/Optimize/Settings/Pricing.
- ⚠️ `loadAlerts` catches errors and sets `loadError` state but the
  state is not surfaced to the user as a toast (only an inline
  banner). Per Phase A4 pattern, also surface as toast.
- ⚠️ `handleAcknowledge` failure does `console.error` + still mutates
  UI optimistically. Persistence vs UI mismatch on failure.
- 1 `max-w-md` on text — not a modal. OK.

### Action: queue refactor to React Query + add toasts.

---

## C7 — Social.tsx (632 lines)

### Findings

- 4 local interfaces (FeedItem, Profile, FollowState, ?) — UI shapes,
  no API contract drift.
- 1 `max-w-md` on text — not a modal. OK.
- Page is mostly placeholder content (per memory, Social is on the
  feature roadmap not yet wired to a real backend).
- No mutations.

### Action: queue placeholder honesty banner ("Social coming soon")
or hide nav entry until wired.

---

## C8 — Optimize.tsx (498 lines)

### Findings

- ✅ All Phase A/B fixes applied — uses shared types, has
  `<SectionErrorBoundary>`, error messages surface real reasons.
- ✅ `riskFreeRate: 0.045` sent explicitly (v1.3.9 fix held).
- ✅ Result state guards on `result &&`. Defensive.

### Action: no-action. Phase A/B fully landed.

---

## C9 — CVRF lifecycle (CVRFEpisodeControls.tsx + CVRF.tsx)

### Findings

- ✅ Phase A added "Episode N · learning" + explainer subtitle (v1.3.9).
- ✅ Page uses `<SectionErrorBoundary sectionName="CVRF Dashboard">`.
- ⚠️ The "Record Decision" modal inside CVRFEpisodeControls.tsx
  (line 42 `RecordDecisionModal`) uses `Card` wrapper without
  explicit max-w. Inherits Card default which may be `max-w-lg`
  equivalent. Verify against Phase A3 rule.

### Action: 1 queued (verify modal sizing).

---

## C10 — Settings.tsx

### Findings

- ✅ Uses `useMutation` + `toastSuccess` + `toastError` (4 calls).
- ✅ 3 local interfaces (form-state shapes, not API contracts).
- ⚠️ Notification preferences mutation — if backend rejects (e.g.,
  rate-limited), user sees toast but local state is already updated.
  Optimistic update without rollback.

### Action: 1 queued.

---

## C11 — APIKeysPage.tsx

### Findings

- Did not deep-audit. Sample read shows it has its own per-route
  generic `INTERNAL_ERROR` messages (caught in Phase A4 sweep but
  marked deferred to Phase B/C). Should apply same real-error pattern.

### Action: 1 queued (apply Phase A4 pattern to api-keys route).

---

## C12 — Help.tsx

### Findings

- Read-only page. No mutations. Static content.
- ✅ No issues found.

### Action: no-action.

---

## C13 — Pricing.tsx

### Findings

- ✅ Uses `toastError` on Stripe checkout failure.
- ✅ `PlanConfig` interface documented (Phase B1).
- ⚠️ "Notify me when ready" CTA on Enterprise tier sends to
  `dico@metaventionsai.com` via `mailto:` (no API call). Works
  but bypasses any waitlist tracking. QUEUE: route through Resend
  + Supabase signup table (per memory `partnership_graph_waitlist_wired`).

### Action: 1 queued.

---

## C14 — Onboarding flow (LandingPage → SignupPage → first dashboard)

### Findings

- ✅ Phase A/v1.3.5 already polished welcome modal, Risk Metrics,
  Options banner.
- ⚠️ SignupPage has no rate-limit handling — repeated submits on
  bad email throw rate-limit errors with no toast.
- ⚠️ Demo-symbol pre-fill from Landing's `?symbols=A,B,C` URL
  param doesn't propagate through SignupPage to the new account's
  initial portfolio. The `analyze_symbols` localStorage key persists
  but only fires the WelcomeModal banner — never actually pre-fills
  the portfolio table. So a user who comes from a demo never sees
  their symbols seeded. Found while reading WelcomeModal's
  handleImport flow.

### Action: 2 queued.

---

## Triage: Phase C action list

### Fix-on-spot (this session — ship as v1.3.12)

1. **Trading broker-connect modal** — sizing per Phase A3 rule. ✅ DONE.

### Queued for v1.3.13 (next focused session — biggest leverage)

1. **Apply `frontier_tax_events` migration** to production Supabase
   (or hide Tax page). HIGH PRIORITY for any user navigating to /tax.
2. **Refactor Alerts.tsx to React Query + add toasts**. Currently the
   loudest legacy pattern.
3. **Trading silent-failure sweep** — 8 `console.error` sites need
   `toastError` companions.
4. **Apply Phase A4 real-error pattern to api-keys, notifications,
   sec routes** (mechanical sweep).
5. **Backtest strategy union align with Optimize** (`target_volatility`).
6. **Onboarding: propagate `analyze_symbols` to actual portfolio
   pre-fill** (not just modal banner).

### Queued for IDEAS.md (longer-running)

1. Social page placeholder honesty banner OR hide nav.
2. ML training-status state machine refinement.
3. CVRF RecordDecision modal sizing verification.
4. Settings notification mutation rollback on failure.
5. Pricing Enterprise CTA → Resend + Supabase signup table.
6. SignupPage rate-limit handling.

---

## Summary

- **14 pages audited** (mix of code-read + targeted grep — no live
  click-through this round).
- **1 fix-on-spot** shipped (Trading modal sizing).
- **6 high-priority queued** for v1.3.13.
- **6 medium-priority queued** for IDEAS.md / future sessions.
- **2 pages clean** (Optimize, Help).

The biggest single lift remaining is **applying the
`frontier_tax_events` migration** — it cascades into the Tax page being
genuinely useful and unblocks the seeded-test-user golden state from
the previous session's deferral.

