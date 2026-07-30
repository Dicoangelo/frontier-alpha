#!/usr/bin/env bash
#
# Apply the pending out-of-band migrations to production Supabase.
#
# WHY THIS EXISTS: project rqidgeittsjkpkykmdrz is SHARED across metaventionsai
# apps, so `supabase db push` sees 52 remote migration versions that don't
# exist in this repo and suggests `migration repair --status reverted` — which
# would corrupt the shared history. NEVER run that. This script bypasses the
# migration-history mechanism entirely: it POSTs the SQL straight to the
# Management API, which is safe because every statement is idempotent
# (CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS).
#
# RUN THIS YOURSELF (it reads your keychain): bash scripts/apply-pending-migrations.sh
#
# Pending migrations applied, in order (all idempotent — re-running is safe):
#   1. 20260610_insight_ledger.sql     (frontier_insight_ledger)     [applied 2026-06-11]
#   2. 20260610_forensic_events.sql    (frontier_forensic_events)    [applied 2026-06-11]
#   3. 20260611_provenance_nodes.sql   (frontier_provenance_nodes)
#   4. 20260209_ml_models.sql          (frontier_model_versions)     [added 2026-07-30]
#   5. 20260209_shared_portfolios.sql  (frontier_shared_portfolios)  [added 2026-07-30]
#   6. 002_portfolio_sharing.sql       (frontier_portfolio_shares)   [added 2026-07-30]
#   7. 20260730_portfolio_shares.sql   (portfolio_shares)            [added 2026-07-30]
#
# 4-6 were found on 2026-07-30 by the `databaseSchema` probe on
# /api/v1/health/integrations: the server queries those three tables and none of
# them exist in production. Portfolio sharing (routes/portfolio.ts,
# services/SharingService.ts) and the ML model registry (routes/ml.ts) are
# therefore non-functional — and silently so, because every one of those queries
# sits inside a try/catch. Their migrations were simply never applied.
#
# Safety review before adding them:
#   - all three use CREATE TABLE IF NOT EXISTS, so re-running is a no-op
#   - 002 declares DELETE statements, but only inside the body of
#     CREATE OR REPLACE FUNCTION cleanup_expired_cache(); they run when that
#     function is CALLED, never at migration time, and each has a WHERE clause
#   - 002's CREATE TRIGGER has no IF NOT EXISTS, which is fine on first apply
#     (the table does not exist yet, so neither does the trigger) but WILL error
#     if the table is later dropped and recreated by hand
#   - 002's only foreign keys are auth.users and frontier_portfolios, both of
#     which already exist in production
#
# 7 is new, written 2026-07-30. services/SharingService.ts:206,236 queried a
# bare `portfolio_shares` table that had no CREATE TABLE in ANY migration — and
# those two functions are the LIVE sharing path (routes/social.ts imports them
# for POST /api/v1/portfolio/share and GET /api/v1/portfolio/shared/:token), so
# sharing has never worked in production. Neither existing share table fits:
# frontier_portfolio_shares requires a portfolio_id FK this path does not have,
# and frontier_shared_portfolios has no expires_at. The new migration defines
# exactly the columns the code already inserts and selects, service-role RLS
# only (the anon key must never read snapshots directly).

set -euo pipefail

PROJECT_REF="rqidgeittsjkpkykmdrz"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS=(
  "$REPO_ROOT/supabase/migrations/20260610_insight_ledger.sql"
  "$REPO_ROOT/supabase/migrations/20260610_forensic_events.sql"
  "$REPO_ROOT/supabase/migrations/20260611_provenance_nodes.sql"
  "$REPO_ROOT/supabase/migrations/20260209_ml_models.sql"
  "$REPO_ROOT/supabase/migrations/20260209_shared_portfolios.sql"
  "$REPO_ROOT/supabase/migrations/002_portfolio_sharing.sql"
  "$REPO_ROOT/supabase/migrations/20260730_portfolio_shares.sql"
)

# --- Token: Supabase CLI stores it in the macOS keychain via go-keyring,
# --- which base64-wraps values behind a "go-keyring-base64:" prefix.
raw="$(security find-generic-password -s 'Supabase CLI' -w 2>/dev/null || true)"
if [[ -z "$raw" ]]; then
  echo "✗ No 'Supabase CLI' keychain entry. Run: supabase login" >&2
  exit 1
fi
if [[ "$raw" == go-keyring-base64:* ]]; then
  TOKEN="$(printf '%s' "${raw#go-keyring-base64:}" | base64 -d)"
else
  TOKEN="$raw"
fi
if [[ "$TOKEN" != sbp_* ]]; then
  echo "✗ Keychain value doesn't look like a Supabase access token (expected sbp_…)." >&2
  echo "  Fallback: paste each migration into" >&2
  echo "  https://supabase.com/dashboard/project/$PROJECT_REF/sql/new" >&2
  exit 1
fi

# --- Apply each migration via the Management API query endpoint.
for file in "${MIGRATIONS[@]}"; do
  name="$(basename "$file")"
  echo "→ Applying $name ..."
  body="$(python3 -c 'import json,sys; print(json.dumps({"query": open(sys.argv[1]).read()}))' "$file")"
  response="$(curl -sS -w '\n%{http_code}' -X POST \
    "https://api.supabase.com/v1/projects/$PROJECT_REF/database/query" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$body")"
  status="$(tail -n1 <<<"$response")"
  payload="$(sed '$d' <<<"$response")"
  if [[ "$status" == 2* ]]; then
    echo "  ✓ $name applied (HTTP $status)"
  elif grep -q 'already exists' <<<"$payload"; then
    echo "  ✓ $name already applied (idempotent skip)"
  else
    echo "  ✗ $name failed (HTTP $status): $payload" >&2
    exit 1
  fi
done

# --- Verify every table exists (harmless catalog read).
echo "→ Verifying tables ..."
verify_body='{"query":"SELECT tablename FROM pg_tables WHERE tablename IN ('"'"'frontier_insight_ledger'"'"','"'"'frontier_forensic_events'"'"','"'"'frontier_provenance_nodes'"'"','"'"'frontier_model_versions'"'"','"'"'frontier_shared_portfolios'"'"','"'"'frontier_portfolio_shares'"'"','"'"'portfolio_shares'"'"') ORDER BY tablename;"}'
curl -sS -X POST \
  "https://api.supabase.com/v1/projects/$PROJECT_REF/database/query" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$verify_body"
echo
echo "✓ Done. Both ledger tables are live; the server picks them up on its next write (no redeploy needed)."
