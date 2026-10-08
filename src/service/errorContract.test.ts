import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CoreError, uuid } from '../test/setup.js';
import core from '../test/setup.js';
import {
  createCollection,
  createComponent,
  createProject,
} from '../test/util.js';

/**
 * The two promises `docs/error-handling.md` opens with, asserted rather than
 * written down: every service method fails with a `CoreError` and nothing
 * else, and an entity that is not there is `NotFound`.
 *
 * Both were prose for as long as they existed, and both had drifted. A table
 * is the point: a method added later is one row, and a row that cannot be
 * written is a method whose failure mode nobody decided.
 *
 * @see ../../contributing/error-handling-internals.md
 */

type Call = [label: string, run: () => Promise<unknown>];

let projectId = '';
let collectionId = '';
const missing = uuid();
let destroy: () => Promise<void>;

beforeAll(async function () {
  const project = await createProject();
  projectId = project.id;
  destroy = project.destroy;
  collectionId = (await createCollection(projectId)).id;
  await createComponent(projectId);
}, 120000);

afterAll(async function () {
  await destroy();
}, 60000);

/**
 * Reading something that is not there, by every route a consumer has to it.
 * The id and slug forms are both here because they used to disagree.
 */
const missingReads = (): Call[] => [
  ['Project by id', () => core.projects.read({ id: missing })],
  ['Collection by id', () => core.collections.read({ projectId, id: missing })],
  [
    'Collection by slug',
    () => core.collections.readBySlug({ projectId, slug: 'no-such-slug' }),
  ],
  ['Component by id', () => core.components.read({ projectId, id: missing })],
  [
    'Component by slug',
    () => core.components.readBySlug({ projectId, slug: 'no-such-slug' }),
  ],
  [
    'Entry by id',
    () => core.entries.read({ projectId, collectionId, id: missing }),
  ],
  ['Asset by id', () => core.assets.read({ projectId, id: missing })],
  [
    'Entries of a Collection that does not exist',
    () => core.entries.list({ projectId, collectionId: missing, limit: 0 }),
  ],
  [
    'Entry count of a Collection that does not exist',
    () => core.entries.count({ projectId, collectionId: missing }),
  ],
  [
    'Collections of a Project that does not exist',
    () => core.collections.list({ projectId: missing, limit: 0 }),
  ],
  [
    'Components of a Project that does not exist',
    () => core.components.list({ projectId: missing, limit: 0 }),
  ],
  [
    'Assets of a Project that does not exist',
    () => core.assets.list({ projectId: missing, limit: 0 }),
  ],
];

/**
 * Calls that must fail for some other reason, so the envelope is checked
 * where the failure is not a missing entity. The two-stage parse is the one
 * that let a raw error out: the reads between the pre-parse and `mutating()`
 * sit outside every boundary.
 */
const otherFailures = (): Call[] => [
  [
    'creating an Entry in a Project that does not exist',
    () =>
      core.entries.create({
        projectId: missing,
        collectionId: missing,
        values: {},
      }),
  ],
  [
    'creating an Entry in a Collection that does not exist',
    () => core.entries.create({ projectId, collectionId: missing, values: {} }),
  ],
  [
    'creating a Collection in a Project that does not exist',
    () =>
      core.collections.create({
        projectId: missing,
        icon: 'home',
        name: { singular: { en: 'a' }, plural: { en: 'a' } },
        slug: { singular: 'a', plural: 'aa' },
        description: { en: 'a' },
        fieldDefinitions: [],
      }),
  ],
  [
    'creating a Component in a Project that does not exist',
    () =>
      core.components.create({
        projectId: missing,
        name: { en: 'a' },
        slug: 'aa',
        description: { en: 'a' },
        fieldDefinitions: [],
      }),
  ],
  [
    'creating an Asset in a Project that does not exist',
    () =>
      core.assets.create({
        projectId: missing,
        filePath: 'src/test/data/150x150.png',
        name: 'a',
        description: 'a',
      }),
  ],
  [
    'updating an Entry that does not exist',
    () =>
      core.entries.update({
        projectId,
        collectionId,
        id: missing,
        values: {},
      }),
  ],
  [
    'deleting an Entry that does not exist',
    () => core.entries.delete({ projectId, collectionId, id: missing }),
  ],
  [
    'deleting a Collection that does not exist',
    () => core.collections.delete({ projectId, id: missing }),
  ],
  [
    'deleting a Component that does not exist',
    () => core.components.delete({ projectId, id: missing }),
  ],
  [
    'deleting an Asset that does not exist',
    () => core.assets.delete({ projectId, id: missing, extension: 'png' }),
  ],
  [
    'an Entry missing the values its Collection requires',
    () =>
      core.entries.create({
        projectId,
        collectionId,
        values: {},
      }),
  ],
  [
    'a Project id that is not a UUID',
    () => core.collections.list({ projectId: 'not-a-uuid', limit: 0 }),
  ],
  [
    'releasing a Project that does not exist',
    () => core.releases.create({ projectId: missing }),
  ],
  [
    'upgrading a Project that does not exist',
    () => core.projects.upgrade({ id: missing, force: true }),
  ],
  [
    'synchronizing a Project that does not exist',
    () => core.projects.synchronize({ id: missing }),
  ],
  [
    'deleting a Project that does not exist',
    () => core.projects.delete({ id: missing, force: true }),
  ],
];

async function rejection(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  return new Error('the call resolved, so there is no failure to check');
}

describe('every service method fails with a CoreError', function () {
  it.each([...missingReads(), ...otherFailures()])(
    '%s',
    async function (_label, run) {
      expect(await rejection(run)).toBeInstanceOf(CoreError);
    },
    30000
  );
});

describe('an entity that is not there is NotFound', function () {
  it.each(missingReads())(
    '%s',
    async function (_label, run) {
      const error = await rejection(run);
      expect(error).toBeInstanceOf(CoreError);
      expect((error as CoreError).type).toEqual('NotFound');
      expect((error as CoreError).statusCode).toEqual(404);
    },
    30000
  );
});
