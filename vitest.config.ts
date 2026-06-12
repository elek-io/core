import { coverageConfigDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Tests currently can not run in parallel, since some tests
    // are getting the total number of Projects, Assets etc.
    // which fails depending on the timing they are run (race condition).
    fileParallelism: false,
    // Git-heavy tests need ~3s on fast runners but 7s+ on the slow
    // Windows and Intel macOS runners, see docs/testing.md
    testTimeout: 15000,
    globalSetup: './src/test/globalSetup.ts',
    coverage: {
      reporter: ['text', 'lcov'],
      exclude: [
        ...coverageConfigDefaults.exclude, // keep Vitest defaults (test files, node_modules, etc.)
        'dist/**', // build output
        '**/package.json',
        'eslint.config.*',
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
