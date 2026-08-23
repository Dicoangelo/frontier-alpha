# Credential rotation — 2026-08 leaked-key incident

Status: **keys not yet rotated.** This document is the procedure, not a record of
one. Update the checklist as you go.

## What leaked

`github.com/Dicoangelo/frontier-alpha` is a **public** repo. A real `.env` was
committed in `b2f7184` (2026-02-03) and deleted in `3657f72` (2026-02-12).
Deleting a file does not remove its blob — the content stayed reachable.

A second, separately-introduced leak sat in `scripts/intel-bridge.ts`:

```ts
const POLYGON_KEY = process.env.POLYGON_API_KEY || 'CmAs6n…';  // removed in 437e945
```

Full blast radius, measured by grepping every blob in history for the literals
rather than by filename:

| Path | Commits | Live in HEAD | Purge strategy |
|---|---|---|---|
| `.env` | 84 | no | drop the path entirely |
| `scripts/intel-bridge.ts` | 28 | **yes** | redact in place — the path must survive |

**112 commits.** HEAD and the working tree are clean today; this is history-only.

## Why the exposure is worse than it looks

The Polygon key was **never rotated**, and on 2026-06-23 it was upgraded to the
paid **Stocks Starter** plan (see CLAUDE.md — *"same POLYGON_API_KEY, no
rotation — upgrading the plan lifts the limit on the existing key"*). A key
published since February now carries:

- unlimited call rate
- grouped-daily calls returning 12,481 tickers at once
- **Flat Files S3 access** — those credentials are the Access Key ID plus *the
  API key as the secret*, so the leaked key is also an object-store credential

The v1.2.6 note that the key was "rotated" refers to re-storing the **same** key
correctly after `echo` truncated it 32→30 chars. A format fix, not a new key.

## Provider-specific reality

| Provider | Self-serve revoke | Consequence |
|---|---|---|
| Polygon / Massive | yes — regenerate at `polygon.io/dashboard/api-keys` | old key dies immediately; real remediation |
| Alpha Vantage | **no** | their support page grants keys *"lifetime access"* and publishes only a subscription-cancellation workflow |

For Alpha Vantage the only path is: claim a new key, swap it in, then email
support@alphavantage.co asking them to deactivate the old one. Free tier is
25 req/day so the exposure is bounded, but **you cannot kill it yourself, and
rewriting git history will not un-leak it.**

## Verified live exposure (2026-08-23)

Not inferred. An **anonymous** request — no token, no login — returns the keys:

```
GET https://api.github.com/repos/Dicoangelo/frontier-alpha
  -> HTTP 200, visibility: public

GET .../git/blobs/577b3955…   -> HTTP 200, contains POLYGON + ALPHA_VANTAGE
GET .../git/blobs/ab636304…   -> HTTP 200, contains POLYGON
```

Anyone on the internet can fetch both keys with one command, today.

### The forks make the rewrite insufficient

The repo has **three public forks**, all created after the leak commit. A fork
carries its own copy of the object graph, and **you cannot rewrite a repository
you do not own.** Checked directly:

| Fork | Leaked blob | Serves the key |
|---|---|---|
| `hahzterry/frontier-alpha` | HTTP 200 | **yes** |
| `dorucioclea/frontier-alpha` | HTTP 200 | **yes** |
| `zhenhaip/frontier-alpha` | HTTP 404 | no |

Two accounts outside your control are serving the live Polygon key right now.
`git filter-repo` on the origin, a force-push, and a GitHub Support cache purge
do nothing to them.

**Therefore rotation is not the first of several remediations — it is the only
one that works.** The history rewrite is still worth doing so the origin stops
being a source, but treating it as the fix would leave the key live.

Clean, for the record: the deployed client bundle at
`frontier-alpha.metaventionsai.com` and the local `dist/` contain neither key.
Exposure is git history only, never the browser.

## Order of operations

Rotation comes first. Rewriting history stops *future* scrapes from the origin;
it does nothing about anyone who already has the key, and nothing about the
forks. Doing the rewrite first just adds delay before the key is dead.

### 1. Rotate at the provider

- Polygon: regenerate at https://polygon.io/dashboard/api-keys
- Alpha Vantage: claim a new key at https://www.alphavantage.co/support/#api-key,
  then email support to deactivate `MN1J…PPGB`

### 2. Propagate to all four surfaces

`POLYGON_API_KEY` must be exactly 32 chars. **Always `printf`, never `echo`** —
`echo` appends a newline, `vercel env add` takes it verbatim, and the result
401s silently. That is the v1.2.6 incident, already recorded in
`schemas/env-schema.json`.

Rotating kills the old key instantly, so production is broken until every
surface carries the new one. Use the script — it validates the value against
`schemas/env-schema.json` BEFORE distributing, then writes all four surfaces:

```bash
./scripts/rotate-key.sh POLYGON_API_KEY     # prompts, input hidden
./scripts/rotate-key.sh ALPHA_VANTAGE_API_KEY
```

The pre-flight validation is the point. It rejects both incidents this repo has
already had:

```
30-char key        -> ✗ length 30, schema says 32; does not match /^[A-Za-z0-9_]{32}$/
trailing literal \n -> ✗ literal \n; does not match /^https://[a-z0-9-]+\.supabase\.co/?$/
```

Distributing first and validating later is how three GitHub secrets ended up
with `\n`.

Repeat for `ALPHA_VANTAGE_API_KEY`. Then redeploy both tiers and confirm:

```bash
curl -s https://frontier-alpha.metaventionsai.com/api/v1/health/integrations \
  | jq '.integrations | to_entries[] | select(.value.status != "live") | .key'
# only polygonWebSocket should appear (Vercel-tier degraded by design)
```

### 3. Repair the GitHub Actions secret store

Independent of the leak, this store is broken and has kept CI red since
2026-08-18. **Measured** by dispatching the `secrets-audit` job on 2026-08-23
(run `32609303298`) — not inferred:

| Secret | State | Length |
|---|---|---|
| `SUPABASE_URL` | literal `\n` appended | 42 |
| `SUPABASE_SERVICE_KEY` | literal `\n` appended | 221 |
| `SUPABASE_ANON_KEY` | literal `\n` appended | 210 |
| `CRON_SECRET` | absent / empty | — |
| `VITE_SUPABASE_URL` | clean | 40 |
| `VITE_SUPABASE_ANON_KEY` | clean | 208 |

**Three** secrets are corrupted, not one. Each ends in the two characters
`\` + `n` — classic `echo` interpolation. All three were written at
`2026-06-17T01:36:36-37Z`, seconds apart: one scripted batch. The `VITE_` pair
was written a second later by some other path and is clean.

Two consequences worth being precise about:

- The wire showed `https://<ref>.supabase.co/n/auth/v1/admin/users` because the
  WHATWG URL parser **normalizes backslash to forward slash**. That is why a
  literal `\n` surfaced as `/n`. A *real* newline would have been stripped
  entirely and been invisible.
- `SUPABASE_SERVICE_KEY` also carries `\n`, so `Invalid API key` was **literally
  true**. Repairing only the URL would not have turned CI green. Fix all three.

`VERCEL_TOKEN` is also absent, so the weekly Vercel value audit has never run —
it warns and skips.

```bash
# printf, not echo — echo is what put the \n there in the first place.
# Pull the true values from Vercel, which the audit shows is the clean copy:
vercel env pull .env.tmp --environment=production

# Then set all THREE corrupted secrets plus the two missing ones.
printf "%s" "$SUPABASE_URL"         | gh secret set SUPABASE_URL
printf "%s" "$SUPABASE_SERVICE_KEY" | gh secret set SUPABASE_SERVICE_KEY
printf "%s" "$SUPABASE_ANON_KEY"    | gh secret set SUPABASE_ANON_KEY
printf "%s" "$CRON_SECRET"          | gh secret set CRON_SECRET
printf "%s" "$VERCEL_TOKEN"         | gh secret set VERCEL_TOKEN
rm -f .env.tmp

# CRON_SECRET must MATCH the value Vercel already uses, or the synthetic monitor
# rejects CI's calls. Never generate a fresh one here.
```

Confirm the repair without waiting for a cron:

```bash
gh workflow run env-audit.yml && sleep 60 \
  && gh run list --workflow=env-audit.yml --limit 1
```

The `secrets-audit` job prints one line per secret and exits non-zero on any
`✗`, so a clean run is the proof.

Verify without waiting for the 13:00 UTC cron:

```bash
gh workflow run integration-tests.yml && sleep 90 && gh run list --limit 3
```

The preflight step added in `cab6cf6` now audits these values before the suite
runs, so a remaining problem is named explicitly instead of surfacing as
`Invalid API key`.

### 4. Rewrite history

Only after the keys are dead.

```bash
./scripts/purge-leaked-keys.sh
```

It mirrors the repo, extracts the literals from the blobs themselves, runs
filter-repo, verifies, and **stops before pushing**. Validated on a mirror:
all 414 commits preserved, `main` tree byte-identical, zero literals reachable,
`.env.example` and `client/.env.production` untouched.

What the push costs:

- every SHA from the first affected commit forward changes (`main`: `df05ccd` → new)
- **30 remote branches and 4 open Dependabot PRs are cut adrift.** Close the
  Dependabot PRs and let it recreate them; do not try to rebase them.
- any other clone must re-clone, not pull

Then repair the docs that cite now-dangling commits:

```bash
node scripts/fixup-doc-shas.mjs <workdir>/filter-repo/commit-map          # dry run
node scripts/fixup-doc-shas.mjs <workdir>/filter-repo/commit-map --write
```

### 5. Ask GitHub to purge cached views

Force-pushing removes the refs, but old commits stay reachable by URL until
GitHub garbage-collects. Open a support request naming the repo and asking for
cached views of the removed objects to be purged.

Ask them about the forks in the same request. `hahzterry/frontier-alpha` and
`dorucioclea/frontier-alpha` serve the leaked blob and you have no way to rewrite
them yourself — Support can act on a fork network for a credential leak. Do not
wait on that answer before rotating; assume the key stays public forever.

## Why no tooling caught any of this

Verified in the GitHub UI on 2026-08-18: `secret_scanning` and `push_protection`
were **already enabled** and missed both keys. Polygon and Alpha Vantage are not
GitHub partner patterns, and the two features that would have caught them —
`secret_scanning_non_provider_patterns` and `secret_scanning_validity_checks` —
do not exist for a personal-account public repo. They are paid Secret Protection
features. `PATCH /repos/{owner}/{repo}` with those fields returns **HTTP 200 and
silently changes nothing.**

So rotation is the entire remediation. There is no detection to fall back on.

## Checklist

- [ ] Polygon key regenerated  ← the only step that actually closes this
- [ ] Alpha Vantage new key claimed
- [ ] Alpha Vantage support emailed to deactivate the old key
- [ ] propagated via `scripts/rotate-key.sh` (Vercel x3, Railway, GitHub, .env.local)
- [ ] GitHub `SUPABASE_URL` repaired (literal `\n`)
- [ ] GitHub `SUPABASE_SERVICE_KEY` repaired (literal `\n`)
- [ ] GitHub `SUPABASE_ANON_KEY` repaired (literal `\n`)
- [ ] GitHub `CRON_SECRET` added, matching Vercel
- [ ] GitHub `VERCEL_TOKEN` added
- [ ] both tiers redeployed, `/health/integrations` green
- [ ] `integration-tests.yml` green on manual dispatch
- [ ] `visual-regression.yml` green
- [ ] history rewritten and force-pushed
- [ ] doc SHAs fixed up
- [ ] Dependabot PRs closed and recreated
- [ ] GitHub Support asked to purge cached views AND the fork network
