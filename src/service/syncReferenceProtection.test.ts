import Fs from 'fs-extra';
import Path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CoreError } from '../util/shared.js';
import core, {
  uuid,
  type DanglingReference,
  type Project,
  type Value,
} from '../test/setup.js';
import {
  createAsset,
  createLocalRemoteRepository,
  createMarkdownCollection,
  createMediaComponent,
  createPagesCollection,
  createProject,
  createRefCollection,
} from '../test/util.js';

/**
 * Extracts the `DanglingReference[]` from a blocked-sync `Conflict` error.
 * Returns `null` if the error isn't the expected shape.
 */
function getDanglingReferences(error: unknown): DanglingReference[] | null {
  if (!(error instanceof CoreError) || error.type !== 'Conflict') return null;
  if (!Array.isArray(error.cause)) return null;
  return error.cause as DanglingReference[];
}

/**
 * Simulates a second client sharing the same bare remote, mirroring the
 * established pattern in `GitService.test.ts`: a bare remote cannot be edited
 * directly, so copy the Core client's working copy to a fresh local path, make
 * changes there through Core (so they are real, integrity-gated commits on the
 * same branch with the same `origin`), push them to the remote, then discard the
 * copy. Used to push a diverging history the Core client must later integrate.
 *
 * `mutate` receives the copy's project id; the copied `project.json` keeps the
 * source id, but every Core operation addresses files by the path-rooted id, so
 * the copy behaves as an independent working copy of the same Project.
 */
async function pushFromOtherClient(
  sourceProjectId: string,
  mutate: (copyProjectId: string) => Promise<void>
): Promise<void> {
  const copyProjectId = uuid();
  const copyProjectPath = core.util.pathTo.project(copyProjectId);
  await Fs.copy(core.util.pathTo.project(sourceProjectId), copyProjectPath);
  await mutate(copyProjectId);
  await core.git.push(copyProjectPath);
  await Fs.remove(copyProjectPath);
}

/** An empty reference value (no targets in either language). */
function emptyRef(): Value {
  return {
    objectType: 'value',
    valueType: 'reference',
    content: { en: [], de: [] },
  };
}

/** A flat reference value pointing at a single Asset (en only). */
function assetRef(id: string): Value {
  return {
    objectType: 'value',
    valueType: 'reference',
    content: { en: [{ objectType: 'asset', id }], de: [] },
  };
}

/** A flat reference value pointing at a single Entry (en only). */
function entryRef(id: string, collectionId: string): Value {
  return {
    objectType: 'value',
    valueType: 'reference',
    content: { en: [{ objectType: 'entry', id, collectionId }], de: [] },
  };
}

/**
 * Direct, isolated tests of the forward scan `EntryService.findDanglingReferences`.
 * Each test builds a valid tree, removes a target file from disk (simulating the
 * state a rebase can integrate), and asserts the scan reports the now-broken
 * reference. The whole-tree two-client sync behaviour is covered separately.
 *
 * A fresh Project per test keeps the whole-project scan free of cross-test
 * danglers; the deliberate on-disk removal leaves an unclean tree, so these
 * tests do not assert a clean git status and rely on `destroy` for cleanup.
 */
