# Running Frontier Alpha as a Claude Project

How to set up a [Claude Code Project](https://code.claude.com/docs/en/projects)
(claude.ai/code → **Projects**) so its parallel cloud threads work on this repo
the way we want. The Project-side settings below live in claude.ai, not in git.

**Why the instructions are long:** `.gitignore` keeps `CLAUDE.md` and `.claude/`
local-only, and cloud threads only see what's committed. So the repo rules a
`CLAUDE.md` would normally carry go in the Project instructions instead. If you
later decide to commit a `CLAUDE.md` (or skills under `.claude/skills/`), move
the repo-specific bullets there and trim section 3.

## 1. Prerequisites

- Pro or Max plan with **Projects** in the claude.ai/code sidebar.
- Claude GitHub App installed on `Dicoangelo/frontier-alpha` with push access
  (a `/web-setup` token alone is not enough for Project threads).

## 2. New project dialog

- **Name:** Frontier Alpha
- **Goal:** e.g. "Keep frontier-alpha green and shipping: fixes, data-provider
  hardening, and the roadmap in ROADMAP.md."
- **Context:** add `Dicoangelo/frontier-alpha` only. With a single repository,
  threads also apply this repo's `.claude/settings.json` permission rules and
  hooks (none today, since `.claude/` is gitignored); with several repos, they don't.

## 3. Project instructions (paste into Project settings > Memory)

```text
This project maintains Frontier Alpha, a portfolio-intelligence app (Fastify API in src/, React client in client/, Supabase migrations in supabase/), in the Dicoangelo/frontier-alpha repository.

- Branch from main. One branch and one pull request per thread; fill in .github/pull_request_template.md.
- Layout: src/ is the API (entry src/index.ts), client/ has its own package.json and lockfile, api/ is Vercel functions, ml/ is an optional Python service, tests/ holds server tests. Root *_KICKOFF.md, PHASE_* and audit files are historical notes; current state is in CHANGELOG.md, ARCHITECTURE.md and docs/DEVELOPER.md.
- Before calling work done, run and paste the summary lines of: npm run lint; npx tsc --noEmit; (cd client && npx tsc --noEmit); npx vitest run; (cd client && npm run test:run); npm run arch:check.
- If you add or remove routes, pages, integrations, stores, hooks, API modules or migrations, run npm run arch:scan and commit schemas/arch.json.
- The app runs without API keys on mock/keyless data. Tests must never hit live market-data providers; use tests/fixtures and msw.
- Never commit secrets, CLAUDE.md, or anything under .claude/. New env vars go in .env.example and schemas/env-schema.json and must pass npm run env:audit:schema.
- Conventional Commits with a scope, e.g. fix(portfolio): ..., feat(data): ....
- If you need a secret, API key, or service you can't reach, say exactly what's missing in your first message and stop. Don't mock it in production code or guess.
- Ask me in the thread before: merging, force-pushing, changing anything under .github/workflows, adding or editing supabase migrations, or touching Stripe/billing or auth code.
- Run at most three threads at a time unless I say otherwise.
```

## 4. Cloud environment (Project settings > Environment)

The default environment reaches npm and PyPI, which covers install, lint,
typecheck, and unit tests. Change it only if a thread needs more:

- **Setup script** (optional, speeds up every thread):
  ```bash
  npm ci && (cd client && npm ci)
  ```
- **Environment variables:** none are required; the app and tests run on
  mock/keyless data. Add `NODE_ENV=test` if you want threads to match CI.
- **Network / secrets:** only for integration work against real providers
  (`POLYGON_API_KEY`, `ALPHA_VANTAGE_API_KEY`, Supabase). Prefer a separate
  environment for that so ordinary threads can't spend provider quota.

## 5. Models and usage

New projects run Opus at high effort for every thread. For routine fixes,
lower **Thread effort** or ask for a smaller model per task in
Project settings > General. Idle threads watching a PR wake on CI failures and
review comments; ask a thread to stop watching once you no longer need it.

## 6. First batch

Send one small real task first (e.g. a single bug from `IDEAS.md` or a failing
check), read how the thread reports back, adjust the instructions above, then
send the rest.
