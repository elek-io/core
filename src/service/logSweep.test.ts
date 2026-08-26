import Fs from 'fs-extra';
import Os from 'node:os';
import Path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestApi } from '../api/lib/util.js';
import apiRoutes from '../api/routes/index.js';
import { logAttributeNames, logRecordSchema } from '../schema/logSchema.js';
import core, { uuid } from '../test/setup.js';

/**
 * The broad pass over Core: create, update, delete, release, upgrade and
 * synchronize, with a string nothing else in the suite produces in every
 * place a User types one. Two invariants are checked against the log
 * files it leaves behind.
 *
 * A sentinel test is a scanner and cannot prove absence, but it catches
 * the call sites added after the ones that were reviewed, which is the
 * failure mode review does not. See contributing/logging.md.
 */
const sentinel = {
  project: 'zqx-canary-3e90b2-project',
  collection: 'zqx-canary-3e90b2-collection',
  component: 'zqx-canary-3e90b2-component',
  asset: 'zqx-canary-3e90b2-asset',
  assetFile: 'zqx-canary-3e90b2-filename',
  value: 'zqx-canary-3e90b2-value',
  updatedValue: 'zqx-canary-3e90b2-updated-value',
  collectionSlugSingular: 'zqx-canary-3e90b2-singularslug',
  collectionSlugPlural: 'zqx-canary-3e90b2-pluralslug',
  componentSlug: 'zqx-canary-3e90b2-heroslug',
  queryParameter: 'zqx-canary-3e90b2-query',
  unmatchedPath: 'zqx-canary-3e90b2-path',
  entrySlugValue: 'zqx-canary-3e90b2-entryslug',
  // What `slug()` makes of `nonCanonicalSlugInput`, which is the form the
  // rejection message names and therefore the form that can leak
  canonicalSlugValue: 'zqx-canary-3e90b2-badslug',
};

/** Rejected by a slug field, which answers with the canonical form */
const nonCanonicalSlugInput = 'zqx canary 3e90b2 badslug';

/**
 * A field definition's slug is not a sentinel, on purpose. It names a
 * position in the content model rather than an object, which is why
 * `contributing/logging.md` allows one and `elek.entry.value.slugs`
 * carries them. An entity slug names an object that has an id, so it
 * is banned like the name it was made from.
 */
const titleSlug = 'title';
const permalinkSlug = 'permalink';

