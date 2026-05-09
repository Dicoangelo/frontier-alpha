#!/usr/bin/env node
/**
 * scripts/audit-env.mjs
 *
 * Schema-driven env contract audit for Frontier Alpha (US-009).
 *
 * Two modes:
 *
 *   default
 *     - Pulls Vercel env via `vercel env pull .env.audit --environment=production`
 *     - Parses each KEY=VALUE pair
 *     - Validates VALUE against schemas/env-schema.json:
 *         · trailing/leading whitespace
 *         · embedded literal `\n` substring or actual newline
 *         · quoted-empty (`""`)
 *         · schema-declared length match
 *         · schema-declared regex match
 *     - Best-effort Railway audit via `railway variables --json`; documented manual
 *       fallback if the CLI flag is missing
 *     - Exits 1 if any ✗
 *     - Always cleans up `.env.audit` in finally
 *
 *   --schema-only
 *     - Greps every src, client/src, api, tests, scripts code file for
 *       process.env.X and import.meta.env.X references and fails if any X is
 *       missing from the schema.
 *     - Runs in CI on every PR with no Vercel access required.
 *
 * Source-of-truth pattern matches scripts/arch-scanner.mjs (US-001):
 *   - argv flags
 *   - ANSI-colored output, suppressed when not TTY
 *   - exit 1 on failure, exit 0 on clean
 */
import { execSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCHEMA_PATH = join(REPO_ROOT, 'schemas', 'env-schema.json');
const AUDIT_FILE = join(REPO_ROOT, '.env.audit');

// ANSI colors (only used in TTY)
const COLOR = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};
const useColor = process.stdout.isTTY;
const c = (color, s) => (useColor ? `${COLOR[color]}${s}${COLOR.reset}` : s);

function loadSchema() {
  if (!existsSync(SCHEMA_PATH)) {
    console.error(c('red', `✗ ${relative(REPO_ROOT, SCHEMA_PATH)} not found`));
    process.exit(1);
  }
  try {
    return JSON.parse(readFileSync(SCHEMA_PATH, 'utf-8'));
  } catch (err) {
    console.error(c('red', `✗ failed to parse ${relative(REPO_ROOT, SCHEMA_PATH)}: ${err.message}`));
    process.exit(1);
  }
}

function schemaIndex(schema) {
  const map = new Map();
  for (const v of schema.vars) map.set(v.name, v);
  const ignored = new Set(schema.ignoredEnvNames || []);
  return { map, ignored };
}

// ---------- schema-only mode (the cheap CI lint) ----------

function walk(dir, predicate, results = []) {
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.next' || entry === '.graveyard') continue;
    if (entry.startsWith('.')) continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walk(full, predicate, results);
    } else if (predicate(full)) {
      results.push(full);
    }
  }
  return results;
}

function isCodeFile(p) {
  if (p.endsWith('.d.ts')) return false;
  if (p.endsWith('.test.ts') || p.endsWith('.test.tsx')) return false;
  return p.endsWith('.ts') || p.endsWith('.tsx') || p.endsWith('.mjs') || p.endsWith('.js');
}

function findEnvReferences() {
  const dirs = ['src', 'client/src', 'api', 'tests', 'scripts'].map((d) => join(REPO_ROOT, d));
  const refs = new Map(); // name -> Set<filePath>
  const PATTERN = /(?:process\.env|import\.meta\.env)\.([A-Z_][A-Z0-9_]*)/g;

  for (const dir of dirs) {
    const files = walk(dir, isCodeFile);
    for (const f of files) {
      // Skip the audit script and the schema-only audit's source itself
      if (f.endsWith('audit-env.mjs')) continue;
      let src;
      try {
        src = readFileSync(f, 'utf-8');
      } catch {
        continue;
      }
      let m;
      while ((m = PATTERN.exec(src))) {
        const name = m[1];
        if (!refs.has(name)) refs.set(name, new Set());
        refs.get(name).add(relative(REPO_ROOT, f));
      }
    }
  }
  return refs;
}

