import { coverageConfigDefaults, defineConfig } from 'vitest/config';
import { hookTimeoutMs, testTimeoutMs } from './src/test/budgets.js';

export default defineConfig({
  test: {
    // Both are the slowest runner's measured duration of what they bound times
    // one multiple, so no test and no hook needs a budget of its own and a
    // slow runner fails on a named test, see contributing/testing.md
    testTimeout: testTimeoutMs,
    hookTimeout: hookTimeoutMs,
    // Drops the console output of passing tests and keeps that of failing
    // ones. The shared test Core logs at debug, which otherwise buries a
    // failure at the end of the CI log, see contributing/testing.md
    silent: 'passed-only',
    // Gives each test file its own data directory, which is what allows
    // files to run in parallel, see contributing/testing.md
    setupFiles: ['./src/test/workerSetup.ts'],
    globalSetup: './src/test/globalSetup.ts',
    coverage: {
      reporter: ['text', 'lcov'],
      exclude: [
        ...coverageConfigDefaults.exclude, // keep Vitest defaults (test files, node_modules, etc.)
        'dist/**', // build output
        '**/package.json',
        'tsdown.config.*',
        'vitest.config.*',
        // Pure re-export barrels (no logic, only `export * from`)
        'src/schema/index.ts',
        'src/service/index.ts',
        'src/service/migrations/index.ts',
        'src/cli/index.ts',
        'src/index.browser.ts', // re-exports + one `type` re-export only
      ],
    },
  },
});