describe('findDanglingReferences (forward scan)', function () {
  let project: Project & { destroy: () => Promise<void> };

  beforeEach(async function () {
    project = await createProject('Sync scan');
  });

  afterEach(async function () {
    await project.destroy();
  });

  it('reports a dangling flat entry reference', async function () {
    const collection = await createRefCollection(project.id);
    const target = await core.entries.create({
      projectId: project.id,
      collectionId: collection.id,
      values: { image: emptyRef(), related: emptyRef() },
    });
    const referrer = await core.entries.create({
      projectId: project.id,
      collectionId: collection.id,
      values: {
        image: emptyRef(),
        related: entryRef(target.id, collection.id),
      },
    });
    await Fs.remove(
      core.util.pathTo.entryFile(project.id, collection.id, target.id)
    );

    const danglers = await core.entries.findDanglingReferences(project.id);
    expect(danglers).toEqual([
      {
        collectionId: collection.id,
        entryId: referrer.id,
        fieldSlug: 'related',
        via: 'reference',
        componentPath: [],
        targetKind: 'entry',
        targetId: target.id,
        targetCollectionId: collection.id,
      },
    ]);
  });

  it('reports a dangling flat asset reference', async function () {
    const collection = await createRefCollection(project.id);
    const asset = await createAsset(project.id);
    const referrer = await core.entries.create({
      projectId: project.id,
      collectionId: collection.id,
      values: { image: assetRef(asset.id), related: emptyRef() },
    });
    await Fs.remove(core.util.pathTo.assetFile(project.id, asset.id));

    const danglers = await core.entries.findDanglingReferences(project.id);
    expect(danglers).toEqual([
      {
        collectionId: collection.id,
        entryId: referrer.id,
        fieldSlug: 'image',
        via: 'reference',
        componentPath: [],
        targetKind: 'asset',
        targetId: asset.id,
        targetCollectionId: null,
      },
    ]);
  });

  it('reports a dangling entry reference inside an mdast node', async function () {
    const markdownCollection = await createMarkdownCollection(project.id);
    const refCollection = await createRefCollection(project.id);
    const target = await core.entries.create({
      projectId: project.id,
      collectionId: refCollection.id,
      values: { image: emptyRef(), related: emptyRef() },
    });
    const referrer = await core.entries.create({
      projectId: project.id,
      collectionId: markdownCollection.id,
      values: {
        body: {
          objectType: 'value',
          valueType: 'mdast',
          content: {
            en: {
              type: 'root',
              children: [
                {
                  type: 'paragraph',
                  children: [
                    {
                      type: 'entryReference',
                      collectionId: refCollection.id,
                      entryId: target.id,
                      children: [{ type: 'text', value: 'see also' }],
                    },
                  ],
                },
              ],
            },
            de: null,
          },
        },
      },
    });
    await Fs.remove(
      core.util.pathTo.entryFile(project.id, refCollection.id, target.id)
    );

    const danglers = await core.entries.findDanglingReferences(project.id);
    expect(danglers).toEqual([
      {
        collectionId: markdownCollection.id,
        entryId: referrer.id,
        fieldSlug: 'body',
        via: 'mdast',
        componentPath: [],
        targetKind: 'entry',
        targetId: target.id,
        targetCollectionId: refCollection.id,
      },
    ]);
  });

  it('reports a dangling reference nested in a dynamic/component item', async function () {
    const mediaComponent = await createMediaComponent(project.id);
    const pagesCollection = await createPagesCollection(
      project.id,
      mediaComponent.id
    );
    const refCollection = await createRefCollection(project.id);
    const target = await core.entries.create({
      projectId: project.id,
      collectionId: refCollection.id,
      values: { image: emptyRef(), related: emptyRef() },
    });
    const itemId = uuid();
    const referrer = await core.entries.create({
      projectId: project.id,
      collectionId: pagesCollection.id,
      values: {
        blocks: {
          objectType: 'value',
          valueType: 'component',
          content: [
            {
              id: itemId,
              componentId: mediaComponent.id,
              values: {
                image: emptyRef(),
                link: entryRef(target.id, refCollection.id),
              },
            },
          ],
        },
      },
    });
    await Fs.remove(
      core.util.pathTo.entryFile(project.id, refCollection.id, target.id)
    );

    const danglers = await core.entries.findDanglingReferences(project.id);
    expect(danglers).toEqual([
      {
        collectionId: pagesCollection.id,
        entryId: referrer.id,
        fieldSlug: 'link',
        via: 'reference',
        componentPath: [
          {
            fieldSlug: 'blocks',
            itemId,
            componentId: mediaComponent.id,
          },
        ],
        targetKind: 'entry',
        targetId: target.id,
        targetCollectionId: refCollection.id,
      },
    ]);
  });

  it('reports every dangling reference, not just the first within an Entry', async function () {
    const collection = await createRefCollection(project.id);
    const asset = await createAsset(project.id);
    const target = await core.entries.create({
      projectId: project.id,
      collectionId: collection.id,
      values: { image: emptyRef(), related: emptyRef() },
    });
    const referrer = await core.entries.create({
      projectId: project.id,
      collectionId: collection.id,
      values: {
        image: assetRef(asset.id),
        related: entryRef(target.id, collection.id),
      },
    });
    await Fs.remove(core.util.pathTo.assetFile(project.id, asset.id));
    await Fs.remove(
      core.util.pathTo.entryFile(project.id, collection.id, target.id)
    );

    const danglers = await core.entries.findDanglingReferences(project.id);
    expect(danglers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entryId: referrer.id,
          fieldSlug: 'image',
          targetKind: 'asset',
          targetId: asset.id,
        }),
        expect.objectContaining({
          entryId: referrer.id,
          fieldSlug: 'related',
          targetKind: 'entry',
          targetId: target.id,
        }),
      ])
    );
    expect(danglers).toHaveLength(2);
  });

  it('returns no danglers when every reference target exists', async function () {
    const collection = await createRefCollection(project.id);
    const asset = await createAsset(project.id);
    const target = await core.entries.create({
      projectId: project.id,
      collectionId: collection.id,
      values: { image: emptyRef(), related: emptyRef() },
    });
    await core.entries.create({
      projectId: project.id,
      collectionId: collection.id,
      values: {
        image: assetRef(asset.id),
        related: entryRef(target.id, collection.id),
      },
    });

    const danglers = await core.entries.findDanglingReferences(project.id);
    expect(danglers).toEqual([]);
  });

  it('reports a dangling whole-collection reference', async function () {
    const collection = await createRefCollection(project.id);
    // No field type produces a whole-collection reference, so the Entry file is
    // written directly (as a pull/merge or hand edit could introduce one). The
    // target Collection id never existed, so its folder is absent.
    const missingCollectionId = uuid();
    const entryId = uuid();
    await Fs.writeJSON(
      core.util.pathTo.entryFile(project.id, collection.id, entryId),
      {
        objectType: 'entry',
        id: entryId,
        coreVersion: core.coreVersion,
        created: '2024-01-01T00:00:00.000Z',
        updated: null,
        values: {
          related: {
            objectType: 'value',
            valueType: 'reference',
            content: {
              en: [{ objectType: 'collection', id: missingCollectionId }],
              de: [],
            },
          },
        },
      }
    );

    const danglers = await core.entries.findDanglingReferences(project.id);
    expect(danglers).toEqual([
      {
        collectionId: collection.id,
        entryId,
        fieldSlug: 'related',
        via: 'reference',
        componentPath: [],
        targetKind: 'collection',
        targetId: missingCollectionId,
        targetCollectionId: null,
      },
    ]);
  });
});

