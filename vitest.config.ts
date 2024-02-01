import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    poolOptions: {
      threads: {
        minThreads: 1,
        maxThreads: 1, // Core tests cannot run in parallel because it CRUD files on disk
      },
    },
    coverage: {
      reporter: ['text', 'lcov'],
    },
  },
});
