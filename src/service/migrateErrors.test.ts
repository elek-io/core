import { describe, expect, it } from 'vitest';
import * as packageJson from '../../package.json' with { type: 'json' };
import core, { uuid } from '../test/setup.js';
import { CoreError } from '../util/shared.js';

/**
 * Every public `migrate` reads a file Core did not necessarily write, so it is
 * the one place a malformed file on disk reaches a consumer. It is also on
 * every read path, which is why `docs/error-handling.md` promising that all
 * services throw `CoreError` has to hold here too.
 *
 * `applyMigrations` already raises `VersionSkew` as a `CoreError`, so what is
 * asserted here is the two schema parses around it.
 */
function expectBadRequest(migrate: () => unknown) {
  let error: unknown = null;
  try {
    migrate();
  } catch (caught) {
    error = caught;
  }

  expect(error).toBeInstanceOf(CoreError);
  expect(error instanceof CoreError && error.type).toEqual('BadRequest');
  expect(error instanceof CoreError && error.cause).toBeDefined();
}

describe('Migrating a malformed file', function () {
  const coreVersion = packageJson.default.version;

  const services = [
    ['Project', (file: unknown) => core.projects.migrate(file)],
    ['Collection', (file: unknown) => core.collections.migrate(file)],
    ['Component', (file: unknown) => core.components.migrate(file)],
    ['Entry', (file: unknown) => core.entries.migrate(file)],
    ['Asset', (file: unknown) => core.assets.migrate(file)],
  ] as const;

  for (const [name, migrate] of services) {
    it(`throws a CoreError when a ${name} file is not an object`, function () {
      expectBadRequest(() => migrate('not an object'));
    });

    it(`throws a CoreError when a ${name} file is missing every key`, function () {
      expectBadRequest(() => migrate({}));
    });

    it(`throws a CoreError when a ${name} file survives migration but stays invalid`, function () {
      expectBadRequest(() => migrate({ coreVersion, id: 'not-a-uuid' }));
    });
  }

  it('keeps the VersionSkew a newer file raises', function () {
    let error: unknown = null;
    try {
      core.entries.migrate({ id: uuid(), coreVersion: '999.0.0' });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(CoreError);
    expect(error instanceof CoreError && error.type).toEqual('VersionSkew');
  });
});
