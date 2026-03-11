import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import core, { type Collection, type Project } from '../test/setup.js';
import {
  createCollection,
  createProject,
  ensureCleanGitStatus,
} from '../test/util.js';

describe('ReleaseService', function () {
  let project: Project & { destroy: () => Promise<void> };
  let collection: Collection;

  beforeAll(async function () {
    project = await createProject();
  });

  afterAll(async function () {
    await project.destroy();
  });

  afterEach(async function ({ task }) {
    await ensureCleanGitStatus(task, project.id);
  });

  it('should detect new collections as MINOR bump on first release', async function () {
    collection = await createCollection(project.id);

    const diff = await core.releases.prepare({ projectId: project.id });

    expect(diff.bump).toEqual('minor');
    expect(diff.currentVersion).toEqual('0.0.1');
    expect(diff.nextVersion).toEqual('0.1.0');
    expect(diff.collectionChanges.length).toBeGreaterThanOrEqual(1);
    expect(
      diff.collectionChanges.some(
        (c) => c.changeType === 'added' && c.collectionId === collection.id
      )
    ).toBe(true);
  });

  it('should create a preview release before full release', async function () {
    const result = await core.releases.createPreview({
      projectId: project.id,
    });

    expect(result.version).toEqual('0.1.0-preview.1');
    expect(result.diff.bump).toEqual('minor');

    // Verify project version was updated to preview
    const updatedProject = await core.projects.read({ id: project.id });
    expect(updatedProject.version).toEqual('0.1.0-preview.1');

    // Verify we're still on work branch (no merge to production)
    const currentBranch = await core.git.branches.current(
      core.util.pathTo.project(project.id)
    );
    expect(currentBranch).toEqual('work');
  });

  it('should increment preview number on subsequent preview releases', async function () {
    // Make a small change so there's something new
    collection.name.singular.en = 'Preview Product';
    await core.collections.update({
      projectId: project.id,
      ...collection,
    });

    const result = await core.releases.createPreview({
      projectId: project.id,
    });

    expect(result.version).toEqual('0.1.0-preview.2');
  });

  it('should create a first full release successfully', async function () {
    const result = await core.releases.create({ projectId: project.id });

    expect(result.version).toEqual('0.1.0');
    expect(result.diff.bump).toEqual('minor');

    // Verify project version was updated
    const updatedProject = await core.projects.read({ id: project.id });
    expect(updatedProject.version).toEqual('0.1.0');

    // Verify we're back on work branch
    const currentBranch = await core.git.branches.current(
      core.util.pathTo.project(project.id)
    );
    expect(currentBranch).toEqual('work');
  });

  it('should detect no changes after a release', async function () {
    const diff = await core.releases.prepare({ projectId: project.id });

    expect(diff.bump).toBeNull();
    expect(diff.nextVersion).toBeNull();
  });

  it('should throw when creating a release with no changes', async function () {
    await expect(
      core.releases.create({ projectId: project.id })
    ).rejects.toThrow('no changes detected since the last full release');
  });

  it('should throw when creating a preview release with no changes', async function () {
    await expect(
      core.releases.createPreview({ projectId: project.id })
    ).rejects.toThrow('no changes detected since the last full release');
  });

  it('should detect PATCH bump for label changes', async function () {
    collection.name.singular.en = 'Updated Product';
    await core.collections.update({
      projectId: project.id,
      ...collection,
    });

    const diff = await core.releases.prepare({ projectId: project.id });

    // Collection field definitions didn't change, but the collection was updated
    // This shows as content-only changes (PATCH) since it's a commit between branches
    expect(diff.bump).toEqual('patch');
  });

  it('should create a patch release', async function () {
    const result = await core.releases.create({ projectId: project.id });

    expect(result.version).toEqual('0.1.1');
    expect(result.diff.bump).toEqual('patch');
  });

  it('should detect PATCH bump for field label changes', async function () {
    const field = collection.fieldDefinitions[0]!;
    field.label.en = 'Updated Label';

    await core.collections.update({
      projectId: project.id,
      ...collection,
    });

    const diff = await core.releases.prepare({ projectId: project.id });

    expect(diff.bump).toEqual('patch');
    expect(
      diff.fieldChanges.some((c) => c.changeType === 'labelChanged')
    ).toBe(true);
  });

  it('should create another patch release for field label change', async function () {
    const result = await core.releases.create({ projectId: project.id });

    expect(result.version).toEqual('0.1.2');
  });

  it('should detect MINOR bump when a field becomes required', async function () {
    // The entry reference field is currently not required
    const entryRefField = collection.fieldDefinitions.find(
      (fd) => fd.fieldType === 'entry'
    )!;
    (entryRefField as { isRequired: boolean }).isRequired = true;

    await core.collections.update({
      projectId: project.id,
      ...collection,
    });

    const diff = await core.releases.prepare({ projectId: project.id });

    expect(diff.bump).toEqual('minor');
    expect(
      diff.fieldChanges.some(
        (c) => c.changeType === 'isNotRequiredToRequired'
      )
    ).toBe(true);
  });

  it('should create a minor release', async function () {
    const result = await core.releases.create({ projectId: project.id });

    expect(result.version).toEqual('0.2.0');
  });

  it('should detect MAJOR bump when a field is deleted', async function () {
    // Remove the entry reference field
    collection.fieldDefinitions = collection.fieldDefinitions.filter(
      (fd) => fd.fieldType !== 'entry'
    );

    await core.collections.update({
      projectId: project.id,
      ...collection,
    });

    const diff = await core.releases.prepare({ projectId: project.id });

    expect(diff.bump).toEqual('major');
    expect(
      diff.fieldChanges.some((c) => c.changeType === 'deleted')
    ).toBe(true);
  });

  it('should create a major release', async function () {
    const result = await core.releases.create({ projectId: project.id });

    expect(result.version).toEqual('1.0.0');
  });

  it('should reset preview numbering after a full release', async function () {
    // Make a change after the full release
    collection.description.en = 'Changed description after v1';
    await core.collections.update({
      projectId: project.id,
      ...collection,
    });

    const result = await core.releases.createPreview({
      projectId: project.id,
    });

    // New base version (1.0.1 patch), preview count resets to 1
    expect(result.version).toEqual('1.0.1-preview.1');
  });

  it('should still be able to do a full release after preview', async function () {
    const result = await core.releases.create({ projectId: project.id });

    expect(result.version).toEqual('1.0.1');
  });

  it('should detect MAJOR bump when a collection is deleted', async function () {
    await core.collections.delete({
      projectId: project.id,
      id: collection.id,
    });

    const diff = await core.releases.prepare({ projectId: project.id });

    expect(diff.bump).toEqual('major');
    expect(
      diff.collectionChanges.some((c) => c.changeType === 'deleted')
    ).toBe(true);
  });

  it('should create a major release for deleted collection', async function () {
    const result = await core.releases.create({ projectId: project.id });

    expect(result.version).toEqual('2.0.0');
  });
});
