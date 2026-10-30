import ElekIoCore, { type SetUserProps } from '../index.node.js';
export * from '../index.node.js';

/**
 * The local User the shared test Core works with.
 * Exported so tests that create their own Core instances can reuse it.
 */
export const testUserProps: SetUserProps = {
  userType: 'local',
  id: null,
  name: 'John Doe',
  email: 'john.doe@test.com',
  language: 'en',
  localApi: {
    // Inert stored configuration, isEnabled false means it is never bound.
    // Tests that start the API bind a port from freePort() instead.
    isEnabled: false,
    port: 31310,
  },
};

const core = new ElekIoCore({
  log: {
    level: 'debug',
  },
});

await core.user.set(testUserProps);

export default core;
