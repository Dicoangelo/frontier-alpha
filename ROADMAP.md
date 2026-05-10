# Frontier Alpha — Roadmap

Living document. Tracks what's been shipped, what's queued, and the explicit
upgrade triggers that should drive the next round of provider/infrastructure
spend. Updated alongside CHANGELOG.md on every release.

---

## Currently shipping toward

- **More features for the solo-user phase** — keeping costs near zero while the
  product surface stabilizes. No second-user pressure yet.
- **Onboarding polish iterations** — fresh-user audit kicked off in v1.3.5
  shipped 3 fixes; further sweeps as we observe the flow with real visitors.
- **Cinema studio integration** — separate workstream, not yet wired into
  Frontier Alpha nav (see `~/projects/frontier-alpha/CONTEXT.md` Cinema notes).

---

## Upgrade triggers (when to spend money)

These are pre-decided spend triggers. Don't pre-upgrade. Don't debate them
again when one fires — execute the upgrade, update this row, move on.

| Trigger | Cost | Status |
|---|---|---|
| **Polygon free → Polygon Starter** ($29/mo) — when a real second user joins, OR when the free-tier 5 req/min ceiling becomes binding under normal dashboard load (12+ requests on first paint), OR within 30 days of any planned demo / sales pitch. | $29/mo | **READY TO PULL** — trigger condition hit 2026-05-09. Holding for "near demo / second user" timing per user direction. See `Polygon free-tier insufficiency` below for evidence. |
| **Supabase free → Pro** ($25/mo) — when database row count exceeds free-tier limits (currently ~100K free) OR when realtime / storage features become load-bearing. | $25/mo | Not triggered — well under thresholds. |
| **Vercel Hobby → Pro** ($20/mo) — when Hobby's 100GB bandwidth ceiling becomes binding, OR when more than one human collaborator needs preview-deploy access. | $20/mo | Not triggered — solo. |
| **Upstash Redis** (deferred) — current Supabase-backed rate limiter is enough at solo-user scale. Threshold: when `rate_limit_check` RPC p99 exceeds 50ms or sustained > 100 req/s. | TBD | Not triggered. |

---

## Known issues queued behind the Polygon upgrade

These all stem from the same root cause (Polygon free-tier insufficiency) and
will resolve cleanly once Polygon Starter is live. **Do not invest engineering
time fixing them under the free tier — the fix is the upgrade.**

1. **Stale price data on Vercel egress** — Polygon returns ~200 stale rows
   ending 2025-12-12 to Vercel function instances even though the same API key
   from operator's home network returns 330 fresh rows ending 2026-05-08. IP
   throttling theory. Visible as 5-month-old prices on holdings table (NVDA
   showing $215 instead of split-adjusted current).
2. **Holdings sparkline 502s** — `/api/v1/quotes/SYMBOL/history?days=7` returns
   502 because the 5 simultaneous requests blow the 5/min ceiling on every
   dashboard load.
3. **FactorDeltas card "Return tomorrow" fallback** — Strategy 1 server endpoint
   ships and is correct (verified via direct curl). Falls through to Strategy 2
   (localStorage) only because the Polygon-backed history endpoint can't return
   270+ rows under the IP throttling. Card renders the empty-state message
   instead of real day-1 deltas.
4. **Cache thrashing burns the per-minute budget** — first dashboard load fires
   ~12 requests, hits the rate limit on calls 6-12, blocks every subsequent
   factor / quote call for ~60 seconds. Symptom: blank cards on first paint.

**Code-side fixes that DID ship and will start delivering value the moment
Polygon Starter is live:**

- `309b940` v1.3.6 — endpoint cache-key alignment (`/factors/history` now
  shares cache with `/factors/:symbols`)
- `3d1364b` v1.3.7 — CacheWarmer warms 300 days (was 252) to satisfy the
  SupabaseCache 90% coverage check
- Supabase MCP migration `restore_missing_historical_prices_and_factor_returns`
  — restored two tables that drifted out of production despite being in
  `001_initial_schema.sql`

---

## Recently shipped (last 30 days)

| Date | Version | Headline |
|---|---|---|
| 2026-05-09 | 1.3.7 | CacheWarmer 300-day alignment + Supabase table restore |
| 2026-05-09 | 1.3.6 | Factors-history endpoint cache-key alignment |
| 2026-05-09 | 1.3.5 | Onboarding polish — welcome modal, Risk Metrics empty state, Options banner copy |
| 2026-05-09 | 1.3.4 | Server-side factor history endpoint (closes "wait til tomorrow" gap) |
| 2026-05-09 | 1.3.3 | DASH3-005 (Cognitive Insight v2) + TOKEN-007 (visual regression infra) |
| 2026-05-09 | 1.3.2 | Risk Metrics empty when factor data sparse |
| 2026-05-08 | 1.3.0 | Reliability wave (9 user stories) |
| 2026-05-08 | 1.2.6 | End-user walkthrough fix wave (11 production-affecting bugs) |
| 2026-05-07 | 1.2.x | UI polish wave + family-aligned design system |

See `CHANGELOG.md` for the full per-version detail.

---

## Next session candidates

In rough priority order. Each is a self-contained scope.

1. **Cinema studio nav wiring** — Cinema Studio is built (~2.3k LOC,
   TypeScript-clean) but not yet linked from the main app nav. Per the cinema
   buildout roadmap memory, this is a one-session integration.
2. **Factors page deeper drill-down** — current page renders the 80+ exposures
   but lacks per-factor explainer and contribution waterfall. Aligns with
   DASH3-005 / Cognitive Insight v2 surface.
3. **Backtest UI polish** — page works but the empty state is rough.
4. **Tax page real data** — currently mock-only. Needs `frontier_tax_events`
   table seeded plus the realized/unrealized income split per CONTEXT.md
   feedback note.
5. **Mobile portfolio swipe actions (MOBILE-004)** — explicitly deferred to
   "second active user" trigger. Hold.
6. **Dashboard personalization (DASH3-006)** — same trigger.

---

## Cross-project memory references (for future sessions)

- `~/.local-notes/memory/project_frontier_alpha_provider_tiers.md` — when each free
  tier becomes binding (the canonical source for upgrade thresholds)
- `~/.local-notes/memory/project_frontier_alpha_v1_3_3_session.md` — DASH3-005 ship
  decisions
- `~/.local-notes/memory/feedback_polygon_key_truncation.md` — `printf` vs `echo`
  rotation discipline
- `~/.local-notes/memory/feedback_vercel_env_newline.md` — broader trailing-newline
  env corruption pattern
