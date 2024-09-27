import ElekIoCore from '../index.node.js';
export * from '../index.node.js';

const core = new ElekIoCore({
  log: {
    level: 'debug',
  },
});
await core.user.set({
  userType: 'local',
  name: 'John Doe',
  email: 'john.doe@test.com',
  language: 'en',
  window: null,
  localApi: {
    isEnabled: false,
    port: 31310,
  },
});

export default core;
