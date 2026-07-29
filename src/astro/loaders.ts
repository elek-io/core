import type { ImageInputFormat } from 'astro';
import type { Loader, LoaderContext } from 'astro/loaders';
import { z } from '@hono/zod-openapi';
import Path from 'node:path';
import Url from 'node:url';
import Fs from 'fs-extra';
import { assetSchema, flattenFieldDefinitions } from '../index.node.js';
import {
  buildEntryValuesSchema,
  buildEntryValuesTypeString,
  buildModelDigest,
} from './schema.js';
import { transformEntryValues } from './transform.js';
import {
  assertElekConfig,
  readDeclaration,
  type ElekConfig,
} from './elekConfig.js';
import { getCore, ensureProjectAvailable, logReadingProject } from './core.js';
import { watchContent } from './watch.js';
import { toPascalCase } from '../cli/util.js';

export interface ElekAssetsLoaderProps<T extends ElekConfig> {
  /** The elek config, also imported by astro.config */
  config: T;
  /** Alias of the Project in config.projects */
  project: keyof T['projects'] & string;
  /**
   * Where the binaries of image Assets are saved, so Astro can process
   * them. Has to be inside the Astro project. A relative path resolves
   * against the Astro project root.
   *
   * @default 'src/elek/<alias>/images'
   */
  imageDir?: string;
  /**
   * Where the binaries of every other Asset are saved. Has to be
   * inside Astro's own `publicDir`, that is what serves them. A
   * relative path resolves against the Astro project root.
   *
   * @default 'public/elek/<alias>/assets'
   */
  publicDir?: string;
}

export interface ElekEntriesLoaderProps<T extends ElekConfig> {
  /** The elek config, also imported by astro.config */
  config: T;
  /** Alias of the Project in config.projects */
  project: keyof T['projects'] & string;
  /** Collection UUID or slug */
  collectionIdOrSlug: string;
}

/**
 * Where a Project saves its image binaries when the loader is left to
 * decide. Below `src/` so `astro:assets` can pick them up, and per
 * alias so two Projects never write into the same directory.
 */
export function defaultImageDir(alias: string): string {
  return Path.join('src', 'elek', alias, 'images');
}

/**
 * Where a Project saves every other binary. Below `public/`, which
 * Astro copies into the build as it is, so they keep a stable URL.
 */
export function defaultPublicDir(alias: string): string {
  return Path.join('public', 'elek', alias, 'assets');
}

/**
 * The extensions Astro's image pipeline understands, mirroring its own
 * VALID_INPUT_FORMATS. `satisfies` ties the list to Astro's public
 * ImageInputFormat, so adding or removing a format there is a compile
 * error here instead of a silent behavior change.
 */
const imageExtensions = {
  avif: true,
  gif: true,
  jpeg: true,
  jpg: true,
  png: true,
  svg: true,
  tiff: true,
  webp: true,
} satisfies Record<ImageInputFormat, true>;

function hasImageExtension(extension: string): boolean {
  return Object.hasOwn(imageExtensions, extension.toLowerCase());
}

/**
 * Astro's marker for "resolve this string as an image import". Astro's
 * own image() schema helper emits the same prefix, the content store
 * picks it up and the runtime replaces the value with the resolved
 * ImageMetadata. See contributing/astro-entry.md.
 */
const IMAGE_IMPORT_PREFIX = '__ASTRO_IMAGE_';

/**
 * Expresses a path below `from` the way Astro wants it: relative and
 * with forward slashes on every platform. Null when the path is not
 * below `from` at all.
 */
function toRelativePosix(from: string, path: string): string | null {
  const relative = Path.relative(from, path);
  if (relative.startsWith('..') || Path.isAbsolute(relative)) {
    return null;
  }
  return relative.split(Path.sep).join('/');
}

/**
 * Astro content loader for elek.io Assets.
 *
 * Reads and saves Assets from a Project and exposes them through
 * Astro's content collection system.
 *
 * @example
 * ```ts
 * // src/content.config.ts
 * import { defineCollection } from 'astro:content';
 * import { elekAssetsLoader } from '@elek-io/core/astro';
 * import { config } from '../elek.config';
 *
 * export const collections = {
 *   assets: defineCollection({
 *     loader: elekAssetsLoader({ config, project: 'website' }),
 *   });
 * };
 * ```
 */
