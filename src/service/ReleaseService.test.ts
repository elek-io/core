import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import core, {
  flattenFieldDefinitions,
  uuid,
  type Asset,
  type Collection,
  type Component,
  type Entry,
  type Project,
} from '../test/setup.js';
import {
  createAsset,
  createCollection,
  createEntry,
  createProject,
  ensureCleanGitStatus,
} from '../test/util.js';

describe('ReleaseService', function () {
  let project: Project & { destroy: () => Promise<void> };
  let collection: Collection;
  let component: Component;
  let asset: Asset;
  let entry: Entry;

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

  it('should return error when creating a release with no changes', async function () {
    await expect(
      core.releases.create({ projectId: project.id })
    ).rejects.toThrow();
  });

  it('should return error when creating a preview release with no changes', async function () {
    await expect(
      core.releases.createPreview({ projectId: project.id })
    ).rejects.toThrow();
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
    expect(diff.fieldChanges.some((c) => c.changeType === 'labelChanged')).toBe(
      true
    );
  });

  it('should create another patch release for field label change', async function () {
    const result = await core.releases.create({ projectId: project.id });

    expect(result.version).toEqual('0.1.2');
  });

  it('should detect MINOR bump when a field becomes required', async function () {
    // The entry reference field is currently not required
    const entryRefField = flattenFieldDefinitions(
      collection.fieldDefinitions
    ).find((fd) => fd.fieldType === 'entry')!;
    (entryRefField as { isRequired: boolean }).isRequired = true;

    await core.collections.update({
      projectId: project.id,
      ...collection,
    });

    const diff = await core.releases.prepare({ projectId: project.id });

    expect(diff.bump).toEqual('minor');
    expect(
      diff.fieldChanges.some((c) => c.changeType === 'isNotRequiredToRequired')
    ).toBe(true);
  });

  it('should create a minor release', async function () {
    const result = await core.releases.create({ projectId: project.id });

    expect(result.version).toEqual('0.2.0');
  });

  it('should detect MAJOR bump when a field is deleted', async function () {
    // Remove the entry reference field
    collection.fieldDefinitions = collection.fieldDefinitions.filter(
      (fd) => !('fieldType' in fd) || fd.fieldType !== 'entry'
    );

    await core.collections.update({
      projectId: project.id,
      ...collection,
    });

    const diff = await core.releases.prepare({ projectId: project.id });

    expect(diff.bump).toEqual('major');
    expect(diff.fieldChanges.some((c) => c.changeType === 'deleted')).toBe(
      true
    );
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
    expect(diff.collectionChanges.some((c) => c.changeType === 'deleted')).toBe(
      true
    );
  });

  it('should create a major release for deleted collection', async function () {
    const result = await core.releases.create({ projectId: project.id });

    expect(result.version).toEqual('2.0.0');
  });

  it('should detect MINOR bump when an asset is added', async function () {
    // Create a new collection and asset for subsequent tests
    collection = await createCollection(project.id);
    asset = await createAsset(project.id);

    const diff = await core.releases.prepare({ projectId: project.id });

    expect(diff.bump).toEqual('minor');
    expect(
      diff.assetChanges.some(
        (c) => c.changeType === 'added' && c.assetId === asset.id
      )
    ).toBe(true);
  });

  it('should create a minor release for added asset and collection', async function () {
    const result = await core.releases.create({ projectId: project.id });

    expect(result.version).toEqual('2.1.0');
  });

  it('should detect PATCH bump when asset metadata changes', async function () {
    await core.assets.update({
      projectId: project.id,
      id: asset.id,
      name: 'Updated Asset Name',
      description: 'Updated description',
    });

    const diff = await core.releases.prepare({ projectId: project.id });

    expect(diff.bump).toEqual('patch');
    expect(
      diff.assetChanges.some(
        (c) => c.changeType === 'metadataChanged' && c.assetId === asset.id
      )
    ).toBe(true);
  });

  it('should create a patch release for asset metadata change', async function () {
    const result = await core.releases.create({ projectId: project.id });

    expect(result.version).toEqual('2.1.1');
  });

  it('should detect MAJOR bump when an asset is deleted', async function () {
    await core.assets.delete({
      projectId: project.id,
      id: asset.id,
      extension: asset.extension,
    });

    const diff = await core.releases.prepare({ projectId: project.id });

    expect(diff.bump).toEqual('major');
    expect(
      diff.assetChanges.some(
        (c) => c.changeType === 'deleted' && c.assetId === asset.id
      )
    ).toBe(true);
  });

  it('should create a major release for deleted asset', async function () {
    const result = await core.releases.create({ projectId: project.id });

    expect(result.version).toEqual('3.0.0');
  });

  it('should detect MINOR bump when an entry is added', async function () {
    // Need an asset for the entry's asset reference field
    asset = await createAsset(project.id);
    entry = await createEntry(project.id, collection.id, asset.id);

    const diff = await core.releases.prepare({ projectId: project.id });

    expect(diff.bump).toEqual('minor');
    expect(
      diff.entryChanges.some(
        (c) => c.changeType === 'added' && c.entryId === entry.id
      )
    ).toBe(true);
  });

  it('should create a minor release for added entry', async function () {
    const result = await core.releases.create({ projectId: project.id });

    expect(result.version).toEqual('3.1.0');
  });

  it('should detect PATCH bump when entry values change', async function () {
    await core.entries.update({
      projectId: project.id,
      collectionId: collection.id,
      id: entry.id,
      values: {
        ...entry.values,
        'product-name': {
          objectType: 'value',
          valueType: 'string',
          content: {
            en: 'Modified Product Name',
            de: 'Modified Product Name',
          },
        },
      },
    });

    const diff = await core.releases.prepare({ projectId: project.id });

    expect(diff.bump).toEqual('patch');
    expect(
      diff.entryChanges.some(
        (c) => c.changeType === 'modified' && c.entryId === entry.id
      )
    ).toBe(true);
  });

  it('should create a patch release for modified entry', async function () {
    const result = await core.releases.create({ projectId: project.id });

    expect(result.version).toEqual('3.1.1');
  });

  it('should detect MAJOR bump when an entry is deleted', async function () {
    await core.entries.delete({
      projectId: project.id,
      collectionId: collection.id,
      id: entry.id,
    });

    const diff = await core.releases.prepare({ projectId: project.id });

    expect(diff.bump).toEqual('major');
    expect(
      diff.entryChanges.some(
        (c) => c.changeType === 'deleted' && c.entryId === entry.id
      )
    ).toBe(true);
  });

  it('should create a major release for deleted entry', async function () {
    const result = await core.releases.create({ projectId: project.id });

    expect(result.version).toEqual('4.0.0');
  });

  it('should detect PATCH bump when project name changes', async function () {
    await core.projects.update({
      id: project.id,
      name: 'Renamed Project',
      description: project.description,
      settings: project.settings,
    });

    const diff = await core.releases.prepare({ projectId: project.id });

    expect(diff.bump).toEqual('patch');
    expect(
      diff.projectChanges.some((c) => c.changeType === 'nameChanged')
    ).toBe(true);
  });

  it('should create a patch release for project name change', async function () {
    const result = await core.releases.create({ projectId: project.id });

    expect(result.version).toEqual('4.0.1');
    // Update local reference
    // Project state is re-read in subsequent tests to avoid stale references
  });

  it('should detect MINOR bump when a supported language is added', async function () {
    const currentProject = await core.projects.read({ id: project.id });

    await core.projects.update({
      id: project.id,
      name: currentProject.name,
      description: currentProject.description,
      settings: {
        language: {
          default: currentProject.settings.language.default,
          supported: [...currentProject.settings.language.supported, 'fr'],
        },
      },
    });

    const diff = await core.releases.prepare({ projectId: project.id });

    expect(diff.bump).toEqual('minor');
    expect(
      diff.projectChanges.some((c) => c.changeType === 'supportedLanguageAdded')
    ).toBe(true);
  });

  it('should create a minor release for added language', async function () {
    const result = await core.releases.create({ projectId: project.id });

    expect(result.version).toEqual('4.1.0');
    // Project state is re-read in subsequent tests to avoid stale references
  });

  it('should detect MAJOR bump when the default language changes', async function () {
    const currentProject = await core.projects.read({ id: project.id });

    await core.projects.update({
      id: project.id,
      name: currentProject.name,
      description: currentProject.description,
      settings: {
        language: {
          default: 'de',
          supported: currentProject.settings.language.supported,
        },
      },
    });

    const diff = await core.releases.prepare({ projectId: project.id });

    expect(diff.bump).toEqual('major');
    expect(
      diff.projectChanges.some((c) => c.changeType === 'defaultLanguageChanged')
    ).toBe(true);
  });

  it('should create a major release for default language change', async function () {
    const result = await core.releases.create({ projectId: project.id });

    expect(result.version).toEqual('5.0.0');
    // Project state is re-read in subsequent tests to avoid stale references
  });

  it('should detect MAJOR bump when a supported language is removed', async function () {
    const currentProject = await core.projects.read({ id: project.id });

    await core.projects.update({
      id: project.id,
      name: currentProject.name,
      description: currentProject.description,
      settings: {
        language: {
          default: currentProject.settings.language.default,
          supported: currentProject.settings.language.supported.filter(
            (l) => l !== 'en'
          ),
        },
      },
    });

    const diff = await core.releases.prepare({ projectId: project.id });

    expect(diff.bump).toEqual('major');
    expect(
      diff.projectChanges.some(
        (c) => c.changeType === 'supportedLanguageRemoved'
      )
    ).toBe(true);
  });

  it('should create a major release for removed language', async function () {
    const result = await core.releases.create({ projectId: project.id });

    expect(result.version).toEqual('6.0.0');
  });

  // --- Component version bump tests ---

  it('should detect MINOR bump when a component is added', async function () {
    component = await core.components.create({
      projectId: project.id,
      name: { de: 'Hero', fr: 'Hero' },
      slug: 'hero',
      description: { de: 'A hero section', fr: 'A hero section' },
      fieldDefinitions: [
        {
          id: uuid(),
          slug: 'title',
          valueType: 'string',
          fieldType: 'text',
          label: { de: 'Title', fr: 'Title' },
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

    const diff = await core.releases.prepare({ projectId: project.id });

    expect(diff.bump).toEqual('minor');
    expect(
      diff.componentChanges.some(
        (c) => c.changeType === 'added' && c.componentId === component.id
      )
    ).toBe(true);
  });

  it('should create a minor release for added component', async function () {
    const result = await core.releases.create({ projectId: project.id });

    expect(result.version).toEqual('6.1.0');
  });

  it('should detect PATCH bump when component field label changes', async function () {
    const field = component.fieldDefinitions[0]!;
    field.label.de = 'Updated Title Label';

    await core.components.update({
      projectId: project.id,
      ...component,
    });

    const diff = await core.releases.prepare({ projectId: project.id });

    expect(diff.bump).toEqual('patch');
    expect(
      diff.componentFieldChanges.some((c) => c.changeType === 'labelChanged')
    ).toBe(true);
  });

  it('should create a patch release for component field label change', async function () {
    const result = await core.releases.create({ projectId: project.id });

    expect(result.version).toEqual('6.1.1');
  });

  it('should detect MINOR bump when a component field is added', async function () {
    component.fieldDefinitions.push({
      id: uuid(),
      slug: 'subtitle',
      valueType: 'string',
      fieldType: 'text',
      label: { de: 'Subtitle', fr: 'Subtitle' },
      description: null,
      defaultValue: null,
      isRequired: false,
      isDisabled: false,
      isUnique: false,
      inputWidth: '12',
      min: null,
      max: null,
    });

    await core.components.update({
      projectId: project.id,
      ...component,
    });

    const diff = await core.releases.prepare({ projectId: project.id });

    expect(diff.bump).toEqual('minor');
    expect(
      diff.componentFieldChanges.some((c) => c.changeType === 'added')
    ).toBe(true);
  });

  it('should create a minor release for added component field', async function () {
    const result = await core.releases.create({ projectId: project.id });

    expect(result.version).toEqual('6.2.0');
  });

  it('should detect MAJOR bump when a component field slug changes', async function () {
    const field = component.fieldDefinitions[0]!;
    field.slug = 'heading';

    await core.components.update({
      projectId: project.id,
      ...component,
    });

    const diff = await core.releases.prepare({ projectId: project.id });

    expect(diff.bump).toEqual('major');
    expect(
      diff.componentFieldChanges.some((c) => c.changeType === 'slugChanged')
    ).toBe(true);
  });

  it('should create a major release for component field slug change', async function () {
    const result = await core.releases.create({ projectId: project.id });

    expect(result.version).toEqual('7.0.0');
  });

  it('should detect MAJOR bump when a component field is deleted', async function () {
    component.fieldDefinitions = component.fieldDefinitions.slice(0, 1);

    await core.components.update({
      projectId: project.id,
      ...component,
    });

    const diff = await core.releases.prepare({ projectId: project.id });

    expect(diff.bump).toEqual('major');
    expect(
      diff.componentFieldChanges.some((c) => c.changeType === 'deleted')
    ).toBe(true);
  });

  it('should create a major release for deleted component field', async function () {
    const result = await core.releases.create({ projectId: project.id });

    expect(result.version).toEqual('8.0.0');
  });

  it('should detect MAJOR bump when a component is deleted', async function () {
    await core.components.delete({
      projectId: project.id,
      id: component.id,
    });

    const diff = await core.releases.prepare({ projectId: project.id });

    expect(diff.bump).toEqual('major');
    expect(
      diff.componentChanges.some(
        (c) => c.changeType === 'deleted' && c.componentId === component.id
      )
    ).toBe(true);
  });

  it('should create a major release for deleted component', async function () {
    const result = await core.releases.create({ projectId: project.id });

    expect(result.version).toEqual('9.0.0');
  });
});
