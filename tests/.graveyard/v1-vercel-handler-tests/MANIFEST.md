# Archive: v1 Vercel Handler Tests

Archived 2026-05-08 as part of the v1.2.5 quality sweep. These tests were
written against the pre-v1.2.0 architecture where each Vercel function
lived as a standalone `api/v1/cvrf/beliefs/*.ts` handler. The v1.2.0
API unification (commit `4e04157`) collapsed all 27 Vercel-only handlers
into Fastify route plugins under `src/routes/`, so the import paths these
tests depend on no longer exist.

## Why archived, not deleted

Per `~/.local-notes/rules/dead-code-policy.md`. The test patterns here are
useful as reference if we ever need to re-derive Vercel-handler-shape
contract tests. The actual CVRF business logic still has coverage:

- `src/cvrf/PersistentCVRFManager.ts` → `tests/services/`
- `src/cvrf/EpisodeManager.ts` → `tests/services/`
- `src/routes/cvrf.ts` → covered by `tests/unit/smoke-critical-flows`
  patterns (also archived; rewrite for Fastify when needed)

## Files

| File | Lines | What it tested |
|------|-------|---------------|
| `cvrf-beliefs-state.test.ts` | 9 tests | GET handlers for current / timeline / correlations beliefs endpoints |
| `cvrf-episodes-pagination.test.ts` | ~5 tests | GET handler pagination on the episodes endpoint |
| `zod-validation.test.ts` | ~3 tests | Zod input validation against the old portfolio/positions handler |
| `smoke-critical-flows.test.ts` | ~2 tests | Cross-handler smoke flows |

## How to recover

If you decide to re-derive these tests for the Fastify-routed surface:

```typescript
import { buildApp } from '../../src/app.js';

const app = await buildApp({ /* mocked deps */ });
const res = await app.inject({ method: 'GET', url: '/api/v1/cvrf/beliefs' });
expect(res.statusCode).toBe(200);
```

Or just `mv` the files back to `tests/unit/` and rewrite the imports.