export function elekAssetsLoader<const T extends ElekConfig>(
  props: ElekAssetsLoaderProps<T>
): Loader {
  assertElekConfig(props.config);
  const alias = props.project;
  const { id: projectId } = readDeclaration(props.config, alias);

  /**
   * Reads every Asset of the Project into the store, saving the
   * binaries. Runs on load and again on every change in dev.
   */
  const syncAssets = async (context: LoaderContext): Promise<void> => {
    const core = getCore();
    await ensureProjectAvailable(core, alias, projectId);
    await logReadingProject(core, projectId, (message) =>
      context.logger.info(message)
    );

    // Relative paths belong to the Astro project, not to whatever
    // directory the build was started from
    const root = Url.fileURLToPath(context.config.root);
    const astroPublicDir = Url.fileURLToPath(context.config.publicDir);
    const imageDir = Path.resolve(
      root,
      props.imageDir ?? defaultImageDir(alias)
    );
    const publicDir = Path.resolve(
      root,
      props.publicDir ?? defaultPublicDir(alias)
    );
    context.logger.info(
      `Loading elek.io Assets of Project "${alias}", saving images to "${imageDir}" and every other file to "${publicDir}"`
    );

    const { list: assets, total } = await core.assets.list({
      projectId,
      limit: 0,
    });
    if (total === 0) {
      context.logger.warn('No Assets found');
    } else {
      context.logger.info(`Found ${total} Assets`);
    }

    const seen = new Set<string>();
    for (const asset of assets) {
      seen.add(asset.id);
      const isImage = hasImageExtension(asset.extension);
      const fileName = `${asset.id}.${asset.extension}`;
      const absoluteAssetFilePath = Path.join(
        isImage ? imageDir : publicDir,
        fileName
      );

      // Astro resolves an image relative to the entry's filePath, and
      // serves a public file at its path below the public directory
      const filePath = toRelativePosix(root, absoluteAssetFilePath);
      const publicPath = toRelativePosix(astroPublicDir, absoluteAssetFilePath);

      if (isImage && filePath === null) {
        context.logger.warn(
          `Asset "${asset.id}" is saved outside the Astro project, so it cannot be processed as an image. Point imageDir inside the project to optimize it.`
        );
      }
      if (!isImage && publicPath === null) {
        context.logger.warn(
          `Asset "${asset.id}" is saved outside Astro's public directory, so it is not served. Point publicDir inside it to link this Asset.`
        );
      }

      const data = {
        ...asset,
        absolutePath: absoluteAssetFilePath,
        src:
          isImage && filePath !== null
            ? `${IMAGE_IMPORT_PREFIX}./${fileName}`
            : null,
        href:
          !isImage && publicPath !== null
            ? Path.posix.join(context.config.base, publicPath)
            : null,
      };
      const digest = context.generateDigest(data);

      // Skip unchanged Assets, but only when the file is still on disk -
      // the output directory may have been cleaned since the digest
      // was last stored.
      const existing = context.store.get(asset.id);
      if (
        existing?.digest === digest &&
        (await Fs.pathExists(absoluteAssetFilePath))
      ) {
        continue;
      }

      await Fs.ensureDir(Path.dirname(absoluteAssetFilePath));
      await core.assets.save({
        projectId,
        id: asset.id,
        filePath: absoluteAssetFilePath,
      });

      const parsed = await context.parseData({ id: asset.id, data });
      context.store.set({
        id: asset.id,
        data: parsed,
        digest,
        ...(filePath === null ? {} : { filePath }),
      });
    }

    // Remove store entries for Assets that no longer exist in the Project.
    for (const id of context.store.keys()) {
      if (!seen.has(id)) context.store.delete(id);
    }

    context.logger.info('Finished loading Assets');
  };

  return {
    name: 'elek-assets',
    // Nothing to await, the Asset shape is the same for every Project.
    // The signature is Astro's.
    createSchema: () => {
      return Promise.resolve({
        schema: assetSchema.extend({
          src: z.string().nullable(),
          href: z.string().nullable(),
        }),
        // The schema validates what the loader stores, a marker string.
        // Astro replaces it with the resolved ImageMetadata before a
        // consumer ever sees it, so the declared type is the resolved
        // one. Astro's own image() helper does exactly the same.
        types: [
          `import type { Asset } from '@elek-io/core';`,
          `import type { ImageMetadata } from 'astro';`,
          ``,
          `export type Entry = Asset & {`,
          `  /** The Astro image of an image Asset, null for every other Asset */`,
          `  src: ImageMetadata | null;`,
          `  /** The public URL of every other Asset, null for an image Asset */`,
          `  href: string | null;`,
          `};`,
          ``,
        ].join('\n'),
      });
    },
    load: async (context) => {
      await syncAssets(context);

      // In dev the Desktop app keeps editing the Project, so reload
      // when its Assets change instead of waiting for a restart
      if (context.watcher) {
        const core = getCore();
        watchContent({
          watcher: context.watcher,
          paths: [core.util.pathTo.assets(projectId)],
          onChange: () => syncAssets(context),
          onError: (error) =>
            context.logger.error(
              `Reloading the Assets of Project "${alias}" failed: ${String(error)}`
            ),
        });
      }
    },
  };
}

/**
 * Astro content loader for elek.io Collection Entries.
 *
 * Reads all Entries from a Collection and exposes them through
 * Astro's content collection system.
 *
 * @example
 * ```ts
 * // src/content.config.ts
 * import { defineCollection } from 'astro:content';
 * import { elekEntriesLoader } from '@elek-io/core/astro';
 * import { config } from '../elek.config';
 *
 * export const collections = {
 *   posts: defineCollection({
 *     loader: elekEntriesLoader({
 *       config,
 *       project: 'website',
 *       collectionIdOrSlug: 'posts',
 *     }),
 *   });
 * };
 * ```
 */
