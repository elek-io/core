import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    poolOptions: {
      forks: {
        // Tests currently cannot run in parallel, since some tests
        // are getting the total number of Projects, Assets etc.
        // which fails depending on the timing they are run (race condition).
        singleFork: true,
      },
    },
    coverage: {
      reporter: ['text', 'lcov'],
    },
  },
});
