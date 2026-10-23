import Fs from 'fs-extra';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import core, {
  CoreError,
  uuid,
  type FieldDefinition,
  type Project,
} from '../test/setup.js';
import {
  createAsset,
  createCollection,
  createComponent,
  createEntry,
  createProject,
} from '../test/util.js';

/**
 * A migration Core ships is not a model edit somebody can be asked about: a
 * Project stays unreadable until it runs. So the upgrade accepts what its
 * own migration deletes, and a Project whose migration drops a field
 * definition still upgrades instead of refusing for good.
 *
 * Core registers no such migration today, which is why this file supplies
 * one.
 *
 * @see ../../docs/schema-changes.md
 */
const dropped = vi.hoisted(() => ({ slug: 'note' }));

vi.mock('./migrations/collectionMigrations.js', () => ({
  collectionMigrations: [
    {
      from: '0.0.1',
      to: '0.0.2',
      run: (data: Record<string, unknown>) => ({
        ...data,
        fieldDefinitions: Array.isArray(data['fieldDefinitions'])
          ? data['fieldDefinitions'].filter(
              (definition: { slug?: string }) =>
                definition.slug !== dropped.slug
            )
          : data['fieldDefinitions'],
      }),
    },
  ],
}));

describe('upgrading a Project whose migration deletes content', function () {
  let project: Project & { destroy: () => Promise<void> };

  beforeAll(async function () {
    project = await createProject('Upgrade content loss');
  });

  afterAll(async function () {
    await project.destroy();
  });

  it('upgrades a Project holding Collections, Components and Entries', async function () {
    const collection = await createCollection(project.id);
    await createComponent(project.id);
    const asset = await createAsset(project.id);
    const entry = await createEntry(project.id, collection.id, asset.id);

    await core.projects.upgrade({ id: project.id, force: true });

    const after = await core.entries.read({
      projectId: project.id,
      collectionId: collection.id,
      id: entry.id,
    });
    expect(after.values).toEqual(entry.values);
  });

  it('applies a migration that drops a field definition instead of refusing', async function () {
    const keptId = uuid();
    const goneId = uuid();
    const suffix = uuid();
    const textField = (id: string, slug: string): FieldDefinition => ({
      id,
      slug,
      valueType: 'string',
      fieldType: 'text',
      label: { en: slug, de: slug },
      description: null,
      defaultValue: null,
      isRequired: false,
      isDisabled: false,
      isUnique: false,
      inputWidth: '12',
      min: null,
      max: null,
    });

    const collection = await core.collections.create({
      projectId: project.id,
      icon: 'home',
      name: {
        singular: { en: 'Article', de: 'Article' },
        plural: { en: 'Articles', de: 'Articles' },
      },
      description: { en: 'Articles', de: 'Articles' },
      slug: { singular: `article-${suffix}`, plural: `articles-${suffix}` },
      fieldDefinitions: [
        textField(keptId, 'title'),
        textField(goneId, dropped.slug),
      ],
    });
    const entry = await core.entries.create({
      projectId: project.id,
      collectionId: collection.id,
      values: {
        title: {
          objectType: 'value',
          valueType: 'string',
          content: { en: 'Title', de: 'Titel' },
        },
        [dropped.slug]: {
          objectType: 'value',
          valueType: 'string',
          content: { en: 'Goes with the migration', de: 'Geht mit' },
        },
      },
    });

    // Put the Collection back on a version the migration above starts from
    const projectPath = core.util.pathTo.project(project.id);
    const collectionFilePath = core.util.pathTo.collectionFile(
      project.id,
      collection.id
    );
    const onDisk = (await Fs.readJSON(collectionFilePath)) as Record<
      string,
      unknown
    >;
    await Fs.writeJSON(
      collectionFilePath,
      { ...onDisk, coreVersion: '0.0.1' },
      { spaces: 2 }
    );
    await core.git.add(projectPath, [collectionFilePath]);
    await core.git.commit(projectPath, {
      method: 'update',
      reference: { objectType: 'collection', id: collection.id },
    });

    const warn = vi.spyOn(core.logger, 'warn');
    await core.projects.upgrade({ id: project.id, force: true });
    const records = warn.mock.calls
      .map(([record]) => record)
      .filter((record) => record.message.includes('drops the content of'));
    warn.mockRestore();

    const after = await core.entries.read({
      projectId: project.id,
      collectionId: collection.id,
      id: entry.id,
    });
    expect(after.values[dropped.slug]).toBeUndefined();
    expect(after.values['title']).toEqual(entry.values['title']);

    // The one record of the loss points at the Collection that lost it,
    // and carries ids, a path and a count only
    expect(records).toHaveLength(1);
    expect(records[0]!.message).toBe(
      `Upgrading collection "${collectionFilePath}" drops the content of 1 field definition, because a migration removed it`
    );
    expect(records[0]!.meta?.['file.path']).toBe(collectionFilePath);
    expect(records[0]!.meta?.['elek.field_definition.ids']).toEqual([goneId]);
    expect(records[0]!.message).not.toContain('Goes with the migration');
  });

  it('propagates an error that is not a content loss instead of accepting it', async function () {
    const failure = CoreError.badRequest('Refused for another reason');
    const update = vi
      .spyOn(core.collections, 'update')
      .mockRejectedValueOnce(failure);

    await expect(
      core.projects.upgrade({ id: project.id, force: true })
    ).rejects.toBe(failure);

    expect(update).toHaveBeenCalledTimes(1);
    update.mockRestore();
  });
});
