#!/usr/bin/env node
/**
 * Rewrite commit SHAs cited in Markdown after a history rewrite.
 *
 * A filter-repo pass changes every SHA from the first affected commit forward.
 * This repo cites real commits throughout CHANGELOG.md, CLAUDE.md and
 * ARCHITECTURE.md as the audit trail for past incidents — "fixed in 6c971eb" is
 * worthless once 6c971eb resolves to nothing. filter-repo writes an old->new
 * commit-map; this walks it and updates every short SHA it can match.
 *
 * Usage:  node scripts/fixup-doc-shas.mjs <path-to-commit-map> [--write]
 * Default is a dry run. Pass --write to modify files.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const [mapPath] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const write = process.argv.includes('--write');
if (!mapPath) {
  console.error('usage: node scripts/fixup-doc-shas.mjs <commit-map> [--write]');
  process.exit(1);
}

// commit-map is "<old-sha> <new-sha>" per line. An all-zero new SHA means the
// commit was dropped entirely — those cannot be remapped, only flagged.
const byPrefix = new Map();
const dropped = new Set();
for (const line of readFileSync(mapPath, 'utf8').split('\n')) {
  const [oldSha, newSha] = line.trim().split(/\s+/);
  if (!oldSha || !newSha) continue;
  if (/^0+$/.test(newSha)) { dropped.add(oldSha); continue; }
  if (oldSha === newSha) continue;
  for (let n = 7; n <= 12; n++) byPrefix.set(oldSha.slice(0, n), newSha);
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.git' || e === 'dist') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.md')) out.push(p);
  }
  return out;
}

let filesChanged = 0;
let refsChanged = 0;
const unresolved = [];

for (const file of walk('.')) {
  const src = readFileSync(file, 'utf8');
  let hits = 0;
  const out = src.replace(/\b[0-9a-f]{7,12}\b/g, (sha) => {
    const mapped = byPrefix.get(sha);
    if (mapped) { hits++; return mapped.slice(0, sha.length); }
    if (dropped.has(sha)) unresolved.push(`${file}: ${sha} (commit dropped)`);
    return sha;
  });
  if (hits) {
    filesChanged++;
    refsChanged += hits;
    console.log(`${write ? 'rewrote' : 'would rewrite'} ${file} — ${hits} SHA ref(s)`);
    if (write) writeFileSync(file, out);
  }
}

console.log(`\n${refsChanged} reference(s) across ${filesChanged} file(s)`);
if (unresolved.length) {
  console.log(`\n${unresolved.length} reference(s) point at dropped commits — fix by hand:`);
  for (const u of unresolved) console.log(`  ${u}`);
}
if (!write) console.log('\ndry run — pass --write to apply');
