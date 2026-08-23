#!/usr/bin/env bash
#
# Propagate a rotated credential to every surface that holds it, fast.
#
# Rotating at the provider kills the old key IMMEDIATELY. Production is broken
# from that moment until all four surfaces carry the new value, so this exists to
# make the window seconds rather than however long it takes to remember Railway.
#
# Surfaces: Vercel (production/preview/development), Railway, GitHub Actions,
# and .env.local. Missing any one of them is the actual failure mode here —
# Railway is the easy one to forget, it runs the always-on WebSocket tier.
#
# Usage:
#   ./scripts/rotate-key.sh POLYGON_API_KEY
#     ...then paste the new value at the prompt (never as an argv, which would
#     land in shell history and the process table).
#
set -euo pipefail

NAME="${1:-}"
[ -n "$NAME" ] || { echo "usage: $0 <ENV_VAR_NAME>" >&2; exit 1; }

SCHEMA="$(dirname "$0")/../schemas/env-schema.json"

printf 'New value for %s (input hidden): ' "$NAME"
read -rs VALUE
printf '\n'
[ -n "$VALUE" ] || { echo "error: empty value" >&2; exit 1; }

# Validate BEFORE distributing. Pushing a malformed value to four places and
# then discovering it is exactly how the GitHub secret store ended up with a
# literal \n in three secrets.
if [ -f "$SCHEMA" ]; then
  if ! NAME="$NAME" VALUE="$VALUE" node -e '
    const fs=require("fs");
    const {vars}=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
    const v=vars.find(x=>x.name===process.env.NAME);
    const val=process.env.VALUE;
    if(!v){console.error(`  ! ${process.env.NAME} not in schema — skipping validation`);process.exit(0);}
    const bad=[];
    if(/\\n/.test(val)) bad.push("literal \\n");
    if(val!==val.trim()) bad.push("leading/trailing whitespace");
    if(v.length && val.length!==v.length) bad.push(`length ${val.length}, schema says ${v.length}`);
    if(v.regex && !new RegExp(v.regex).test(val)) bad.push(`does not match /${v.regex}/`);
    if(bad.length){console.error("  ✗ "+bad.join("; "));process.exit(1);}
    console.log(`  ✓ validates against schema (${val.length} chars)`);
  ' "$SCHEMA"; then
    echo "refusing to distribute a value that fails its own schema" >&2
    exit 1
  fi
fi

echo "==> Vercel"
for env in production preview development; do
  vercel env rm "$NAME" "$env" --yes >/dev/null 2>&1 || true
  # printf, never echo: echo appends \n and `vercel env add` takes stdin verbatim.
  printf "%s" "$VALUE" | vercel env add "$NAME" "$env" >/dev/null && echo "    ✓ $env"
done

echo "==> Railway (always-on tier — the one that gets forgotten)"
if command -v railway >/dev/null 2>&1; then
  railway variables --set "$NAME=$VALUE" >/dev/null 2>&1 \
    && echo "    ✓ set" || echo "    ! failed — set it by hand"
else
  echo "    ! railway CLI absent — set it by hand"
fi

echo "==> GitHub Actions"
printf "%s" "$VALUE" | gh secret set "$NAME" >/dev/null && echo "    ✓ set"

echo "==> .env.local"
LOCAL="$(dirname "$0")/../.env.local"
touch "$LOCAL"
if grep -q "^${NAME}=" "$LOCAL" 2>/dev/null; then
  grep -v "^${NAME}=" "$LOCAL" > "$LOCAL.tmp" && mv "$LOCAL.tmp" "$LOCAL"
fi
printf '%s=%s\n' "$NAME" "$VALUE" >> "$LOCAL"
echo "    ✓ written"

unset VALUE

cat <<EOF

==> propagated. Now redeploy BOTH tiers, they still run the dead key:

    vercel --prod
    railway up

Then verify:

    curl -s https://frontier-alpha.metaventionsai.com/api/v1/health/integrations \\
      | jq '.integrations | to_entries[] | select(.value.status != "live") | .key'
    # only polygonWebSocket should appear (Vercel tier, degraded by design)

    gh workflow run env-audit.yml && sleep 60 \\
      && gh run list --workflow=env-audit.yml --limit 1
EOF
