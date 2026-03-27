import { faker } from '@faker-js/faker';
import crypto from 'node:crypto';
import Fs from 'fs-extra';
import Path from 'node:path';
import type { RunnerTestCase } from 'vitest';
import { expect } from 'vitest';
import type { EntryFieldDefinition } from './setup.js';
import core, {
  flattenFieldDefinitions,
  uuid,
  type ProjectSettings,
} from './setup.js';

const ids = {
  textFieldDefinition: uuid(),
  assetReferenceFieldDefinition: uuid(),
  entryReferenceFieldDefinition: uuid(),
};

const slugs = {
  textFieldDefinition: 'product-name',
  assetReferenceFieldDefinition: 'header-image',
  entryReferenceFieldDefinition: 'related-products',
};

export async function ensureCleanGitStatus(
  task: Readonly<RunnerTestCase>,
  projectId: string
) {
  const status = await core.git.status(core.util.pathTo.project(projectId));
  if (status.length > 0) {
    core.logger.error({
      source: 'core',
      message: `Task "${
        task.name
      }" finished with an unclean git status: ${JSON.stringify(status)}`,
      meta: { status },
    });
  }
  expect(status.length).toEqual(0);
}

/**
 * Returns the MD5 hash of given file
 */
export async function getFileHash(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = Fs.createReadStream(path);
    stream.on('error', (err) => reject(err));
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/**
 * Creates a new local "remote" repository.
 * Meaning, simulating a remote repository on the local file system.
 * Returns the path to the remote repository.
 */
export async function createLocalRemoteRepository() {
  const remoteProject = await createProject('Remote Project');
  const remoteProjectPath = Path.join(core.util.pathTo.tmp, remoteProject.id);
  await core.git.clone(
    core.util.pathTo.project(remoteProject.id),
    remoteProjectPath,
    { bare: true }
  );
  await Fs.remove(core.util.pathTo.project(remoteProject.id));

  return remoteProject;
}

/**
 * Creates a new Project for testing
 *
 * The Project has a special destroy method, that removes the Project again.
 */
export async function createProject(name?: string, settings?: ProjectSettings) {
  const project = await core.projects.create({
    name: name || faker.company.name(),
    description: faker.company.catchPhrase(),
    settings: settings || {
      language: {
        default: 'en',
        supported: ['en', 'de'],
      },
    },
  });

  const destroy = async () => {
    await core.projects.delete({ id: project.id, force: true });
  };

  return { ...project, destroy };
}

export async function createComponent(projectId: string) {
  const component = await core.components.create({
    projectId,
    name: { en: 'Hero' },
    slug: 'hero',
    description: { en: 'A hero section' },
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

  return component;
}

export async function createAsset(projectId: string) {
  const asset = await core.assets.create({
    projectId,
    filePath: Path.resolve('src/test/data/150x150.png'),
    name: 'elek.io',
    description: 'A 150x150 image of the text "elek.ioo"',
  });

  return asset;
}

export async function createCollection(projectId: string) {
  const collection = await core.collections.create({
    projectId,
    icon: 'home',
    name: {
      singular: {
        en: 'Product',
      },
      plural: {
        en: 'Products',
      },
    },
    slug: {
      singular: 'product',
      plural: 'products',
    },
    description: {
      en: 'A Collection that contains our Products',
    },
    fieldDefinitions: [
      {
        id: ids.textFieldDefinition,
        slug: slugs.textFieldDefinition,
        valueType: 'string',
        label: {
          en: 'Name',
        },
        description: {
          en: 'The title should be shirt and catchy, to grab the users attention',
        },
        fieldType: 'text',
        inputWidth: '12',
        isDisabled: false,
        isRequired: true,
        isUnique: true,
        min: null,
        defaultValue: null,
        max: 70,
      },
      {
        id: ids.assetReferenceFieldDefinition,
        slug: slugs.assetReferenceFieldDefinition,
        valueType: 'reference',
        label: {
          en: 'Header image',
        },
        description: {
          en: 'An image for this product displayed on top of the page',
        },
        fieldType: 'asset',
        inputWidth: '12',
        isDisabled: false,
        isRequired: true,
        isUnique: false,
        min: null,
        max: null,
      },
      {
        id: ids.entryReferenceFieldDefinition,
        slug: slugs.entryReferenceFieldDefinition,
        valueType: 'reference',
        label: {
          en: 'Related products',
        },
        description: {
          en: 'References to other products that the visitor might want to check out too',
        },
        fieldType: 'entry',
        ofCollections: [],
        inputWidth: '12',
        isDisabled: false,
        isRequired: false,
        isUnique: false,
        min: null,
        max: null,
      },
    ],
  });

  // Add circular reference to products
  (
    flattenFieldDefinitions(collection.fieldDefinitions).find((definition) => {
      return definition.slug === slugs.entryReferenceFieldDefinition;
    }) as EntryFieldDefinition
  ).ofCollections = [collection.id];

  const updatedCollection = await core.collections.update({
    ...collection,
    projectId,
  });

  return updatedCollection;
}

export async function createEntry(
  projectId: string,
  collectionId: string,
  assetValueId: string,
  entryValueId?: string
) {
  const entry = await core.entries.create({
    projectId: projectId,
    collectionId: collectionId,
    values: {
      [slugs.textFieldDefinition]: {
        objectType: 'value',
        valueType: 'string',
        content: {
          en: faker.commerce.product(),
        },
      },
      [slugs.assetReferenceFieldDefinition]: {
        objectType: 'value',
        valueType: 'reference',
        content: {
          en: [
            {
              objectType: 'asset',
              id: assetValueId,
            },
          ],
        },
      },
      [slugs.entryReferenceFieldDefinition]: {
        objectType: 'value',
        valueType: 'reference',
        content: {
          en:
            (entryValueId && [
              {
                objectType: 'entry',
                id: entryValueId,
                collectionId: collectionId,
              },
            ]) ||
            [],
        },
      },
    },
  });

  return entry;
}
