import Fs from 'fs-extra';
import Os from 'node:os';
import Path from 'node:path';
import { describe, expect, it } from 'vitest';
import ElekIoCore from '../index.node.js';
import type { SetUserProps } from '../schema/userSchema.js';
import { uuid } from '../util/shared.js';

/**
 * A Project that lives deep enough for the paths Core builds to pass the
 * 260 characters Windows resolves a path against.
 *
 * Only Windows has that limit, so both cases below only exist there. The
 * first asks whether the machine can hold such a path at all, the second
 * whether git works in it. See contributing/testing.md.
 */

/** Windows is the only platform with a 260 character path limit. */
const isWindows = process.platform === 'win32';

/** What the Entry file below the data directory should measure. */
const entryFilePathLength = 340;

/** `projects/<uuid>/collections/<uuid>/<uuid>.json`, with its separators. */
const entryFileDepth = 137;

const user: SetUserProps = {
  userType: 'local',
  id: null,
  name: 'Deep Person',
  email: 'deep@example.com',
  language: 'en',
  localApi: { isEnabled: false, port: 31310 },
};

/**
 * A data directory long enough for the Entry file below it to reach
 * `entryFilePathLength`, padded with segments short enough for any
 * filesystem to take.
 */
function deepDataDir(): string {
  const segments = [Os.tmpdir(), `elek-io-core-longpaths-${uuid()}`];
  const target = entryFilePathLength - entryFileDepth;
  let path = Path.join(...segments);
  while (path.length < target) {
    const missing = target - path.length - 1;
    segments.push('d'.repeat(Math.min(Math.max(missing, 1), 32)));
    path = Path.join(...segments);
  }
  return path;
}

/** The path of an Entry file as Core would lay it out below `dataDir`. */
function entryFilePath(dataDir: string): string {
  return Path.join(
    dataDir,
    'projects',
    uuid(),
    'collections',
    uuid(),
    `${uuid()}.json`
  );
}

describe('a path past the Windows limit', function () {
  it.runIf(isWindows)(
    'can be written, read and removed by the machine itself',
    async function () {
      const dataDir = deepDataDir();
      const file = entryFilePath(dataDir);
      expect(file.length).toBeGreaterThanOrEqual(entryFilePathLength);

      await Fs.outputFile(file, '{"deep":true}\n');

      expect(await Fs.readFile(file, 'utf8')).toBe('{"deep":true}\n');

      await Fs.remove(dataDir);

      expect(await Fs.pathExists(dataDir)).toBe(false);
    },
    60000
  );
});

describe('a Project past the Windows limit', function () {
  it.runIf(isWindows)(
    'is created, committed to and read back at about 340 characters',
    async function () {
      const dataDir = deepDataDir();
      const core = new ElekIoCore({ dataDir });
      try {
        await core.user.set(user);
        const project = await core.projects.create({
          name: 'Deep',
          description: 'A Project past the Windows path limit',
          settings: { language: { default: 'en', supported: ['en'] } },
        });
        const collection = await core.collections.create({
          projectId: project.id,
          icon: 'home',
          name: { singular: { en: 'Page' }, plural: { en: 'Pages' } },
          slug: { singular: 'page', plural: 'pages' },
          description: { en: 'A page' },
          fieldDefinitions: [
            {
              id: uuid(),
              slug: 'title',
              valueType: 'string',
              fieldType: 'text',
              label: { en: 'Title' },
              description: null,
              defaultValue: null,
              isRequired: true,
              isDisabled: false,
              isUnique: false,
              inputWidth: '12',
              min: null,
              max: null,
            },
          ],
        });
        const entry = await core.entries.create({
          projectId: project.id,
          collectionId: collection.id,
          values: {
            title: {
              objectType: 'value',
              valueType: 'string',
              content: { en: 'Deep enough' },
            },
          },
        });

        const file = core.util.pathTo.entryFile(
          project.id,
          collection.id,
          entry.id
        );
        expect(file.length).toBeGreaterThanOrEqual(entryFilePathLength);

        // Every write commits, so a clean status is git having read the
        // whole working tree at this depth
        const status = await core.git.status(
          core.util.pathTo.project(project.id)
        );
        expect(status.files).toEqual([]);

        const read = await core.entries.read({
          projectId: project.id,
          collectionId: collection.id,
          id: entry.id,
        });
        expect(read.id).toBe(entry.id);
      } finally {
        await core.dispose();
      }

      await Fs.remove(dataDir);

      expect(await Fs.pathExists(dataDir)).toBe(false);
    },
    120000
  );
});
