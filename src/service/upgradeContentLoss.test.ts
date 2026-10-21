import Fs from 'fs-extra';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import core, {
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
  }, 60000);

  afterAll(async function () {
    await project.destroy();
  });

  it(
    'upgrades a Project holding Collections, Components and Entries',
    { timeout: 120000 },
    async function () {
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
    }
  );

  it(
    'applies a migration that drops a field definition instead of refusing',
    { timeout: 120000 },
    async function () {
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

      await core.projects.upgrade({ id: project.id, force: true });

      const after = await core.entries.read({
        projectId: project.id,
        collectionId: collection.id,
        id: entry.id,
      });
      expect(after.values[dropped.slug]).toBeUndefined();
      expect(after.values['title']).toEqual(entry.values['title']);
    }
  );
});
