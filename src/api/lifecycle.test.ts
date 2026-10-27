import Net from 'node:net';
import { describe, expect, it, onTestFinished } from 'vitest';
import { createTmpCore } from '../test/util.js';
import { freePort } from '../test/worker.js';

/** Whether anything answers HTTP on the given port */
async function portAnswers(port: number): Promise<boolean> {
  try {
    await fetch(`http://127.0.0.1:${port}/openapi.json`);
    return true;
  } catch {
    return false;
  }
}

/**
 * `start()` and `stop()` settle once the port is bound or released, and a
 * start that cannot bind rejects instead of throwing an uncaught `error`
 * event. Every test takes a port of its own, so nothing here passes or fails
 * because of what another run holds. See docs/local-api.md.
 */
describe('the local API lifecycle', function () {
  it('is listening once start() resolves', async function () {
    const port = await freePort();
    const { core } = createTmpCore();

    await core.api.start(port);

    expect(core.api.isRunning()).toBe(true);
    expect(await portAnswers(port)).toBe(true);
    await core.api.stop();
  });

  it('rejects a second start and still stops the first', async function () {
    const port = await freePort();
    const { core } = createTmpCore();

    const first = core.api.start(port);
    // Rejected while the first is still binding, so two starts in a row
    // cannot both get through
    await expect(core.api.start(port)).rejects.toMatchObject({
      type: 'PreconditionFailed',
    });
    await first;
    await expect(core.api.start(port)).rejects.toMatchObject({
      type: 'PreconditionFailed',
    });

    await core.api.stop();

    expect(core.api.isRunning()).toBe(false);
    expect(await portAnswers(port)).toBe(false);
  });

  it('rejects a port another program holds', async function () {
    const port = await freePort();
    const other = Net.createServer();
    await new Promise<void>((resolve) => {
      other.listen(port, '127.0.0.1', resolve);
    });
    onTestFinished(
      () =>
        new Promise<void>((resolve) => {
          other.close(() => resolve());
        })
    );
    const { core } = createTmpCore();

    await expect(core.api.start(port)).rejects.toMatchObject({
      type: 'Conflict',
    });

    expect(core.api.isRunning()).toBe(false);
  });

  it('releases the port once stop() resolves, so a restart on it works', async function () {
    const port = await freePort();
    const { core } = createTmpCore();
    await core.api.start(port);

    await core.api.stop();
    await core.api.start(port);

    expect(core.api.isRunning()).toBe(true);
    await core.api.stop();
  });

  it('does nothing on stop() when no API was started', async function () {
    const { core } = createTmpCore();

    await expect(core.api.stop()).resolves.toBeUndefined();
  });

  it('stops a running API on dispose', async function () {
    const port = await freePort();
    const { core } = createTmpCore();
    await core.api.start(port);

    await core.dispose();

    expect(await portAnswers(port)).toBe(false);
  });
});
