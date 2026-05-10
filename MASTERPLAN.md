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

## Phase E — Production-readiness gate review (executed 2026-05-10)

### E1. Gate state at end-of-Phase-D

| # | Criterion | State | Notes |
|---|---|---|---|
| 1 | Polygon Starter live | ❌ free tier | Held by user direction "near demo / second user" timing. Real blocker for optimizer accuracy + holdings sparklines + FactorDeltas under load. Code-side workarounds shipped (cache-key alignment v1.3.6/7, INSUFFICIENT_DATA error v1.3.9). |
| 2 | FactorDeltas card showing real day-1 deltas | ✅ verified | v1.3.4 server endpoint + v1.3.7 cache fix + Supabase tables restored. Live in production for the seeded test user. |
| 3 | Onboarding empty states polished | ✅ shipped | v1.3.5 (welcome modal, Risk Metrics, Options banner) + v1.3.13 (analyze_symbols → real portfolio bridge). |
| 4 | Visual regression CI green 14+ nightly runs | ⏳ awaiting clock | v1.3.14 wired walkthrough alongside visual nightly. Need to wait for 14 consecutive successes — that's calendar time, not work time. |
| 5 | At least one external user | ❌ still solo | Not in scope for technical work; user-facing readiness signal. |
| 6 | Test coverage server 800+ | ⏳ 782 / 800 | 18 tests short. Either add the missing tests in a focused session OR widen the criterion to "tests passing AND walkthrough+visual green." |
| 7 | Lighthouse / Core Web Vitals green | ⏳ unmeasured | `lighthouse-report.report.html` exists but is from 2026-03-17 (pre-v1.x). Need a fresh run. |

### E2. Decision — what's actionable now vs deferred

**Closeable in this session:**
- None. Each open item is gated by either provider spend (1), calendar time (4), human user adoption (5), focused test-writing (6), or a separate Lighthouse run (7).

**Closeable in next 1-2 sessions:**
- (6) Add 18+ server tests to cross 800. Trivial sweep — pick the most-bug-prone routes (notifications, ml, trading) and add path-coverage tests.
- (7) Run fresh Lighthouse pass against current production. 30-min task.

**Closeable on calendar time:**
- (4) 14 consecutive green nightly runs. Just need the days.

**Closeable on user direction:**
- (1) Polygon Starter $29/mo upgrade. User chose to defer.
- (5) Second user invite. User chose to defer.

### E3. Conclusion

The **technical foundation for production-readiness is laid** as of
v1.3.14. Remaining gates are spend / time / adoption decisions, not
engineering decisions. The masterplan execution closes here.

**Recommendation:** Bump to v1.4.0 to mark the semantic shift. The
"production-readiness foundation" is complete; the remaining gates are
operational, not structural. From here forward, work pulls from
`IDEAS.md` (cinema/FriendlyFace borrows + arxiv R&D directions) or
from new user feedback, not from `MASTERPLAN.md`.

After v1.4.0:
- This file (`MASTERPLAN.md`) is archived as historical record. Don't
  delete; it's the durable trail of why v1.3.4-v1.3.14 happened the
  way they did.
- `ROADMAP.md` becomes the active "what's next" doc.
- `IDEAS.md` continues as the pull queue for promoted work.

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

## Post-completion (2026-05-10)

All five phases shipped in one session:
- v1.3.10 (Phase A — centralize + defend)
- v1.3.11 (Phase B — type drift sweep)
- v1.3.12 (Phase C — page audit + fix-on-spot)
- v1.3.13 (Phase C-q — silent-failure toasts + onboarding bridge)
- v1.3.14 (Phase D — Playwright walkthrough regression net)
- v1.4.0 (Phase E — gate evaluation + semantic version bump)

**Action items remaining:**
- Add 18+ server tests to cross the 800 threshold (closeable next session)
- Run fresh Lighthouse against v1.4.0 production (30-min task)
- Wait for 14 consecutive green nightly E2E runs (calendar time)
- User decision: Polygon Starter upgrade
- User decision: invite second user

**This file is now historical.** New work pulls from `ROADMAP.md`
(active queue) or `IDEAS.md` (longer-running R&D). The 14 commits and
6 deploys this session collectively shifted Frontier Alpha from
"works for solo dev" to "structurally ready for a second user when
Polygon spend and adoption signal align."
