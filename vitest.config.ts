import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Tests currently can not run in parallel, since some tests
    // are getting the total number of Projects, Assets etc.
    // which fails depending on the timing they are run (race condition).
    fileParallelism: false,
    coverage: {
      reporter: ['text', 'lcov'],
    },
  },
});