/**
 * Two-client tests of the synchronize transaction over a shared bare remote.
 * The Core client is a real clone; a second client is simulated with
 * `pushFromOtherClient` to push a diverging history that the Core client must
 * integrate before pushing.
 */
describe('Synchronize reference protection', function () {
  let remotePath: string | undefined;
  let projectId: string | undefined;

  async function setupClient(): Promise<Project> {
    const remote = await createLocalRemoteRepository();
    remotePath = Path.join(core.util.pathTo.tmp, remote.id);
    const project = await core.projects.clone({ url: remotePath });
    projectId = project.id;
    return project;
  }

  /**
   * Arranges the canonical hazard: a target Entry X is on the remote, another
   * client deletes it, and this client adds a referrer Z to X before
   * integrating. The next sync must block.
   */
  async function arrangeDanglingSync(): Promise<{
    project: Project;
    collection: { id: string };
    target: { id: string };
    referrer: { id: string };
  }> {
    const project = await setupClient();
    const collection = await createRefCollection(project.id);
    const target = await core.entries.create({
      projectId: project.id,
      collectionId: collection.id,
      values: { image: emptyRef(), related: emptyRef() },
    });
    await core.projects.synchronize({ id: project.id });

    // Another client deletes X and pushes (valid there: nothing references X).
    await pushFromOtherClient(project.id, async (copyId) => {
      await core.entries.delete({
        projectId: copyId,
        collectionId: collection.id,
        id: target.id,
      });
    });

    // Locally, before integrating, add Z referencing X (valid: X still exists).
    const referrer = await core.entries.create({
      projectId: project.id,
      collectionId: collection.id,
      values: {
        image: emptyRef(),
        related: entryRef(target.id, collection.id),
      },
    });

    return { project, collection, target, referrer };
  }

  afterEach(async function () {
    vi.restoreAllMocks();
    if (projectId !== undefined) {
      await core.projects
        .delete({ id: projectId, force: true })
        .catch(() => undefined);
      projectId = undefined;
    }
    if (remotePath !== undefined) {
      await Fs.remove(remotePath);
      remotePath = undefined;
    }
  });

  it('blocks a sync that would integrate a dangling reference and does not push', async function () {
    const { project, collection, target, referrer } =
      await arrangeDanglingSync();

    let error: unknown;
    try {
      await core.projects.synchronize({ id: project.id });
    } catch (caught) {
      error = caught;
    }
    expect(getDanglingReferences(error)).toEqual([
      {
        collectionId: collection.id,
        entryId: referrer.id,
        fieldSlug: 'related',
        via: 'reference',
        componentPath: [],
        targetKind: 'entry',
        targetId: target.id,
        targetCollectionId: collection.id,
      },
    ]);

    // No push happened: the referrer commit is still local (ahead by one), and
    // the integrated state lives in the local tree for repair.
    const changes = await core.projects.getChanges({ id: project.id });
    expect(changes.ahead).toHaveLength(1);
    expect(
      await Fs.pathExists(
        core.util.pathTo.entryFile(project.id, collection.id, target.id)
      )
    ).toBe(false);
    expect(
      await Fs.pathExists(
        core.util.pathTo.entryFile(project.id, collection.id, referrer.id)
      )
    ).toBe(true);
    const status = await core.git.status(core.util.pathTo.project(project.id));
    expect(status).toHaveLength(0);
  });

  it('lets the sync succeed once the dangling referrer is repaired', async function () {
    const { project, collection, referrer } = await arrangeDanglingSync();

    await expect(
      core.projects.synchronize({ id: project.id })
    ).rejects.toMatchObject({ type: 'Conflict' });

    // Repair by deleting the referrer, then sync cleanly. The second scan must
    // read the repaired tree from disk, not a stale cache.
    await core.entries.delete({
      projectId: project.id,
      collectionId: collection.id,
      id: referrer.id,
    });
    await core.projects.synchronize({ id: project.id });

    const changes = await core.projects.getChanges({ id: project.id });
    expect(changes.ahead).toHaveLength(0);
    expect(changes.behind).toHaveLength(0);
  });

  it('syncs cleanly when concurrent edits do not break any reference', async function () {
    const project = await setupClient();
    const collection = await createRefCollection(project.id);
    await core.projects.synchronize({ id: project.id });

    // Another client adds an unrelated Entry and pushes.
    await pushFromOtherClient(project.id, async (copyId) => {
      await core.entries.create({
        projectId: copyId,
        collectionId: collection.id,
        values: { image: emptyRef(), related: emptyRef() },
      });
    });

    // Local adds a different unrelated Entry.
    await core.entries.create({
      projectId: project.id,
      collectionId: collection.id,
      values: { image: emptyRef(), related: emptyRef() },
    });

    await core.projects.synchronize({ id: project.id });
    const changes = await core.projects.getChanges({ id: project.id });
    expect(changes.ahead).toHaveLength(0);
    expect(changes.behind).toHaveLength(0);
  });

  it('aborts cleanly and surfaces a PreconditionFailed on a textual conflict', async function () {
    const project = await setupClient();
    const collection = await createRefCollection(project.id);
    const p = await core.entries.create({
      projectId: project.id,
      collectionId: collection.id,
      values: { image: emptyRef(), related: emptyRef() },
    });
    const q = await core.entries.create({
      projectId: project.id,
      collectionId: collection.id,
      values: { image: emptyRef(), related: emptyRef() },
    });
    const x = await core.entries.create({
      projectId: project.id,
      collectionId: collection.id,
      values: { image: emptyRef(), related: emptyRef() },
    });
    await core.projects.synchronize({ id: project.id });

    // Another client and this client edit the SAME field of the SAME Entry X.
    await pushFromOtherClient(project.id, async (copyId) => {
      await core.entries.update({
        projectId: copyId,
        collectionId: collection.id,
        id: x.id,
        values: { image: emptyRef(), related: entryRef(p.id, collection.id) },
      });
    });
    await core.entries.update({
      projectId: project.id,
      collectionId: collection.id,
      id: x.id,
      values: { image: emptyRef(), related: entryRef(q.id, collection.id) },
    });

    const before = await core.projects.getChanges({ id: project.id });
    expect(before.ahead).toHaveLength(1);
    expect(before.behind).toHaveLength(1);

    await expect(
      core.projects.synchronize({ id: project.id })
    ).rejects.toMatchObject({ type: 'PreconditionFailed' });

    // The rebase was aborted: the tree is clean and HEAD is the pre-sync commit,
    // so the repository was never left mid-rebase.
    const status = await core.git.status(core.util.pathTo.project(project.id));
    expect(status).toHaveLength(0);
    const after = await core.projects.getChanges({ id: project.id });
    expect(after.ahead).toHaveLength(1);
    expect(after.behind).toHaveLength(1);
  });

  it('refuses to sync a Project with uncommitted changes', async function () {
    const project = await createProject('Dirty sync');
    projectId = project.id;
    await createRefCollection(project.id);

    // Dirty a tracked file so the working tree is not clean.
    await Fs.appendFile(core.util.pathTo.projectFile(project.id), '\n');

    await expect(
      core.projects.synchronize({ id: project.id })
    ).rejects.toMatchObject({ type: 'PreconditionFailed' });
  });

  it('retries the push after a non-fast-forward rejection', async function () {
    const project = await setupClient();
    await createRefCollection(project.id);

    // Reject the first push as a non-fast-forward; the spy falls through to the
    // real push on the retry.
    const pushSpy = vi.spyOn(core.git, 'push');
    pushSpy.mockImplementationOnce(() =>
      Promise.reject(
        CoreError.preconditionFailed(
          'Push rejected because the remote advanced. Re-integrate the remote changes and try again.'
        )
      )
    );

    await core.projects.synchronize({ id: project.id });

    expect(pushSpy).toHaveBeenCalledTimes(2);
    const changes = await core.projects.getChanges({ id: project.id });
    expect(changes.ahead).toHaveLength(0);
  });
});