beforeAll(async function () {
  const project = await core.projects.create({
    name: sentinel.project,
    description: sentinel.project,
    settings: { language: { default: 'en', supported: ['en'] } },
  });
  const projectId = project.id;
  const projectPath = core.util.pathTo.project(projectId);

  const collection = await core.collections.create({
    projectId,
    icon: 'home',
    name: {
      singular: { en: sentinel.collection },
      plural: { en: sentinel.collection },
    },
    slug: {
      singular: sentinel.collectionSlugSingular,
      plural: sentinel.collectionSlugPlural,
    },
    description: { en: sentinel.collection },
    fieldDefinitions: [
      {
        id: uuid(),
        slug: titleSlug,
        valueType: 'string',
        label: { en: 'Title' },
        description: { en: 'The title' },
        fieldType: 'text',
        inputWidth: '12',
        isDisabled: false,
        isRequired: true,
        isUnique: false,
        min: null,
        max: 200,
        defaultValue: null,
      },
      {
        id: uuid(),
        slug: permalinkSlug,
        valueType: 'string',
        label: { en: 'Permalink' },
        description: null,
        fieldType: 'slug',
        inputWidth: '12',
        isDisabled: false,
        isRequired: true,
        isUnique: true,
        defaultValue: null,
        separator: '-',
        lowercase: true,
        decamelize: true,
        ofFieldDefinitions: [],
      },
    ],
  });

  const component = await core.components.create({
    projectId,
    name: { en: sentinel.component },
    slug: sentinel.componentSlug,
    description: { en: sentinel.component },
    fieldDefinitions: [
      {
        id: uuid(),
        slug: 'headline',
        valueType: 'string',
        label: { en: 'Headline' },
        description: null,
        fieldType: 'text',
        inputWidth: '12',
        isDisabled: false,
        isRequired: false,
        isUnique: false,
        min: null,
        max: null,
        defaultValue: null,
      },
    ],
  });

  // A file the User named, so the name reaches Core as a path it reads
  const assetDir = Path.join(Os.tmpdir(), `elek-io-core-sweep-${uuid()}`);
  const assetFilePath = Path.join(assetDir, `${sentinel.assetFile}.png`);
  await Fs.mkdirp(assetDir);
  await Fs.copyFile(Path.resolve('src/test/data/150x150.png'), assetFilePath);
  const asset = await core.assets.create({
    projectId,
    filePath: assetFilePath,
    name: sentinel.asset,
    description: sentinel.asset,
  });

  const entry = await core.entries.create({
    projectId,
    collectionId: collection.id,
    values: {
      [titleSlug]: {
        objectType: 'value',
        valueType: 'string',
        content: { en: sentinel.value },
      },
      [permalinkSlug]: {
        objectType: 'value',
        valueType: 'string',
        content: { en: sentinel.entrySlugValue },
      },
    },
  });

  await core.entries.update({
    projectId,
    collectionId: collection.id,
    id: entry.id,
    values: {
      [titleSlug]: {
        objectType: 'value',
        valueType: 'string',
        content: { en: sentinel.updatedValue },
      },
      [permalinkSlug]: {
        objectType: 'value',
        valueType: 'string',
        content: { en: sentinel.entrySlugValue },
      },
    },
  });
  await core.collections.update({
    ...collection,
    projectId,
    description: { en: sentinel.collection },
  });
  await core.components.update({ ...component, projectId });
  await core.assets.update({
    projectId,
    id: asset.id,
    name: sentinel.asset,
    description: sentinel.asset,
  });

  // Every route of the local API, which logs a record per request and
  // per response. Nothing else in the suite drives it with a sentinel in
  // the path, and the request logger is the surface that used to write
  // the URL, so a slug in it reached the log file on a 200
  await sweepApi(projectId, collection.id, entry.id, asset.id);

  await core.releases.createPreview({ projectId });
  await core.releases.create({ projectId });

  // Runs the whole upgrade path over every entity file, which is where
  // whole entity bodies used to be logged
  await core.projects.upgrade({ id: projectId, force: true });

  // A local bare repository stands in for a remote, so the synchronize
  // path runs with everything it logs
  const remotePath = Path.join(core.util.pathTo.tmp, uuid());
  await core.git.clone(projectPath, remotePath, { bare: true });
  await core.git.remotes.addOrigin(projectPath, remotePath);
  await core.projects.synchronize({ id: projectId });

  // A failure at a service boundary, so the error path is in the file too
  await expect(
    core.entries.read({ projectId, collectionId: collection.id, id: 'nope' })
  ).rejects.toThrow();

  // The rejections that answer with the caller's own string. Each one builds
  // a `CoreError` message a human reads, and the service boundary logs that
  // message, so the two audiences meet in one string
  await expect(
    core.collections.create({
      ...collection,
      projectId,
      slug: {
        singular: 'other',
        // The slug already in use, so the Conflict names it
        plural: sentinel.collectionSlugPlural,
      },
    })
  ).rejects.toThrow();
  await expect(
    core.components.create({
      ...component,
      projectId,
      slug: sentinel.componentSlug,
    })
  ).rejects.toThrow();
  await expect(
    core.entries.create({
      projectId,
      collectionId: collection.id,
      values: {
        [titleSlug]: {
          objectType: 'value',
          valueType: 'string',
          content: { en: sentinel.value },
        },
        // Rejected with the canonical form of what was sent, which is
        // `slug()` of an authored Value
        [permalinkSlug]: {
          objectType: 'value',
          valueType: 'string',
          content: { en: nonCanonicalSlugInput },
        },
      },
    })
  ).rejects.toThrow();
  const unsupportedPath = Path.join(
    assetDir,
    `${sentinel.assetFile}.zzzunknown`
  );
  await Fs.writeFile(unsupportedPath, 'not a supported type');
  await expect(
    core.assets.create({
      projectId,
      filePath: unsupportedPath,
      name: sentinel.asset,
      description: sentinel.asset,
    })
  ).rejects.toThrow();

  await core.entries.delete({
    projectId,
    collectionId: collection.id,
    id: entry.id,
  });
  await core.assets.delete({
    projectId,
    id: asset.id,
    extension: asset.extension,
  });
  await core.components.delete({ projectId, id: component.id });
  await core.collections.delete({ projectId, id: collection.id });
  await core.projects.delete({ id: projectId, force: true });
  await Fs.remove(remotePath);
  await Fs.remove(assetDir);
}, 180000);

