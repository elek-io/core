import { describe, expect, it } from 'vitest';
import ElekIoCore from './index.node.js';

describe.sequential('Integration', function () {
  it.sequential(
    'should be able to create a new ElekIoCore instance',
    async function () {
      const defaultCore = new ElekIoCore();
      const coreWithLogLevel = new ElekIoCore({
        log: {
          level: 'debug',
        },
      });
      const coreWithoutCache = new ElekIoCore({
        file: {
          cache: false,
        },
      });

      expect(defaultCore).to.be.instanceOf(ElekIoCore);
      expect(defaultCore.options).to.deep.equal({
        log: {
          level: 'info',
        },
        file: {
          cache: true,
        },
      });

      expect(coreWithLogLevel).to.be.instanceOf(ElekIoCore);
      expect(coreWithLogLevel.options).to.deep.equal({
        log: {
          level: 'debug',
        },
        file: {
          cache: true,
        },
      });

      expect(coreWithoutCache).to.be.instanceOf(ElekIoCore);
      expect(coreWithoutCache.options).to.deep.equal({
        log: {
          level: 'info',
        },
        file: {
          cache: false,
        },
      });
    }
  );
});
