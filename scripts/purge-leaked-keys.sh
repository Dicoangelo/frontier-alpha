#!/usr/bin/env bash
#
# Purge the 2026-02 leaked credentials from git history.
#
# Context: a real `.env` was committed in b2f7184 (2026-02-03) and deleted in
# 3657f72 (2026-02-12). Deletion does not remove a blob. A hardcoded Polygon
# fallback in scripts/intel-bridge.ts leaked the same key across a further 28
# commits. See docs/CREDENTIAL-ROTATION-2026-08.md for the full incident.
#
# ORDER MATTERS. Rotating comes FIRST. Rewriting history does not un-leak a key
# somebody already scraped — it only stops future scrapes. Run this only after
# the keys are dead at the provider.
#
# This script is deliberately NOT destructive to your working clone: it operates
# on a fresh mirror and stops before pushing. The push is yours to run manually.
#
set -euo pipefail

REPO_URL="${1:-https://github.com/Dicoangelo/frontier-alpha.git}"
WORKDIR="${2:-$(mktemp -d)}/fa-purge"

command -v git-filter-repo >/dev/null || {
  echo "error: git-filter-repo not installed (brew install git-filter-repo)" >&2
  exit 1
}

echo "==> mirroring $REPO_URL"
git clone --mirror "$REPO_URL" "$WORKDIR"
cd "$WORKDIR"

echo "==> locating leaked literals in history"
# Extracted FROM the blobs rather than hardcoded, so this script never itself
# becomes a place a secret is written down.
python3 - <<'PY'
import subprocess, re
rev = subprocess.run(['git','rev-list','--all'],capture_output=True,text=True).stdout.split()
hits = subprocess.run(['git','grep','-l','-e','CmAs6n','-e','MN1JRV70',*rev],
                      capture_output=True,text=True).stdout.splitlines()
secrets=set()
for line in hits:
    c,_,p = line.partition(':')
    txt = subprocess.run(['git','show',f'{c}:{p}'],capture_output=True,text=True).stdout
    secrets.update(m.group(1) for m in
        re.finditer(r'\b(CmAs6n[A-Za-z0-9_]{20,}|MN1JRV70[A-Z0-9]{4,})\b', txt))
if not secrets:
    raise SystemExit('no leaked literals found — already purged?')
with open('.secrets-to-purge.txt','w') as f:
    for s in sorted(secrets):
        f.write(f'{s}==>***REMOVED-ROTATED-KEY***\n')
print(f'    {len(secrets)} distinct literals across {len(hits)} commit/path pairs')
PY

echo "==> rewriting"
# Two different operations, one pass:
#   .env                     -> drop the path entirely; it must not exist at all
#   scripts/intel-bridge.ts  -> redact in place; the path is live in HEAD and
#                               deleting it would rewrite the working tree
git filter-repo --force \
  --invert-paths --path .env \
  --replace-text .secrets-to-purge.txt

rm -f .secrets-to-purge.txt

echo "==> verifying"
if git grep -l -e 'CmAs6n' -e 'MN1JRV70' $(git rev-list --all) 2>/dev/null | head -1 | grep -q .; then
  echo "FAIL: leaked literal still reachable" >&2
  exit 1
fi
echo "    no leaked literal reachable from any ref"
for p in .env.example client/.env.production; do
  git rev-list --all --objects | awk '{print $2}' | grep -qx "$p" \
    && echo "    preserved: $p" || echo "    WARNING: $p vanished"
done

cat <<EOF

==> rewrite staged in: $WORKDIR
    commit-map (old->new SHAs): $WORKDIR/filter-repo/commit-map

NOT PUSHED. Before you push, understand what it costs:
  - every commit SHA from the first affected commit forward changes
  - 30 remote branches and the 4 open Dependabot PRs are cut adrift; close and
    let Dependabot recreate them rather than trying to rebase
  - anyone else's clone must re-clone, not pull

To push:
    cd $WORKDIR
    git remote add origin $REPO_URL
    git push --force --mirror origin

Then fix the docs that cite now-dangling SHAs:
    scripts/fixup-doc-shas.mjs $WORKDIR/filter-repo/commit-map

Finally, ask GitHub Support to purge cached views of the old objects. Until they
do, the old commits stay reachable at their URLs even though no ref points there.
EOF