function runSchemaOnly() {
  const schema = loadSchema();
  const { map, ignored } = schemaIndex(schema);
  const refs = findEnvReferences();

  const missing = [];
  for (const [name, files] of refs) {
    if (ignored.has(name)) continue;
    if (!map.has(name)) {
      missing.push({ name, files: [...files].sort() });
    }
  }

  // Also report schema entries that no source code references (informational)
  const referenced = new Set([...refs.keys()]);
  const orphans = [];
  for (const v of schema.vars) {
    if (!referenced.has(v.name)) orphans.push(v.name);
  }

  console.log(c('bold', `Schema-only audit — ${schema.vars.length} declared vars, ${refs.size} referenced in code`));
  console.log(c('dim', `  source dirs: src/, client/src/, api/, tests/, scripts/`));
  console.log('');

  if (missing.length === 0) {
    console.log(c('green', `✓ every env reference has a schema entry`));
  } else {
    console.error(c('red', `✗ ${missing.length} env reference${missing.length === 1 ? '' : 's'} missing from ${relative(REPO_ROOT, SCHEMA_PATH)}`));
    for (const { name, files } of missing) {
      console.error(`  ${c('red', '✗')} ${c('bold', name)}`);
      for (const f of files.slice(0, 5)) console.error(c('dim', `      ${f}`));
      if (files.length > 5) console.error(c('dim', `      … +${files.length - 5} more`));
    }
    console.error('');
    console.error(c('yellow', 'Fix:') + ` add an entry for each missing var to ${relative(REPO_ROOT, SCHEMA_PATH)}.`);
    console.error(c('dim', '  Required fields: name, required, description, sourceUrl, lastVerified.'));
    console.error(c('dim', '  Optional fields: regex, length.'));
  }

  if (orphans.length) {
    console.log('');
    console.log(c('dim', `(info) ${orphans.length} schema entries have no current code reference: ${orphans.join(', ')}`));
  }

  process.exit(missing.length === 0 ? 0 : 1);
}

// ---------- value-audit mode (the Vercel pull + lint) ----------

/**
 * Parse a `vercel env pull` formatted file. Each non-empty, non-comment line is
 * `KEY="VALUE"` or `KEY=VALUE`. We also surface raw line context so we can flag
 * literal trailing newline corruption (the bug captured in
 * feedback_vercel_env_newline.md).
 */
function parseDotEnv(text) {
  const out = []; // [{ key, rawValue, displayValue, trailingNewline, leadingNewline, hasLiteralBackslashN }]
  // Split on actual line breaks but keep track if the FILE ended with a stray
  // newline inside a quoted value.
  const lines = text.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line || line.startsWith('#')) {
      i += 1;
      continue;
    }
    const eq = line.indexOf('=');
    if (eq === -1) {
      i += 1;
      continue;
    }
    const key = line.slice(0, eq).trim();
    let valuePart = line.slice(eq + 1);

    // If the value starts with `"`, accumulate further lines until closing `"`
    // — vercel env pull encodes newline-bearing values as multi-line quoted
    // blocks.
    let raw = valuePart;
    if (raw.startsWith('"')) {
      while (i + 1 < lines.length && !raw.endsWith('"')) {
        i += 1;
        raw += '\n' + lines[i];
      }
    }

    // Strip the surrounding quotes if present, but remember whether they were
    // present so we can detect quoted-empty.
    let display = raw;
    let wasQuoted = false;
    if (display.startsWith('"') && display.endsWith('"') && display.length >= 2) {
      display = display.slice(1, -1);
      wasQuoted = true;
    }

    // dotenv-style escapes: literal `\n` in source represents a newline. We
    // inspect both forms so corruption is caught either way.
    const hasLiteralBackslashN = /\\n/.test(display);
    const trailingNewline = /\n\s*$/.test(display);
    const leadingNewline = /^\s*\n/.test(display);
    const trailingWhitespace = /[ \t]+$/.test(display);
    const leadingWhitespace = /^[ \t]+/.test(display);
    const quotedEmpty = wasQuoted && display === '';

    out.push({
      key,
      rawLine: raw,
      value: display,
      wasQuoted,
      hasLiteralBackslashN,
      trailingNewline,
      leadingNewline,
      trailingWhitespace,
      leadingWhitespace,
      quotedEmpty,
    });
    i += 1;
  }
  return out;
}

