import { describe, expect, it } from 'vitest';
import { LogService } from './LogService.js';
import type { ElekIoCoreOptions } from '../schema/index.js';

const options: ElekIoCoreOptions = {
  log: { level: 'debug' },
  file: { cache: true },
};

// Other test files share this worker process, so assert on deltas, not
// absolute process listener counts.
describe('LogService teardown', function () {
  it('returns process listeners to baseline after create + close', async function () {
    const baseUncaught = process.listenerCount('uncaughtException');
    const baseUnhandled = process.listenerCount('unhandledRejection');

    const log = new LogService(options);
    expect(process.listenerCount('uncaughtException')).toBe(baseUncaught + 1);
    expect(process.listenerCount('unhandledRejection')).toBe(baseUnhandled + 1);

    await log.close();
    expect(process.listenerCount('uncaughtException')).toBe(baseUncaught);
    expect(process.listenerCount('unhandledRejection')).toBe(baseUnhandled);
  });

  it('does not accumulate listeners across many create / close cycles', async function () {
    const baseUncaught = process.listenerCount('uncaughtException');
    const baseUnhandled = process.listenerCount('unhandledRejection');

    for (let i = 0; i < 15; i++) {
      const log = new LogService(options);
      await log.close();
    }

    expect(process.listenerCount('uncaughtException')).toBe(baseUncaught);
    expect(process.listenerCount('unhandledRejection')).toBe(baseUnhandled);
  });
});
