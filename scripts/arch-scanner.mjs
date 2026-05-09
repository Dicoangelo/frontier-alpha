#!/usr/bin/env node
/**
 * scripts/arch-scanner.mjs
 *
 * Walks the repo and emits `schemas/arch.json` — a machine-checkable
 * fingerprint of the codebase. Used by US-001 (v1.3.0 PRD) to keep
 * ARCHITECTURE.md from drifting silently.
 *
 * Modes:
 *   default                  → write schemas/arch.json
 *   --check                  → re-scan; exit 1 if HEAD differs from
 *                              committed schemas/arch.json by > 5% on
 *                              any numeric metric
 *
 * Source of truth: direct file inspection. No prose. No assumptions.
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const ARCH_JSON = join(REPO_ROOT, 'schemas', 'arch.json');
const DRIFT_THRESHOLD = 0.05; // 5%

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

function gitHead() {
  try {
    return execSync('git rev-parse HEAD', { cwd: REPO_ROOT, encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

function packageVersion() {
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf-8'));
  return pkg.version;
}

function countMatches(filePath, pattern) {
  try {
    const src = readFileSync(filePath, 'utf-8');
    const matches = src.match(pattern);
    return matches ? matches.length : 0;
  } catch {
    return 0;
  }
}

function scanRoutes() {
  const routesDir = join(REPO_ROOT, 'src', 'routes');
  if (!existsSync(routesDir)) return { modules: [], totalEndpoints: 0 };

  const files = readdirSync(routesDir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .sort();

  const modules = files.map((f) => {
    const full = join(routesDir, f);
    const endpoints = countMatches(full, /fastify\.(get|post|put|delete|patch)\b/g);
    return { module: f, endpoints };
  });

  const totalEndpoints = modules.reduce((sum, m) => sum + m.endpoints, 0);
  return { modules, totalEndpoints };
}

function scanIntegrations() {
  const healthFile = join(REPO_ROOT, 'src', 'routes', 'health.ts');
  if (!existsSync(healthFile)) return [];
  const src = readFileSync(healthFile, 'utf-8');
  // Match `integrations.<name>` assignments
  const seen = new Set();
  const re = /integrations\.([a-zA-Z_]+)\s*=/g;
  let m;
  while ((m = re.exec(src))) {
    seen.add(m[1]);
  }
  return [...seen].sort();
}

function scanMigrations() {
  const dir = join(REPO_ROOT, 'supabase', 'migrations');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

function scanClient() {
  const pagesDir = join(REPO_ROOT, 'client', 'src', 'pages');
  const componentsDir = join(REPO_ROOT, 'client', 'src', 'components');
  const storesDir = join(REPO_ROOT, 'client', 'src', 'stores');
  const hooksDir = join(REPO_ROOT, 'client', 'src', 'hooks');
  const apiDir = join(REPO_ROOT, 'client', 'src', 'api');

  const isTsx = (f) => f.endsWith('.tsx') && !f.endsWith('.test.tsx') && !f.endsWith('.stories.tsx');
  const isTs = (f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.d.ts');

  const pages = existsSync(pagesDir)
    ? readdirSync(pagesDir).filter(isTsx).sort()
    : [];

  const components = walk(componentsDir, (p) => isTsx(p));
  const stores = existsSync(storesDir)
    ? readdirSync(storesDir).filter(isTs).sort()
    : [];
  const hooks = existsSync(hooksDir)
    ? readdirSync(hooksDir).filter(isTs).sort()
    : [];
  const apiModules = existsSync(apiDir)
    ? readdirSync(apiDir).filter(isTs).sort()
    : [];

  return {
    pages: pages.length,
    pageList: pages.map((p) => p.replace(/\.tsx$/, '')),
    components: components.length,
    stores: stores.length,
    storeList: stores.map((s) => s.replace(/\.ts$/, '')),
    hooks: hooks.length,
    hookList: hooks.map((h) => h.replace(/\.ts$/, '')),
    apiModules: apiModules.length,
    apiList: apiModules.map((a) => a.replace(/\.ts$/, '')),
  };
}

function scanRoutesInClient() {
  const appFile = join(REPO_ROOT, 'client', 'src', 'App.tsx');
  if (!existsSync(appFile)) return { count: 0, paths: [] };
  const src = readFileSync(appFile, 'utf-8');
  const paths = [];
  const re = /<Route\s+[^>]*?path=["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(src))) {
    paths.push(m[1]);
  }
  return { count: paths.length, paths: paths.sort() };
}

function scanServer() {
  const srcDir = join(REPO_ROOT, 'src');
  const tsFiles = walk(srcDir, (p) => p.endsWith('.ts'));
  const tsNonTest = tsFiles.filter((p) => !p.endsWith('.test.ts'));
  const testFiles = tsFiles.filter((p) => p.endsWith('.test.ts'));
  return {
    tsFiles: tsFiles.length,
    tsNonTestFiles: tsNonTest.length,
    inSourceTestFiles: testFiles.length,
  };
}

function scanTests() {
  const testsDir = join(REPO_ROOT, 'tests');
  const files = walk(testsDir, (p) => p.endsWith('.test.ts'));
  // Exclude graveyard
  return files.filter((p) => !p.includes('.graveyard')).length;
}

function scanVercelApi() {
  const apiDir = join(REPO_ROOT, 'api');
  const files = walk(apiDir, (p) => p.endsWith('.ts'));
  return files.length;
}

function build() {
  const server = scanServer();
  const routes = scanRoutes();
  const migrations = scanMigrations();
  const integrations = scanIntegrations();
  const client = scanClient();
  const clientRoutes = scanRoutesInClient();
  const vercelApi = scanVercelApi();
  const testFiles = scanTests();

  return {
    generatedAt: new Date().toISOString(),
    headSha: gitHead(),
    version: packageVersion(),
    server: {
      tsFiles: server.tsFiles,
      tsNonTestFiles: server.tsNonTestFiles,
      inSourceTestFiles: server.inSourceTestFiles,
      routeModules: routes.modules.length,
      endpoints: routes.totalEndpoints,
      migrations: migrations.length,
      vercelApiFiles: vercelApi,
      testFiles,
    },
    client: {
      pages: client.pages,
      components: client.components,
      stores: client.stores,
      hooks: client.hooks,
      apiModules: client.apiModules,
      appRoutes: clientRoutes.count,
    },
    integrations,
    routes: routes.modules,
    migrations,
    pages: client.pageList,
    appRoutePaths: clientRoutes.paths,
    stores: client.storeList,
    hooks: client.hookList,
    apiModulesList: client.apiList,
  };
}

function flattenNumeric(obj, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'number') {
      out[key] = v;
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flattenNumeric(v, key));
    }
  }
  return out;
}

function diffMetrics(committed, fresh) {
  const c1 = flattenNumeric(committed);
  const c2 = flattenNumeric(fresh);
  const allKeys = new Set([...Object.keys(c1), ...Object.keys(c2)]);
  const drifts = [];
  for (const k of allKeys) {
    const a = c1[k] ?? 0;
    const b = c2[k] ?? 0;
    if (a === 0 && b === 0) continue;
    const denom = Math.max(Math.abs(a), 1);
    const ratio = Math.abs(b - a) / denom;
    if (ratio > DRIFT_THRESHOLD || (a === 0 && b > 0) || (b === 0 && a > 0)) {
      drifts.push({ metric: k, committed: a, head: b, deltaPct: (ratio * 100).toFixed(1) });
    }
  }
  return drifts;
}

function compareIntegrations(committed, fresh) {
  const a = new Set(committed.integrations || []);
  const b = new Set(fresh.integrations || []);
  const added = [...b].filter((x) => !a.has(x));
  const removed = [...a].filter((x) => !b.has(x));
  return { added, removed };
}

function compareRouteList(committed, fresh) {
  const a = new Map((committed.routes || []).map((r) => [r.module, r.endpoints]));
  const b = new Map((fresh.routes || []).map((r) => [r.module, r.endpoints]));
  const all = new Set([...a.keys(), ...b.keys()]);
  const changes = [];
  for (const mod of all) {
    const av = a.get(mod);
    const bv = b.get(mod);
    if (av === undefined) changes.push({ module: mod, change: 'added', endpoints: bv });
    else if (bv === undefined) changes.push({ module: mod, change: 'removed', endpoints: av });
    else if (av !== bv) changes.push({ module: mod, change: 'modified', committed: av, head: bv });
  }
  return changes;
}

function main() {
  const checkMode = process.argv.includes('--check');

  const fresh = build();

  if (!checkMode) {
    writeFileSync(ARCH_JSON, JSON.stringify(fresh, null, 2) + '\n');
    console.log(c('green', `✓ wrote ${relative(REPO_ROOT, ARCH_JSON)}`));
    console.log(c('dim', `  version=${fresh.version} routes=${fresh.server.routeModules} endpoints=${fresh.server.endpoints} pages=${fresh.client.pages} migrations=${fresh.server.migrations} integrations=${fresh.integrations.length}`));
    return;
  }

  // --check mode
  if (!existsSync(ARCH_JSON)) {
    console.error(c('red', `✗ ${relative(REPO_ROOT, ARCH_JSON)} does not exist.`));
    console.error(c('dim', `  Generate it via: node scripts/arch-scanner.mjs`));
    process.exit(1);
  }

  let committed;
  try {
    committed = JSON.parse(readFileSync(ARCH_JSON, 'utf-8'));
  } catch (err) {
    console.error(c('red', `✗ failed to parse ${relative(REPO_ROOT, ARCH_JSON)}: ${err.message}`));
    process.exit(1);
  }

  const drifts = diffMetrics(committed, fresh);
  const integrationDelta = compareIntegrations(committed, fresh);
  const routeDelta = compareRouteList(committed, fresh);

  const hasDrift =
    drifts.length > 0 ||
    integrationDelta.added.length > 0 ||
    integrationDelta.removed.length > 0 ||
    routeDelta.length > 0;

  if (!hasDrift) {
    console.log(c('green', `✓ schemas/arch.json matches HEAD (no drift > ${DRIFT_THRESHOLD * 100}%)`));
    console.log(c('dim', `  version=${fresh.version} routes=${fresh.server.routeModules} endpoints=${fresh.server.endpoints} pages=${fresh.client.pages}`));
    process.exit(0);
  }

  console.error(c('red', `✗ schemas/arch.json drift detected`));
  console.error(c('dim', '  Regenerate via: node scripts/arch-scanner.mjs'));
  console.error('');

  if (drifts.length) {
    console.error(c('bold', 'Numeric metric drift:'));
    for (const d of drifts) {
      console.error(
        `  ${c('yellow', d.metric)}: committed=${c('cyan', d.committed)} head=${c('cyan', d.head)} delta=${c('red', d.deltaPct + '%')}`,
      );
    }
    console.error('');
  }
  if (integrationDelta.added.length || integrationDelta.removed.length) {
    console.error(c('bold', 'Integration list drift:'));
    for (const i of integrationDelta.added) console.error(`  ${c('green', '+ ' + i)}`);
    for (const i of integrationDelta.removed) console.error(`  ${c('red', '- ' + i)}`);
    console.error('');
  }
  if (routeDelta.length) {
    console.error(c('bold', 'Route module drift:'));
    for (const r of routeDelta) {
      if (r.change === 'added') console.error(`  ${c('green', '+ ' + r.module)} (${r.endpoints} endpoints)`);
      else if (r.change === 'removed') console.error(`  ${c('red', '- ' + r.module)} (${r.endpoints} endpoints)`);
      else
        console.error(
          `  ${c('yellow', '~ ' + r.module)}: ${r.committed} → ${r.head} endpoints`,
        );
    }
    console.error('');
  }
  process.exit(1);
}

main();
