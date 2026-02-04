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
      exclude: [
        'node_modules/**',
        'dist/**',
        'client/**',
        'tests/**',
        '**/*.d.ts',
      ],
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
