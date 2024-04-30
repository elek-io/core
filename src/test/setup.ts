import ElekIoCore from '../index.js';
export * from '../index.js';

const core = new ElekIoCore();
await core.user.set({
  userType: 'local',
  name: 'John Doe',
  email: 'john.doe@test.com',
  language: 'en',
});

export default core;
