# FrontierAlpha — Long-Running PRD Roadmap

Source: `CLAUDE-DESIGN-BRIEF.md` (Apr 19). Four long-running PRDs that ralph-tui / an operator can chew through in order. Each story has explicit acceptance criteria and a dependsOn graph so work parallelizes cleanly.

## Completed upstream

- Landing hero v2 (Apr 22) — animated 84-bar factor backdrop, typing ticker demo cycling NVDA→AAPL→TSLA→GOOGL, rotating "because…" caption, preserved ticker input + quick-portfolio chips. Components: `client/src/components/landing/FactorBackdrop.tsx`, `TypingTickerDemo.tsx`. CSS primitives: `fade-in-up`, `factor-grow`, `factor-breathe`, `typing-cursor`, `holo-pulse`, `caption-cycle`.

## Active PRDs

| Priority | PRD | Stories | Est. days | File |
|----------|-----|--------:|----------:|------|
| P1 | Dashboard v3 — hierarchical read + operator chrome | 8 | 5 | `prd-dashboard-v3.json` |
| P2 | Mobile Portfolio — card/list hybrid | 7 | 3 | `prd-mobile-portfolio.json` |
| P2 | Token Migration — eliminate raw hex + enforce | 7 | 3 | `prd-token-migration.json` |
| P3 | Motion System — unified grammar | 7 | 2 | `prd-motion-system.json` |

Total: **29 stories, ~13 working days** of scoped work.

## Parallelization

PRDs are intentionally independent — Dashboard v3 and Token Migration can run in parallel streams. Mobile Portfolio depends on neither but should land before Motion System so motion choreography covers mobile patterns too.

```
[ P1 Dashboard v3 ]   [ P2 Mobile Portfolio ]   [ P2 Token Migration ]
        ↓                       ↓                        ↓
        └───────────────┬───────┴────────────────────────┘
                        ↓
              [ P3 Motion System ]
```

## Execution pattern

Each PRD is ralph-tui / beads compatible:

```bash
# Ralph-tui
ralph-tui --prd tasks/prd-dashboard-v3.json

# Or Claude Code agent loop
for prd in tasks/prd-*.json; do
  claude-code --task "Execute next pending story in $prd, run verification, mark done"
done
```

Stories mark status: `pending` → `in_progress` → `done` with `completionNotes`.

## Quality gates (all PRDs)

- `cd client && npm run build` — typecheck + vite production build
- `cd client && npm test` — vitest
- `cd client && npm run lint` — ESLint (strict after TOKEN-006 lands)
- Manual visual QA at 320 / 390 / 768 / 1440 / 1920 viewports
- Theme toggle flips every page with zero hardcoded hex

## What's NOT in these PRDs (out of scope)

- Backend changes — all four PRDs are client-only
- New product surfaces (no new pages) — this is a hardening/polish push
- Breaking API contract changes — existing endpoints stay stable
- Authentication rework — existing Supabase auth unchanged

## Success signal

At end of the 13-day arc:
- Every page renders identically in light/dark, no stuck colors
- Dashboard feels like a trader cockpit (status strip, shortcuts, command palette)
- Mobile is first-class — a user can manage a real portfolio at 375px
- One motion language across the product — no jarring transitions
- Automated gates prevent regression (no-raw-hex lint, visual snapshots)
