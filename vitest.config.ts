import { defineConfig } from 'vitest/config';

// Integration tests live in `tests/integration/` and require a running dev
// server + seeded Supabase data. They're opt-in via `INTEGRATION=true` so
// the default `npm test` stays fast and deterministic. See US-007 in
// `tasks/prd-v1.3.0-reliability-wave.md` and `tests/integration/auth-helper.ts`.
const INTEGRATION_ENABLED = process.env.INTEGRATION === 'true';

export default defineConfig({
  test: {
    // Test environment
    environment: 'node',

    // Include patterns
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],

    // Exclude paths — `.graveyard/` holds archived tests for tests written
    // against pre-v1.2.0 handler shapes that were unified into Fastify routes.
    // See tests/.graveyard/*/MANIFEST.md per dead-code-policy.
    // `tests/integration/**` is excluded unless INTEGRATION=true (US-007).
    exclude: [
      '**/node_modules/**',
      '**/.graveyard/**',
      'tests/.graveyard/**',
      ...(INTEGRATION_ENABLED ? [] : ['tests/integration/**']),
    ],

    // Setup files
    setupFiles: ['./tests/setup.ts'],

    // Timeouts
    testTimeout: 30000, // 30s for E2E tests
    hookTimeout: 10000,

    // Coverage
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'src/**/*.ts',
      ],
      exclude: [
        'node_modules/**',
        'dist/**',
        'client/**',
        'tests/**',
        '**/*.d.ts',
        '**/*.test.ts',
        'src/index.ts',
        'src/components/**',
      ],
      thresholds: {
        // Core modules must maintain >80% coverage
        'src/factors/FactorEngine.ts': {
          statements: 80,
          branches: 60,
          functions: 80,
        },
        'src/optimizer/PortfolioOptimizer.ts': {
          statements: 80,
          branches: 60,
          functions: 80,
        },
        'src/earnings/EarningsOracle.ts': {
          statements: 80,
          branches: 60,
          functions: 80,
        },
      },
    },

    // Reporter
    reporters: ['verbose'],

    // Parallel execution
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
      },
    },

    // Environment variables for tests
    env: {
      NODE_ENV: 'test',
    },

    // Global test behavior
    globals: true,
    passWithNoTests: true,
  },
});
