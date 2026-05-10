# Frontier Alpha — Production Readiness Masterplan

**Created:** 2026-05-10 after the v1.3.4–v1.3.9 ship round (10 commits, 5
production deploys today). Status: alive, executing.

This is not the wishlist (`IDEAS.md`) and not the per-version log (`CHANGELOG.md`).
This is the bridge between "v1.3.9 just shipped" and "production-ready
enough to invite a second user." Every phase has explicit acceptance
criteria so completion is unambiguous.

The plan is informed by the v1.3.9 reflection — recurring patterns we
keep tripping over (cache-key drift, type drift, swallowed errors,
under-sized modals, screenshot-driven QA gaps).

---

## Phase A — Centralize + defend (the quick wins)

**Why now:** Every fix in v1.3.6 → v1.3.9 traced to a cluster of related
gaps. Closing them with a small refactor pass prevents the next
instance.

### A1. Centralize `BASE_HISTORY_DAYS = 300` across all price consumers

- **What:** One exported constant in `src/factors/historySlice.ts`
  (already exists). Every consumer of `dataProvider.getHistoricalPrices`
  imports it instead of hard-coding `252` / `300` / `301`.
- **Where to touch:**
  - `src/routes/portfolio.ts` — already done for `/factors`,
    `/factors/history`, `/optimize` in v1.3.9 commits
  - `src/data/CacheWarmer.ts` — already aligned to 300 in v1.3.7
  - Audit other call sites: `grep -rn "getHistoricalPrices" src/` — fix
    any that still hard-code a number
- **Acceptance:** `grep -rn "getHistoricalPrices.*[0-9]" src/` returns
  zero numeric literals — only `BASE_HISTORY_DAYS` references.
- **Risk:** Low. Pure refactor.
- **Lift:** XS

### A2. ErrorBoundary around Optimize result section

- **What:** Wrap the result-rendering portion of `Optimize.tsx` in a
  `<SectionErrorBoundary>`. The "colSpan" client-side crash was likely
  a child component (MonteCarloChart? FactorTable?) choking on a
  malformed result. Server-side INSUFFICIENT_DATA fix in v1.3.9 should
  have prevented bad responses from hitting the client, but defense in
  depth is cheap.
- **Where:** `client/src/pages/Optimize.tsx` — wrap lines 380-470
  (the `result &&` render block) with the existing
  `SectionErrorBoundary` component.
- **Acceptance:** Manually pass an obviously bad result (mock the
  query response with `{}`) and confirm the page renders the section
  error fallback instead of crashing the whole page.
- **Risk:** Low. Pure defensive add.
- **Lift:** XS

### A3. Document modal sizing rules in DESIGN-SYSTEM.md §13

- **What:** Codify the rule "modals with structured content default
  to `max-w-2xl`; compact prompts use `max-w-lg`; full-page-feeling
  workflows use `max-w-4xl`." Add to `DESIGN-SYSTEM.md` as §13 with a
  one-line rationale and a per-class examples table.
- **Acceptance:** New section exists; `WelcomeModal` (compact),
  `TradeReasoning` (structured), and any future modal author has a
  clear rule.
- **Lift:** XS

### A4. Surface real error messages on remaining "swallowed" routes

- **What:** Every Fastify route that does `catch { return generic }` is
  swallowing actionable info. v1.3.9 fixed `/optimize`. Audit the rest
  via `grep -n "INTERNAL_ERROR.*message" src/routes/*.ts` and apply
  the same pattern (real `error.message` plus generic fallback).
- **Acceptance:** Every catch block on every route surfaces the actual
  error message in dev/prod responses. No more "An unexpected error
  occurred."
- **Lift:** S

**Phase A acceptance overall:** All four items shipped as one commit;
v1.3.10 bumped; deployed; CHANGELOG entry written.

---

## Phase B — Type drift sweep

**Why:** v1.3.9 caught the Vercel build with a local
`OptimizationConfig` that diverged from the shared one. Local `tsc`
missed it. Likely several more cases.

### B1. Audit page-local interfaces that should be shared

- **What:** `grep -rn "^interface .*\(Config\|Result\|Request\|Response\)"
  client/src/pages/` then for each, check if there's a sibling in
  `client/src/types/index.ts`. If yes, replace with import. If no,
  decide — promote to shared if cross-page, keep local if truly
  page-specific.
- **Acceptance:** Every Config/Result/Request/Response interface is
  either:
  - Imported from `@/types`, OR
  - Documented with a one-line comment explaining why it's page-local
    (e.g., "internal form-state shape, not exposed to API")

### B2. Strengthen the build to catch this earlier

