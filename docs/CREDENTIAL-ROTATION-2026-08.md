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

## Order of operations

Rotation comes first. Rewriting history stops *future* scrapes; it does nothing
about anyone who already has the key. Doing the rewrite first just adds delay
before the key is dead.

### 1. Rotate at the provider

- Polygon: regenerate at https://polygon.io/dashboard/api-keys
- Alpha Vantage: claim a new key at https://www.alphavantage.co/support/#api-key,
  then email support to deactivate `MN1J…PPGB`

### 2. Propagate to all four surfaces

`POLYGON_API_KEY` must be exactly 32 chars. **Always `printf`, never `echo`** —
`echo` appends a newline, `vercel env add` takes it verbatim, and the result
401s silently. That is the v1.2.6 incident, already recorded in
`schemas/env-schema.json`.

```bash
NEW_POLYGON='...'   # 32 chars

# a) Vercel — all three environments
for env in production preview development; do
  printf "%s" "$NEW_POLYGON" | vercel env add POLYGON_API_KEY "$env" --force
done

# b) Railway — the always-on WebSocket tier. Easy to forget; it holds these too.
railway variables set POLYGON_API_KEY="$NEW_POLYGON"

# c) local
#    edit .env.local by hand

# d) GitHub Actions — see step 3
```

Repeat for `ALPHA_VANTAGE_API_KEY`. Then redeploy both tiers and confirm:

```bash
curl -s https://frontier-alpha.metaventionsai.com/api/v1/health/integrations \
  | jq '.integrations | to_entries[] | select(.value.status != "live") | .key'
# only polygonWebSocket should appear (Vercel-tier degraded by design)
```

### 3. Repair the GitHub Actions secret store

Independent of the leak, this store is broken and has kept CI red since
2026-08-18:

- `SUPABASE_URL` carries a trailing `/n`. The failing request goes to
  `https://<ref>.supabase.co/n/auth/v1/admin/users`, the gateway rejects it, and
  supabase-js reports the misleading `Invalid API key`.
- `CRON_SECRET` is referenced by `integration-tests.yml` but **absent** from the
  repo's secrets entirely.
- `VERCEL_TOKEN` is absent, so the weekly value audit has never actually run —
  it warns and skips.

A real newline would be invisible here: WHATWG URL parsing strips tab/newline
from URLs, so only mangled forms like `/n` survive to break routing.

```bash
# printf, not echo — same rule, same reason
printf "%s" "https://rqidgeittsjkpkykmdrz.supabase.co" | gh secret set SUPABASE_URL
printf "%s" "$(openssl rand -hex 32)"                   | gh secret set CRON_SECRET
printf "%s" "$VERCEL_TOKEN"                             | gh secret set VERCEL_TOKEN

# CRON_SECRET must MATCH the value Vercel already uses, or the synthetic monitor
# rejects CI's calls. Pull it rather than generating a fresh one:
#   vercel env pull .env.tmp --environment=production && grep CRON_SECRET .env.tmp
```

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

- [ ] Polygon key regenerated
- [ ] Alpha Vantage new key claimed
- [ ] Alpha Vantage support emailed to deactivate the old key
- [ ] Vercel updated (production / preview / development)
- [ ] Railway updated
- [ ] `.env.local` updated
- [ ] GitHub `SUPABASE_URL` repaired
- [ ] GitHub `CRON_SECRET` added, matching Vercel
- [ ] GitHub `VERCEL_TOKEN` added
- [ ] both tiers redeployed, `/health/integrations` green
- [ ] `integration-tests.yml` green on manual dispatch
- [ ] `visual-regression.yml` green
- [ ] history rewritten and force-pushed
- [ ] doc SHAs fixed up
- [ ] Dependabot PRs closed and recreated
- [ ] GitHub Support asked to purge cached views
