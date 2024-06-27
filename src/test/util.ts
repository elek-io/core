import {
  uuid,
  type EntryValueDefinition,
  type ProjectSettings,
} from '@elek-io/shared';
import { faker } from '@faker-js/faker';
import crypto from 'crypto';
import Fs from 'fs-extra';
import Path from 'path';
import core from './setup.js';

const id = {
  textValueDefinition: uuid(),
  assetReferenceValueDefinition: uuid(),
  entryReferenceValueDefinition: uuid(),
};

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
 * Creates a new Project for testing
 *
 * The Project has a special destroy method, that removes the Project again.
 */
export async function createProject(name?: string, settings?: ProjectSettings) {
  const project = await core.projects.create({
    name: name || faker.company.name(),
    description: faker.company.catchPhrase(),
    settings: settings,
  });

  const destroy = async () => {
    await core.projects.delete({ id: project.id });
  };

  return { ...project, destroy };
}

export async function createAsset(projectId: string) {
  const asset = await core.assets.create({
    projectId,
    filePath: Path.resolve('src/test/data/150x150.png'),
    name: 'elek.io',
    description: 'A 150x150 image of the text "elek.ioo"',
    language: 'en',
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
    valueDefinitions: [
      {
        id: id.textValueDefinition,
        valueType: 'string',
        label: {
          en: 'Name',
        },
        description: {
          en: 'The title should be shirt and catchy, to grab the users attention',
        },
        inputType: 'text',
        inputWidth: '12',
        isDisabled: false,
        isRequired: true,
        isUnique: true,
        min: null,
        defaultValue: null,
        max: 70,
      },
      {
        id: id.assetReferenceValueDefinition,
        valueType: 'reference',
        label: {
          en: 'Header image',
        },
        description: {
          en: 'An image for this product displayed on top of the page',
        },
        inputType: 'asset',
        inputWidth: '12',
        isDisabled: false,
        isRequired: true,
        isUnique: false,
        allowedMimeTypes: ['image/jpeg'],
        min: null,
        max: null,
      },
      {
        id: id.entryReferenceValueDefinition,
        valueType: 'reference',
        label: {
          en: 'Related products',
        },
        description: {
          en: 'References to other products that the visitor might want to check out too',
        },
        inputType: 'entry',
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
    collection.valueDefinitions.find((definition) => {
      return definition.id === id.entryReferenceValueDefinition;
    }) as EntryValueDefinition
  ).ofCollections = [id.entryReferenceValueDefinition];

  const updatedCollection = await core.collections.update({
    ...collection,
    projectId,
  });

  return updatedCollection;
}

// export async function createSharedValue(projectId: string) {
//   const value = await core.sharedValues.create({
//     projectId: projectId,
//     valueType: 'string',
//     language: 'en',
//     content: 'Hello World',
//   });

//   return value;
// }

export async function createEntry(
  projectId: string,
  collectionId: string,
  assetValueId: string,
  entryValueId?: string
) {
  const entry = await core.entries.create({
    projectId: projectId,
    collectionId: collectionId,
    values: [
      {
        objectType: 'value',
        valueType: 'string',
        definitionId: id.textValueDefinition,
        content: {
          en: faker.commerce.product(),
        },
      },
      {
        objectType: 'value',
        valueType: 'reference',
        definitionId: id.assetReferenceValueDefinition,
        content: {
          en: [
            {
              objectType: 'asset',
              id: assetValueId,
              language: 'en',
            },
          ],
        },
      },
      {
        objectType: 'value',
        valueType: 'reference',
        definitionId: id.entryReferenceValueDefinition,
        content: {
          en:
            (entryValueId && [
              {
                objectType: 'entry',
                id: entryValueId,
              },
            ]) ||
            [],
        },
      },
    ],
  });

  return entry;
}
