import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Test environment
    environment: 'node',

    // Include patterns
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],

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
