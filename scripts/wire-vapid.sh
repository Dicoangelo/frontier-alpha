#!/usr/bin/env bash
# Wire VAPID web-push keys to Frontier Alpha on Vercel.
#
# Reads scripts/.vapid-keys.json (generated locally — gitignored, chmod 600)
# and pushes 4 production env vars to Vercel:
#
#   VAPID_PUBLIC_KEY        — server signs notifications with this pair
#   VAPID_PRIVATE_KEY       — never exposed to the client
#   WEB_PUSH_SUBJECT        — mailto: identifying the application server
#   VITE_VAPID_PUBLIC_KEY   — client-side mirror, baked into the Vite build
#
# Generate the keys first (one time):
#   npx --yes web-push generate-vapid-keys --json > scripts/.vapid-keys.json
#   chmod 600 scripts/.vapid-keys.json
#
# Usage:
#   bash scripts/wire-vapid.sh           # add (skips if already set)
#   bash scripts/wire-vapid.sh --force   # overwrite existing values

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEYS_FILE="$SCRIPT_DIR/.vapid-keys.json"
WEB_PUSH_SUBJECT="mailto:dico@metaventionsai.com"

if [[ ! -f "$KEYS_FILE" ]]; then
  echo "✗ $KEYS_FILE not found"
  echo ""
  echo "  Generate VAPID keys first:"
  echo "    npx --yes web-push generate-vapid-keys --json > scripts/.vapid-keys.json"
  echo "    chmod 600 scripts/.vapid-keys.json"
  exit 1
fi

# Read JSON via python3 (preferred) or jq (fallback). Don't source — never
# put VAPID_PRIVATE_KEY in the shell environment of this script's parent.
read_key () {
  local field="$1"
  if command -v python3 >/dev/null 2>&1; then
    python3 -c "import json,sys; print(json.load(open('$KEYS_FILE'))['$field'])"
  elif command -v jq >/dev/null 2>&1; then
    jq -r ".$field" "$KEYS_FILE"
  else
    echo "✗ Need python3 or jq to parse $KEYS_FILE" >&2
    exit 1
  fi
}

PUBLIC_KEY="$(read_key publicKey)"
PRIVATE_KEY="$(read_key privateKey)"

if [[ -z "$PUBLIC_KEY" || -z "$PRIVATE_KEY" ]]; then
  echo "✗ Failed to parse publicKey/privateKey from $KEYS_FILE"
  exit 1
fi

# Sanity check the public-key shape — VAPID public keys are URL-safe base64
# uncompressed P-256 points, ~87 chars starting with 'B'.
if [[ "${PUBLIC_KEY:0:1}" != "B" ]]; then
  echo "⚠  publicKey does not start with 'B' — output may not be a VAPID key"
fi

FORCE_FLAG=""
[[ "${1:-}" == "--force" ]] && FORCE_FLAG="--force"

if ! command -v vercel >/dev/null 2>&1; then
  echo "✗ vercel CLI not found. Install with:  npm i -g vercel"
  exit 1
fi

add_var () {
  local name="$1" value="$2"
  echo "→ Setting $name on Vercel production..."
  if echo "$value" | vercel env add "$name" production $FORCE_FLAG >/dev/null 2>&1; then
    echo "  ✓ set"
  else
    echo "  (already exists; pass --force to overwrite)"
  fi
}

add_var "VAPID_PUBLIC_KEY"      "$PUBLIC_KEY"
add_var "VAPID_PRIVATE_KEY"     "$PRIVATE_KEY"
add_var "WEB_PUSH_SUBJECT"      "$WEB_PUSH_SUBJECT"
add_var "VITE_VAPID_PUBLIC_KEY" "$PUBLIC_KEY"

echo ""
echo "Done. Redeploy so the new vars take effect:"
echo ""
echo "  vercel --prod --yes"
echo ""
echo "After redeploy, verify the public key is exposed:"
echo "  curl -sS https://frontier-alpha.metaventionsai.com/api/v1/notifications/vapid-public-key"
echo ""
echo "And the client should pick it up via VITE_VAPID_PUBLIC_KEY at build time."
