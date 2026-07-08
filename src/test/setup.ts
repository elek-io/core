import ElekIoCore, { type SetUserProps } from '../index.node.js';
import { workerApiPort } from './worker.js';
export * from '../index.node.js';

/**
 * The local User the shared test Core works with.
 * Exported so tests that create their own Core instances can reuse it.
 */
export const testUserProps: SetUserProps = {
  userType: 'local',
  name: 'John Doe',
  email: 'john.doe@test.com',
  language: 'en',
  localApi: {
    // Inert stored configuration, isEnabled false means it is never bound.
    // Tests that start the API bind testApiPort instead.
    isEnabled: false,
    port: 31310,
  },
};

/**
 * Port the shared Core's local API binds during tests.
 * Unique per vitest worker, so test files running in parallel never collide.
 */
export const testApiPort = workerApiPort(process.env['VITEST_POOL_ID']);

const core = new ElekIoCore({
  log: {
    level: 'debug',
  },
});

await core.user.set(testUserProps);

export default core;
