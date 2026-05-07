#!/usr/bin/env bash
# Wire Frontier Alpha production env vars on Vercel.
#
# Adds the VITE_-prefixed mirrors (required for Vite to expose to browser)
# and a couple of nice-to-haves. Reads existing values from `vercel env pull`
# so we don't introduce new credentials.
#
# Run from repo root:  bash scripts/wire-production-env.sh
#
# Idempotent: if a var is already set, vercel will prompt to overwrite. Pass
# --force to non-interactively replace.

set -euo pipefail

if [[ "${1:-}" == "--force" ]]; then
  FORCE_FLAG="--force"
else
  FORCE_FLAG=""
fi

echo "→ Pulling current production env to mirror Supabase values..."
TMPENV="$(mktemp)"
trap "rm -f $TMPENV" EXIT
vercel env pull "$TMPENV" --environment=production --yes >/dev/null 2>&1

# Strip trailing \n from values pulled by vercel
SUPABASE_URL_VAL=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' "$TMPENV" | sed 's/^NEXT_PUBLIC_SUPABASE_URL="//' | sed 's/\\n"$//' | sed 's/"$//')
ANON_KEY_VAL=$(grep '^NEXT_PUBLIC_SUPABASE_ANON_KEY=' "$TMPENV" | sed 's/^NEXT_PUBLIC_SUPABASE_ANON_KEY="//' | sed 's/\\n"$//' | sed 's/"$//')

if [[ -z "$SUPABASE_URL_VAL" || -z "$ANON_KEY_VAL" ]]; then
  echo "✗ Could not read existing Supabase vars from production. Aborting."
  exit 1
fi

add_var () {
  local name="$1" value="$2"
  echo "→ Setting $name..."
  echo "$value" | vercel env add "$name" production $FORCE_FLAG >/dev/null 2>&1 || \
    echo "  (already exists; pass --force to overwrite)"
}

# CRITICAL — without these the Vite client has no Supabase visibility (today
# uses hardcoded fallback in lib/supabase.ts which is bad practice).
add_var "VITE_SUPABASE_URL" "$SUPABASE_URL_VAL"
add_var "VITE_SUPABASE_ANON_KEY" "$ANON_KEY_VAL"

# Also useful — version display + relative API base
add_var "VITE_APP_VERSION" "1.1.0"
add_var "VITE_API_URL" ""

echo ""
echo "Done. Now redeploy so the build picks up the new vars:"
echo ""
echo "  vercel --prod --yes"
echo ""
echo "Optional next env vars (manually with 'vercel env add NAME production'):"
echo "  • OPENAI_API_KEY            → upgrades cognitive explainer from template to GPT-4o"
echo "  • STRIPE_SECRET_KEY         → enables real checkout from Pricing"
echo "  • VITE_STRIPE_PRO_PRICE_ID  → wires Pricing 'Subscribe' CTA to live price"
echo "  • VITE_STRIPE_ENTERPRISE_PRICE_ID"
echo "  • UPSTASH_REDIS_REST_URL    → production-grade rate limiting"
echo "  • UPSTASH_REDIS_REST_TOKEN"
echo "  • VITE_SENTRY_DSN           → client-side error tracking"
echo "  • SENTRY_DSN                → server-side error tracking"
echo "  • VITE_VAPID_PUBLIC_KEY     → push notifications"
echo "  • VAPID_PRIVATE_KEY"
