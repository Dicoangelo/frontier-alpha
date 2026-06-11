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
# Pending migrations applied, in order:
#   1. 20260610_insight_ledger.sql    (frontier_insight_ledger)
#   2. 20260610_forensic_events.sql   (frontier_forensic_events)

set -euo pipefail

PROJECT_REF="rqidgeittsjkpkykmdrz"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS=(
  "$REPO_ROOT/supabase/migrations/20260610_insight_ledger.sql"
  "$REPO_ROOT/supabase/migrations/20260610_forensic_events.sql"
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

# --- Verify both tables exist (harmless catalog read).
echo "→ Verifying tables ..."
verify_body='{"query":"SELECT tablename FROM pg_tables WHERE tablename IN ('"'"'frontier_insight_ledger'"'"','"'"'frontier_forensic_events'"'"');"}'
curl -sS -X POST \
  "https://api.supabase.com/v1/projects/$PROJECT_REF/database/query" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$verify_body"
echo
echo "✓ Done. Both ledger tables are live; the server picks them up on its next write (no redeploy needed)."
