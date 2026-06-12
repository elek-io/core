import { faker } from '@faker-js/faker';
import crypto from 'node:crypto';
import Fs from 'fs-extra';
import Path from 'node:path';
import ts from 'typescript';
import type { RunnerTestCase } from 'vitest';
import { expect } from 'vitest';
import type {
  Collection,
  Component,
  EntryFieldDefinition,
  MarkdownFeatures,
} from './setup.js';
import core, {
  flattenFieldDefinitions,
  uuid,
  type ProjectSettings,
} from './setup.js';

/**
 * Asserts that a string of generated TypeScript transpiles without syntax
 * errors. Uses `ts.transpileModule`, which is single-file (isolatedModules)
 * transpilation: it catches malformed output - unbalanced braces, invalid
 * tokens, broken type literals - but does NOT resolve imports or type-check
 * against other modules. A diagnostic here means the generator emitted
 * invalid source; fix the generator, do not loosen this assertion.
 *
 * Note: because transpilation is single-file, a plain `export { Foo }` for a
 * type (instead of `export type { Foo }`) surfaces as a real diagnostic - the
 * same thing esbuild/tsdown would reject in the product's `language: 'js'`
 * path, so treat it as a true positive.
 */
export function expectTranspiles(source: string, label = 'generated source') {
  const { diagnostics } = ts.transpileModule(source, {
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
    },
  });
  const messages = (diagnostics ?? []).map((diagnostic) =>
    ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
  );
  expect(messages, `${label} should transpile without diagnostics`).toEqual([]);
}

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
    name: { en: 'Hero', de: 'Hero' },
    slug: 'hero',
    description: { en: 'A hero section', de: 'A hero section' },
    fieldDefinitions: [
      {
        id: uuid(),
        slug: 'title',
        valueType: 'string',
        fieldType: 'text',
        label: { en: 'Title', de: 'Title' },
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
        de: 'Product',
      },
      plural: {
        en: 'Products',
        de: 'Products',
      },
    },
    slug: {
      singular: 'product',
      plural: 'products',
    },
    description: {
      en: 'A Collection that contains our Products',
      de: 'A Collection that contains our Products',
    },
    fieldDefinitions: [
      {
        id: ids.textFieldDefinition,
        slug: slugs.textFieldDefinition,
        valueType: 'string',
        label: {
          en: 'Name',
          de: 'Name',
        },
        description: {
          en: 'The title should be shirt and catchy, to grab the users attention',
          de: 'The title should be shirt and catchy, to grab the users attention',
        },
        fieldType: 'text',
        inputWidth: '12',
        isDisabled: false,
        isRequired: true,
        isUnique: false,
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
          de: 'Header image',
        },
        description: {
          en: 'An image for this product displayed on top of the page',
          de: 'An image for this product displayed on top of the page',
        },
        fieldType: 'asset',
        inputWidth: '12',
        isDisabled: false,
        isRequired: true,
        isUnique: false,
        min: null,
        max: null,
        ofAssetMimeTypes: [],
      },
      {
        id: ids.entryReferenceFieldDefinition,
        slug: slugs.entryReferenceFieldDefinition,
        valueType: 'reference',
        label: {
          en: 'Related products',
          de: 'Related products',
        },
        description: {
          en: 'References to other products that the visitor might want to check out too',
          de: 'References to other products that the visitor might want to check out too',
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
          de: faker.commerce.product(),
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
          de: [
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
          de:
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

/** Markdown features all off - opt in to references only. */
export const offMarkdownFeatures: MarkdownFeatures = {
  headings: [],
  blockquotes: false,
  lists: false,
  codeBlocks: false,
  thematicBreak: false,
  rawHtml: false,
  tables: false,
  taskListItems: false,
  footnotes: false,
  emphasis: false,
  strong: false,
  inlineCode: false,
  externalLinks: false,
  entryReferences: false,
  externalImages: false,
  assetReferences: false,
  strikethrough: false,
  hardLineBreaks: false,
};

/** Collection with optional flat `image` (asset) and `related` (entry) refs. */
export async function createRefCollection(
  projectId: string
): Promise<Collection> {
  const suffix = uuid();
  return core.collections.create({
    projectId,
    icon: 'home',
    name: {
      singular: { en: 'Ref', de: 'Ref' },
      plural: { en: 'Refs', de: 'Refs' },
    },
    slug: { singular: `ref-${suffix}`, plural: `refs-${suffix}` },
    description: { en: 'Refs', de: 'Refs' },
    fieldDefinitions: [
      {
        id: uuid(),
        slug: 'image',
        valueType: 'reference',
        fieldType: 'asset',
        label: { en: 'Image', de: 'Image' },
        description: null,
        isRequired: false,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12',
        min: null,
        max: null,
        ofAssetMimeTypes: [],
      },
      {
        id: uuid(),
        slug: 'related',
        valueType: 'reference',
        fieldType: 'entry',
        label: { en: 'Related', de: 'Related' },
        description: null,
        isRequired: false,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12',
        min: null,
        max: null,
        ofCollections: [],
      },
    ],
  });
}

/** Collection with an optional markdown `body` allowing asset + entry refs. */
export async function createMarkdownCollection(
  projectId: string
): Promise<Collection> {
  const suffix = uuid();
  return core.collections.create({
    projectId,
    icon: 'home',
    name: {
      singular: { en: 'Article', de: 'Article' },
      plural: { en: 'Articles', de: 'Articles' },
    },
    slug: { singular: `article-${suffix}`, plural: `articles-${suffix}` },
    description: { en: 'Articles', de: 'Articles' },
    fieldDefinitions: [
      {
        id: uuid(),
        slug: 'body',
        valueType: 'mdast',
        fieldType: 'markdown',
        label: { en: 'Body', de: 'Body' },
        description: null,
        isRequired: false,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12',
        min: null,
        max: null,
        features: {
          ...offMarkdownFeatures,
          entryReferences: true,
          assetReferences: true,
        },
        ofCollections: [],
        ofAssetMimeTypes: [],
        defaultValue: null,
      },
    ],
  });
}

/** Component with optional `image` (asset) and `link` (entry) reference fields. */
export async function createMediaComponent(
  projectId: string
): Promise<Component> {
  return core.components.create({
    projectId,
    name: { en: 'Media', de: 'Media' },
    slug: `media-${uuid()}`,
    description: null,
    fieldDefinitions: [
      {
        id: uuid(),
        slug: 'image',
        valueType: 'reference',
        fieldType: 'asset',
        label: { en: 'Image', de: 'Image' },
        description: null,
        isRequired: false,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12',
        min: null,
        max: null,
        ofAssetMimeTypes: [],
      },
      {
        id: uuid(),
        slug: 'link',
        valueType: 'reference',
        fieldType: 'entry',
        label: { en: 'Link', de: 'Link' },
        description: null,
        isRequired: false,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12',
        min: null,
        max: null,
        ofCollections: [],
      },
    ],
  });
}

/** Collection with a `blocks` dynamic field composing the given component. */
export async function createPagesCollection(
  projectId: string,
  componentId: string
): Promise<Collection> {
  const suffix = uuid();
  return core.collections.create({
    projectId,
    icon: 'home',
    name: {
      singular: { en: 'Page', de: 'Page' },
      plural: { en: 'Pages', de: 'Pages' },
    },
    slug: { singular: `page-${suffix}`, plural: `pages-${suffix}` },
    description: { en: 'Pages', de: 'Pages' },
    fieldDefinitions: [
      {
        id: uuid(),
        slug: 'blocks',
        valueType: 'component',
        fieldType: 'dynamic',
        label: { en: 'Blocks', de: 'Blocks' },
        description: null,
        isRequired: false,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12',
        ofComponents: [componentId],
        min: null,
        max: null,
      },
    ],
  });
}