describe('nothing a User typed reaches a log file', function () {
  it.each(Object.entries(sentinel))(
    'keeps the %s out of it',
    async function (_place, value) {
      expect(await readLogs()).not.toContain(value);
    }
  );
});

describe('every attribute is a name Core declared', function () {
  it('does not declare url.full, which cannot hold a URL safely', function () {
    // The Semantic Convention name for a full URL is the obvious reach for
    // an HTTP logger and it is the leak: a path carries a slug and a query
    // string carries whatever a caller sent. `http.route` replaced it
    expect(logAttributeNames).not.toContain('url.full');
  });

  it('writes no attribute key that logSchema does not name', async function () {
    // `LogProps` already rejects an undeclared name at the call site. This
    // is the backstop for the paths a type cannot see: an object built
    // into a variable, or attributes handed through another type
    const declared = new Set<string>(logAttributeNames);
    const written = new Set<string>();
    for (const record of await readRecords()) {
      for (const key of Object.keys(record.attributes ?? {})) {
        written.add(key);
      }
    }

    expect(written.size).toBeGreaterThan(0);
    expect([...written].filter((key) => !declared.has(key))).toEqual([]);
  });
});

/**
 * Sends one request to every route, plus an undeclared query parameter and
 * a path that matches no route, which are the two ways a caller reaches the
 * request logger with a string of its own choosing.
 */
async function sweepApi(
  projectId: string,
  collectionId: string,
  entryId: string,
  assetId: string
): Promise<void> {
  const api = createTestApi(
    apiRoutes,
    core.logger,
    core.projects,
    core.collections,
    core.components,
    core.entries,
    core.assets
  );
  const project = `/content/v1/projects/${projectId}`;
  // Addressed by slug wherever a route accepts one, since that is the form
  // that carries a User's text
  const collection = `${project}/collections/${sentinel.collectionSlugPlural}`;

  const paths = [
    '/content/v1/projects',
    '/content/v1/projects/count',
    project,
    `${project}/collections`,
    `${project}/collections/count`,
    collection,
    `${project}/collections/${collectionId}`,
    `${project}/components`,
    `${project}/components/count`,
    `${project}/components/${sentinel.componentSlug}`,
    `${collection}/entries`,
    `${collection}/entries/count`,
    `${collection}/entries/${entryId}`,
    `${project}/assets`,
    `${project}/assets/count`,
    `${project}/assets/${assetId}`,
    `${project}/collections?limit=1&q=${sentinel.queryParameter}`,
    `${project}/${sentinel.unmatchedPath}`,
  ];

  for (const path of paths) {
    await api.request(path);
  }
}

async function readLogs(): Promise<string> {
  const dir = core.util.pathTo.logs;
  if (!(await Fs.pathExists(dir))) {
    return '';
  }
  const names = await Fs.readdir(dir);
  const contents = await Promise.all(
    names
      .filter((name) => name.endsWith('.log'))
      .map((name) => Fs.readFile(Path.join(dir, name), 'utf8'))
  );
  return contents.join('\n');
}

/**
 * Every record in this worker's log files, so the check covers the call
 * sites of every test file that shares the data directory, not only the
 * ones this file exercises
 */
async function readRecords() {
  return (await readLogs())
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line): unknown => JSON.parse(line))
    .map((line) => logRecordSchema.parse(line));
}