export function elekEntriesLoader<const T extends ElekConfig>(
  props: ElekEntriesLoaderProps<T>
): Loader {
  assertElekConfig(props.config);
  const alias = props.project;
  const { id: projectId } = readDeclaration(props.config, alias);

  /**
   * Fingerprint of the content model the schema and types were built
   * from, taken when Astro asked for them. Undefined until then, and in
   * a build it never matters, nothing reloads there.
   */
  let modelDigest: string | undefined;

  /**
   * Reads the Collection, the Project's languages and the Components,
   * which is everything the schema is built from
   */
  const readModel = async (core: ReturnType<typeof getCore>) => {
    const resolvedId = await core.collections.resolveCollectionId({
      projectId,
      idOrSlug: props.collectionIdOrSlug,
    });
    const collection = await core.collections.read({
      projectId,
      id: resolvedId,
    });
    const project = await core.projects.read({ id: projectId });
    const { list: components } = await core.components.list({
      projectId,
      limit: 0,
    });
    const fieldDefinitions = flattenFieldDefinitions(
      collection.fieldDefinitions
    );
    const languages = project.settings.language.supported;

    return {
      resolvedId,
      collection,
      components,
      fieldDefinitions,
      languages,
      digest: buildModelDigest(fieldDefinitions, languages, components),
    };
  };

  /**
   * Reads every Entry of the Collection into the store, returning the
   * resolved Collection id. Runs on load and again on every change in
   * dev.
   *
   * Stops short when the content model no longer matches the schema
   * Astro built at startup. Reloading would validate Entries against a
   * schema that does not describe them any more, which either strips a
   * new field silently or fails on a removed one. Neither is worth
   * doing, and neither is fixable without a restart, so it says so.
   */
  const syncEntries = async (context: LoaderContext): Promise<string> => {
    const core = getCore();
    await ensureProjectAvailable(core, alias, projectId);
    await logReadingProject(core, projectId, (message) =>
      context.logger.info(message)
    );
    const resolvedCollectionId = await core.collections.resolveCollectionId({
      projectId,
      idOrSlug: props.collectionIdOrSlug,
    });

    if (modelDigest !== undefined) {
      const { digest } = await readModel(core);
      if (digest !== modelDigest) {
        context.logger.warn(
          `The content model of Collection "${props.collectionIdOrSlug}" of Project "${alias}" changed. Astro builds a collection's schema and types once, when it loads the content config, so restart the dev server to pick them up. Entries are not reloaded until then.`
        );
        return resolvedCollectionId;
      }
    }

    context.logger.info(
      `Loading elek.io Entries of Collection "${props.collectionIdOrSlug}" of Project "${alias}"`
    );

    const { list: entries, total } = await core.entries.list({
      projectId,
      collectionId: resolvedCollectionId,
      limit: 0,
    });
    if (total === 0) {
      context.logger.warn('No Entries found');
    } else {
      context.logger.info(`Found ${total} Entries`);
    }

    const seen = new Set<string>();
    for (const entry of entries) {
      seen.add(entry.id);
      const values = transformEntryValues(entry.values);
      const digest = context.generateDigest(values);

      // Skip re-validating Entries whose data has not changed.
      const existing = context.store.get(entry.id);
      if (existing?.digest === digest) continue;

      const parsed = await context.parseData({ id: entry.id, data: values });
      context.store.set({ id: entry.id, data: parsed, digest });
    }

    // Remove store entries for Entries that no longer exist in the Collection.
    for (const id of context.store.keys()) {
      if (!seen.has(id)) context.store.delete(id);
    }

    context.logger.info('Finished loading Entries');
    return resolvedCollectionId;
  };

  return {
    name: 'elek-entries',
    createSchema: async () => {
      const core = getCore();
      await ensureProjectAvailable(core, alias, projectId);
      const model = await readModel(core);

      // Remembered so a reload can tell that the model moved on
      modelDigest = model.digest;

      return {
        schema: buildEntryValuesSchema(
          model.fieldDefinitions,
          model.languages,
          model.components
        ),
        types: buildEntryValuesTypeString(
          model.fieldDefinitions,
          model.languages,
          model.components,
          toPascalCase(model.collection.slug.plural)
        ),
      };
    },
    load: async (context) => {
      const resolvedCollectionId = await syncEntries(context);

      // In dev the Desktop app keeps editing the Project, so reload
      // when this Collection's Entries change instead of waiting for a
      // restart. The Components are watched too, not to reload them but
      // to notice a model change that never touches an Entry, like
      // renaming a Component field. Neither path covers .git, so a
      // commit does not trigger a reload by itself.
      if (context.watcher) {
        const core = getCore();
        watchContent({
          watcher: context.watcher,
          paths: [
            core.util.pathTo.entries(projectId, resolvedCollectionId),
            core.util.pathTo.components(projectId),
          ],
          onChange: async () => {
            await syncEntries(context);
          },
          onError: (error) =>
            context.logger.error(
              `Reloading the Entries of Collection "${props.collectionIdOrSlug}" of Project "${alias}" failed: ${String(error)}`
            ),
        });
      }
    },
  };
}
