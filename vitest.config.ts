import { coverageConfigDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Git-heavy tests need ~3s on fast runners but 7s+ on the slow
    // Windows and Intel macOS runners, and parallel test files add CPU
    // contention on top, see contributing/testing.md
    testTimeout: 15000,
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
