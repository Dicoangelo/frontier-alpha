#!/usr/bin/env bash
# Wire DeepSeek V4 (or V3) to Frontier Alpha's cognitive explainer on Vercel.
#
# Reads DEEPSEEK_API_KEY from ~/.api_keys (the same place `cdc` reads from)
# and adds it as a production env var on Vercel. After this runs, the
# ExplanationService will use DeepSeek instead of template fallback.
#
# Usage:
#   bash scripts/wire-deepseek.sh           # add (errors if already set)
#   bash scripts/wire-deepseek.sh --force   # overwrite

set -euo pipefail

KEYS_FILE="$HOME/.api_keys"
[[ -f "$KEYS_FILE" ]] || { echo "✗ $KEYS_FILE not found"; exit 1; }

# Parse only DEEPSEEK_API_KEY. Don't source — that leaks every other key.
DEEPSEEK_KEY="$(awk -F'"' '/^export DEEPSEEK_API_KEY=/ {print $2; exit}' "$KEYS_FILE")"
if [[ -z "$DEEPSEEK_KEY" ]]; then
  echo "✗ DEEPSEEK_API_KEY not set in $KEYS_FILE"
  echo "  Get a key at https://platform.deepseek.com/api_keys"
  echo "  Then edit $KEYS_FILE and put the value between the quotes:"
  echo "    export DEEPSEEK_API_KEY=\"sk-...\""
  exit 1
fi

FORCE_FLAG=""
[[ "${1:-}" == "--force" ]] && FORCE_FLAG="--force"

echo "→ Setting DEEPSEEK_API_KEY on Vercel production..."
echo "$DEEPSEEK_KEY" | vercel env add DEEPSEEK_API_KEY production $FORCE_FLAG >/dev/null 2>&1 || \
  echo "  (already exists; pass --force to overwrite)"

# Optional model override — V4 may publish under a different ID. Default the
# code uses is `deepseek-chat` which is V3 today and auto-rolls to V4 once
# DeepSeek promotes. Comment out if you want to pin a specific version.
# echo "→ Setting DEEPSEEK_MODEL..."
# echo "deepseek-chat" | vercel env add DEEPSEEK_MODEL production $FORCE_FLAG >/dev/null 2>&1 || true

echo ""
echo "Done. Redeploy so the next build picks up the key:"
echo ""
echo "  vercel --prod --yes"
echo ""
echo "After redeploy, the cognitive explainer will route to DeepSeek instead of"
echo "the template fallback. Verify with:"
echo "  curl -sS https://frontier-alpha.metaventionsai.com/api/v1/explain/test"
