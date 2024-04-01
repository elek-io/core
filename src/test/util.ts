import type { ProjectSettings } from '@elek-io/shared';
import {
  adjectives,
  animals,
  colors,
  uniqueNamesGenerator,
} from '@joaomoreno/unique-names-generator';
import crypto from 'crypto';
import Fs from 'fs-extra';
import Path from 'path';
import core from './setup.js';

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
  const randomName = uniqueNamesGenerator({
    dictionaries: [adjectives, animals, colors],
    separator: '-',
  });

  const project = await core.projects.create({
    name: name || randomName,
    description: 'This Project was created for an automatic test.',
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
    slug: {
      singular: 'recipe',
      plural: 'recipes',
    },
    name: {
      singular: {
        en: 'Recipe',
      },
      plural: {
        en: 'Recipes',
      },
    },
    description: {
      en: 'A Collection that contains recipes',
    },
    valueDefinitions: [
      {
        id: '82e8f99c-f197-4b55-a88d-682b7e670728',
        valueType: 'string',
        name: {
          en: 'Title',
        },
        description: {
          en: 'The title should be shirt and catchy, to grab the users attention.',
        },
        inputType: 'text',
        inputWidth: '12',
        isDisabled: false,
        isRequired: true,
        isUnique: true,
        max: 70,
      },
    ],
  });

  return collection;
}

export async function createValue(projectId: string) {
  const value = await core.sharedValues.create({
    projectId: projectId,
    valueType: 'string',
    language: 'en',
    content: 'Hello World',
  });

  return value;
}

export async function createEntry(
  projectId: string,
  collectionId: string,
  valueId: string
) {
  const entry = await core.entries.create({
    projectId: projectId,
    collectionId: collectionId,
    language: 'en',
    valueReferences: [
      {
        definitionId: '82e8f99c-f197-4b55-a88d-682b7e670728',
        references: {
          id: valueId,
          language: 'en',
        },
      },
    ],
  });

  return entry;
}