- **What:** `tsconfig.json::compilerOptions.noUnusedLocals = true` and
  `noUnusedParameters = true` already catch dead code. The miss was a
  duplicate-name shadowing rule. Add `eslint-plugin-import/no-cycle`
  AND a custom rule to flag local interfaces that shadow imports
  from `@/types`.
- **Acceptance:** Vercel-equivalent strict typecheck runs locally. New
  npm script `client:typecheck:strict` matches what Vercel runs.

**Phase B acceptance:** Audit complete, drift list captured, fixes
shipped or queued explicitly. v1.3.11 if substantive.

---

## Phase C — Page-by-page user audit (the big one)

**Why:** Screenshot-driven QA from the user has caught real bugs
(welcome modal, Risk Metrics, Options banner, chart text, cash
balance, optimizer crash, modal sizes, CVRF clarity). The remaining
pages are unaudited and almost certainly have similar issues.

### C1. Per-page audit protocol

For each of these pages, click every CTA, observe every state, capture
issues:

1. **Trading** — broker connect, paper trading flows, order forms
2. **Earnings** — calendar, forecasts, beat-rate UI, expected-move
   chart
3. **Tax** — tax events table, year picker, realized lots, CSV export
4. **Backtest** — strategy form, run button, results panel, equity
   curve
5. **ML** — predictions, model picker, confidence bands
6. **Alerts** — rule creation, severity filters, mute/dismiss
7. **Social** — feed, follow buttons, profile pages
8. **Optimize** — result-state rendering (defensive, post-A2)
9. **CVRF** — episode lifecycle (start, decision, close, view)
10. **Settings** — profile edit, theme, notifications
11. **API Keys** — generate, copy, revoke
12. **Help** — search, sections, video links if any
13. **Pricing** — plan selection, billing redirect
14. **Onboarding flow** (signup → first dashboard) — repeat in
    incognito with a fresh email

### C2. Per-page output

Each page audit produces:
- A note in `IDEAS.md` if non-trivial (queue for a focused session)
- An on-the-spot fix if trivial (commit alongside the audit)
- A Playwright test stub for Phase D coverage

### C3. Acceptance

Every page above has been clicked through. Every audit observation is
either fixed or has a queued note. Audit log committed as
`tasks/audit-2026-05-10-pages.md`.

**Lift:** L (this is where most of the time goes — could span 1-2
focused sessions)

---

## Phase D — Regression net (Playwright "click everything")

**Why:** Today's bugs were caught only because the user happened to
click them. Coverage gap = anything they didn't touch.

### D1. Smoke walkthrough per page

- One Playwright test per page in `tests/visual/walkthrough.spec.ts`
- Test goes: navigate, wait for ready anchor, click every interactive
  CTA, assert no console errors + no network 5xx
- NOT visual regression — this is "did anything throw"

### D2. CI integration

- Runs nightly alongside the existing visual regression suite
- Failure = open PR with reproduction steps

### D3. Acceptance

- 14 walkthrough tests (one per page in C1)
- Nightly CI green
- Test takes < 10 min total

**Lift:** M

---

## Phase E — Production-readiness gate review

**Why:** `IDEAS.md` already has a 7-criteria gate before promoting any
research-grade idea to ROADMAP. This is the moment to verify each.

### E1. Re-evaluate each gate

- [ ] Polygon Starter live → if not, the optimizer / sparklines /
      factor-deltas remain data-starved
- [x] FactorDeltas card showing real day-1 deltas → ✅ verified live
- [x] Onboarding empty states polished across all primary pages →
      partially done; Phase C completes this
- [ ] Visual regression CI green for 14+ consecutive nightly runs →
      need to run the suite for 2 weeks first
- [ ] At least one external user → still solo
- [ ] Test coverage server 800+ → at 782 today
- [ ] Lighthouse / Core Web Vitals green → never measured

### E2. After Phase D

Decide which deferred items need execution before the "second user"
moment, vs which can wait. This is the gate decision.

---

## Execution order

The plan goes A → B → C → D → E. Phases are sequential because each
later phase benefits from the earlier work (e.g., the audit in C is
much faster after Phase A's centralizations).

**Single-session plan (this session):** Ship Phase A end-to-end as
v1.3.10. Start Phase B if time. Phase C is the next session.

**Stop conditions:**
- Hit any user-blocking bug during execution → drop everything, fix it,
  resume the masterplan
- Production deploy breaks → rollback, debug, ship a fix-forward
  before resuming
- Run-time genuinely exceeds value of further work → stop, document
  state in this file, resume next session

---

## Post-completion

When all phases are green:
- Bump to v1.4.0 (semantic shift — "production-readiness foundation
  laid")
- Update `ROADMAP.md` to point at the next promote-from-IDEAS work
- Re-evaluate the Polygon upgrade trigger
- Start the second-user invite path