function vercelPull() {
  console.log(c('cyan', `→ vercel env pull ${relative(REPO_ROOT, AUDIT_FILE)} --environment=production`));
  // Vercel CLI exits 0 on success and writes the file. We don't capture stdout.
  const result = spawnSync('vercel', ['env', 'pull', AUDIT_FILE, '--environment=production', '--yes'], {
    cwd: REPO_ROOT,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  if (result.status !== 0) {
    console.error(c('red', `✗ vercel env pull failed (exit ${result.status})`));
    console.error(c('dim', '  Are you authenticated? Try: vercel login'));
    return false;
  }
  return existsSync(AUDIT_FILE);
}

function railwayAudit() {
  console.log('');
  console.log(c('bold', 'Railway:'));
  // Try the json flag first; fall back to documenting the manual step.
  const probe = spawnSync('railway', ['variables', '--json'], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
  });
  if (probe.error) {
    console.log(c('dim', '  (railway CLI not installed — skipping; mirror Vercel values manually)'));
    return { skipped: true };
  }
  if (probe.status !== 0) {
    console.log(c('yellow', '  ⚠ `railway variables --json` is not supported by this Railway CLI version.'));
    console.log(c('dim', '    Manual step: `railway variables` (no flag) and visually compare values.'));
    console.log(c('dim', '    After Vercel rotations: `railway variables set NAME=VALUE` to mirror.'));
    return { skipped: true };
  }
  let parsed;
  try {
    parsed = JSON.parse(probe.stdout);
  } catch {
    console.log(c('yellow', '  ⚠ railway variables JSON unparseable; skipping'));
    return { skipped: true };
  }
  // Railway returns `{ KEY: "value", ... }` or `[ { name, value }, ... ]` depending on version.
  const railwayMap = new Map();
  if (Array.isArray(parsed)) {
    for (const v of parsed) if (v?.name) railwayMap.set(v.name, String(v.value ?? ''));
  } else if (parsed && typeof parsed === 'object') {
    for (const [k, v] of Object.entries(parsed)) railwayMap.set(k, String(v ?? ''));
  }
  console.log(c('dim', `  ${railwayMap.size} Railway variables fetched`));
  return { skipped: false, map: railwayMap };
}

function auditValueAgainstSchema(entry, schemaVar) {
  // Returns: [{ severity: 'ok'|'warn'|'fail', label: string }]
  const findings = [];

  if (entry.hasLiteralBackslashN) {
    findings.push({ severity: 'fail', label: 'literal `\\n` substring (echo|vercel env add corruption)' });
  }
  if (entry.trailingNewline) {
    findings.push({ severity: 'fail', label: 'trailing newline (use printf "%s", not echo)' });
  }
  if (entry.leadingNewline) {
    findings.push({ severity: 'fail', label: 'leading newline' });
  }
  if (entry.trailingWhitespace) {
    findings.push({ severity: 'warn', label: 'trailing whitespace' });
  }
  if (entry.leadingWhitespace) {
    findings.push({ severity: 'warn', label: 'leading whitespace' });
  }
  if (entry.quotedEmpty) {
    findings.push({ severity: 'fail', label: 'quoted empty ("")' });
  }
  if (schemaVar) {
    if (schemaVar.required && entry.value.length === 0) {
      findings.push({ severity: 'fail', label: 'required but empty' });
    }
    if (typeof schemaVar.length === 'number' && entry.value.length > 0 && entry.value.length !== schemaVar.length) {
      findings.push({
        severity: 'fail',
        label: `length mismatch (${entry.value.length} vs schema ${schemaVar.length})`,
      });
    }
    if (schemaVar.regex && entry.value.length > 0) {
      let re;
      try {
        re = new RegExp(schemaVar.regex);
      } catch {
        re = null;
      }
      if (re && !re.test(entry.value)) {
        findings.push({ severity: 'fail', label: `regex mismatch (/${schemaVar.regex}/)` });
      }
    }
  }
  return findings;
}

function maskValue(v) {
  if (v.length === 0) return '(empty)';
  if (v.length <= 8) return `${v[0] ?? ''}***`;
  return `${v.slice(0, 4)}…${v.slice(-2)} (${v.length} chars)`;
}

function runValueAudit() {
  const schema = loadSchema();
  const { map: schemaMap, ignored } = schemaIndex(schema);

  let exitCode = 0;
  let pulled = false;

  try {
    pulled = vercelPull();
    if (!pulled) {
      console.error(c('red', `✗ could not produce ${relative(REPO_ROOT, AUDIT_FILE)}`));
      exitCode = 1;
      return;
    }
    const text = readFileSync(AUDIT_FILE, 'utf-8');
    const entries = parseDotEnv(text);

    console.log('');
    console.log(c('bold', `Vercel production envs — ${entries.length} parsed lines`));
    console.log(c('dim', `  schema: ${schema.vars.length} declared vars`));
    console.log('');

    const seen = new Set();
    let cleanCount = 0;
    let warnCount = 0;
    let failCount = 0;
    let unknownCount = 0;

    for (const entry of entries) {
      seen.add(entry.key);
      if (ignored.has(entry.key)) continue;

      const schemaVar = schemaMap.get(entry.key);
      const findings = auditValueAgainstSchema(entry, schemaVar);

      const fail = findings.some((f) => f.severity === 'fail');
      const warn = findings.some((f) => f.severity === 'warn');

      const masked = maskValue(entry.value);

      if (!schemaVar) {
        // Not in schema and not ignored — informational, not a failure of the
        // value audit (the schema-only mode is the gate for that).
        unknownCount += 1;
        console.log(`${c('dim', '?')} ${c('dim', entry.key)} ${c('dim', '— not in schema')} ${c('dim', masked)}`);
        continue;
      }
      if (fail) {
        failCount += 1;
        console.log(`${c('red', '✗')} ${c('bold', entry.key)} ${c('dim', masked)}`);
        for (const f of findings) {
          const prefix = f.severity === 'fail' ? c('red', '    ✗') : c('yellow', '    ⚠');
          console.log(`${prefix} ${f.label}`);
        }
        exitCode = 1;
      } else if (warn) {
        warnCount += 1;
        console.log(`${c('yellow', '⚠')} ${c('bold', entry.key)} ${c('dim', masked)}`);
        for (const f of findings) console.log(`${c('yellow', '    ⚠')} ${f.label}`);
      } else {
        cleanCount += 1;
        console.log(`${c('green', '✓')} ${c('bold', entry.key)} ${c('dim', masked)}`);
      }
    }

    // Required schema vars that are MISSING from production envs entirely
    const missingRequired = [];
    for (const v of schema.vars) {
      if (v.required && !seen.has(v.name)) missingRequired.push(v.name);
    }
    if (missingRequired.length) {
      console.log('');
      console.log(c('red', `✗ ${missingRequired.length} required schema vars not present in Vercel production:`));
      for (const name of missingRequired) console.log(`  ${c('red', '✗')} ${name}`);
      exitCode = 1;
      failCount += missingRequired.length;
    }

    console.log('');
    console.log(
      c('bold', `Summary:`) +
        ` ${c('green', `${cleanCount} clean`)}, ${c('yellow', `${warnCount} suspicious`)}, ${c('red', `${failCount} corrupted`)}, ${c('dim', `${unknownCount} not in schema`)}`,
    );

    railwayAudit();
  } catch (err) {
    console.error(c('red', `✗ unexpected error: ${err.stack || err.message}`));
    exitCode = 1;
  } finally {
    if (existsSync(AUDIT_FILE)) {
      try {
        unlinkSync(AUDIT_FILE);
      } catch {
        // best-effort
      }
    }
    process.exit(exitCode);
  }
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--schema-only')) {
    runSchemaOnly();
    return;
  }
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`Usage:
  node scripts/audit-env.mjs [--schema-only]

Modes:
  default        Pull Vercel production envs, validate against schemas/env-schema.json,
                 report ✓ clean / ⚠ suspicious / ✗ corrupted, exit 1 on any ✗.
  --schema-only  Grep every env reference and fail if any is missing from the schema.
                 Runs in CI on every PR — needs no Vercel access.

Schema:        schemas/env-schema.json
Audit file:    .env.audit (deleted on exit)
`);
    process.exit(0);
  }
  runValueAudit();
}

main();
