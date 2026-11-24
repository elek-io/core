import type { ImageInputFormat } from 'astro';
import type { Loader, LoaderContext } from 'astro/loaders';
import { z } from '@hono/zod-openapi';
import Path from 'node:path';
import Url from 'node:url';
import Fs from 'fs-extra';
import {
  assetSchema,
  CoreError,
  flattenFieldDefinitions,
} from '../index.node.js';
import type { CollectionFile } from '../schema/collectionSchema.js';
import {
  makeComponentsContext,
  type Component,
} from '../schema/componentSchema.js';
import type { Entry } from '../schema/entrySchema.js';
import type { FieldDefinition } from '../schema/fieldSchema.js';
import type { ProjectLanguages } from '../schema/projectSchema.js';
import {
  contractValuesOf,
  entryIssuesOf,
  isValueIssue,
  mappingIssuesOf,
} from '../util/destinationCheck.js';
import type { DestinationIssue } from '../util/destinationIssue.js';
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
import {
  contractCollectionOf,
  readSiteContract,
  type SiteContract,
} from './siteContract.js';
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
  /**
   * The Collection's id or its plural slug, the pair `resolveCollectionId`
   * accepts and the slug the derived collection key is built from. A miss
   * throws `NotFound` while the collection loads, not at config time.
   */
  collectionIdOrSlug: string;
}

/**
 * Where a Project saves its image binaries when the loader is left to decide.
 * Below `src/` so `astro:assets` can pick them up, and per alias so two
 * Projects never write into the same directory.
 *
 * Exported for this file's tests. Nothing re-exports it, so it is not part of
 * the astro entry's surface.
 */
export function defaultImageDir(alias: string): string {
  return Path.join('src', 'elek', alias, 'images');
}

/**
 * Where a Project saves every other binary. Below `public/`, which Astro
 * copies into the build as it is, so they keep a stable URL.
 *
 * Exported for this file's tests, the same as `defaultImageDir` above.
 */
export function defaultPublicDir(alias: string): string {
  return Path.join('public', 'elek', alias, 'assets');
}

/**
 * The extensions Astro's image pipeline processes, mirroring its own
 * VALID_SUPPORTED_FORMATS. `apng` is in its input list from 7.2.5 on and in
 * that one on no release, so it is false here and takes the non-image route.
 *
 * `Record<ImageInputFormat, boolean>` ties the keys to Astro's public type,
 * and the index signature beside it holds a format the floor does not know.
 *
 * @see ../../contributing/astro-entry.md
 */
const imageExtensions: Record<ImageInputFormat, boolean> &
  Record<string, boolean> = {
  apng: false,
  avif: true,
  gif: true,
  jpeg: true,
  jpg: true,
  png: true,
  svg: true,
  tiff: true,
  webp: true,
};

/**
 * Whether Astro's image pipeline processes this extension.
 *
 * An extension it does not strips the marker and leaves a relative path
 * nothing resolves, and one it only accepts as an input fails the image
 * service, see `../../contributing/astro-entry.md`.
 *
 * Exported for this file's tests. Nothing re-exports it, so it is not part of
 * the astro entry's surface.
 */
export function hasImageExtension(extension: string): boolean {
  return imageExtensions[extension.toLowerCase()] === true;
}

/**
 * The store id the one Entry of a Single Entry is kept under, so a site
 * reads it with `getEntry("<alias><Slug>", "single")` rather than looking an
 * id up. A Collection holding a list keeps every Entry under its own id.
 *
 * Exported for this file's tests. Nothing re-exports it, so it is not part of
 * the astro entry's surface, and `docs/usage.md` names the string itself.
 */
export const SINGLE_ENTRY_ID = 'single';

/**
 * Astro's marker for "resolve this string as an image import". Astro's
 * own image() schema helper emits the same prefix, the content store
 * picks it up and the runtime replaces the value with the resolved
 * ImageMetadata.
 *
 * @see ../../contributing/astro-entry.md
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
 * Astro content loader for elek.io Assets, which also writes their binaries
 * into the Astro project as it loads: images below `imageDir` so
 * `astro:assets` processes them, everything else below `publicDir` so Astro
 * serves it. Both default to a directory named after the Project's alias.
 *
 * An Asset landing outside those directories is still stored, with `src` or
 * `href` null and a warning, rather than failing the build.
 *
 * @see ../../docs/usage.md
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
 * What one sync of a collection reads: where the Entries come from, what the
 * schema and the types describe, and what the site reads them through.
 */
interface EntriesPlan {
  /**
   * The Collection of the Project the Entries come from, undefined where a
   * Mapping fills the Contract's Collection from nothing
   */
  source: CollectionFile | undefined;
  /** Whether the collection holds the one Entry a site reads under `single` */
  isSingleEntry: boolean;
  /** The field definitions the schema and the types describe */
  fieldDefinitions: FieldDefinition[];
  /** The Components those field definitions name */
  components: readonly Component[];
  /** The languages every translatable Value is keyed by */
  languages: ProjectLanguages;
  /** The plural slug Astro names the collection and its `Entry` type after */
  pluralSlug: string;
  /** What the site reads through, absent where it reads a Project's own */
  through: (SiteContract & { collection: CollectionFile }) | undefined;
  /** Fingerprint of everything a reload cannot rebuild */
  digest: string;
}

/**
 * Astro content loader for elek.io Collection Entries, which also supplies
 * Astro with the Collection's schema and its generated `Entry` type, built
 * from the content model once, when Astro loads the content config. A Single
 * Entry's one Entry goes under `single`, nothing while it holds none. A
 * Project declared with a `destination` is read in the shape of the site's
 * own Contract, and whatever does not fit it stops the build. In dev it
 * reloads Entries as they change, and a model change asks for a restart of
 * the dev server instead.
 *
 * @see ../../docs/usage.md
 */
export function elekEntriesLoader<const T extends ElekConfig>(
  props: ElekEntriesLoaderProps<T>
): Loader {
  assertElekConfig(props.config);
  const alias = props.project;
  const { id: projectId, destination } = readDeclaration(props.config, alias);
  /**
   * Whether the site reads this Project through a Destination, which takes
   * the collection's slug from the site's own Contract and the Project's
   * Collection from the Mapping rather than from a slug of the Project.
   */
  const readsContract = destination !== undefined;
  const restartMessage = `The content model of Collection "${props.collectionIdOrSlug}" of Project "${alias}" changed. Astro builds a collection's schema and types once, when it loads the content config, so restart the dev server to pick them up. Entries are not reloaded until then.`;

  /**
   * Fingerprint of the content model the schema and types were built
   * from, taken when Astro asked for them. Undefined until then, and in
   * a build it never matters, nothing reloads there.
   */
  let modelDigest: string | undefined;
  /**
   * The Collection of the Project the schema was built against. Astro names
   * the collection after a plural slug, so a reload that resolves to another
   * Collection, or to none, needs a restart just like a model change.
   */
  let collectionId: string | undefined;

  /**
   * Everything one sync reads, which is the Collection, the Project's
   * languages and the Components without a Destination, and the site's own
   * Contract and the Mapping with one.
   *
   * Takes the resolved Collection id of a caller that resolved it already,
   * which also keeps this from throwing `NotFound` on a Collection renamed
   * since.
   */
  const readPlan = async (
    core: ReturnType<typeof getCore>,
    knownCollectionId?: string
  ): Promise<EntriesPlan> => {
    const project = await core.projects.read({ id: projectId });
    const languages = project.settings.language.supported;
    const site = await readSiteContract({ core, config: props.config, alias });

    if (site !== undefined) {
      const collection = contractCollectionOf(
        site.contract,
        props.collectionIdOrSlug
      );
      const mapped = site.destination.mapping.collections[collection.id];
      // A Mapping naming a Collection the Project dropped fills nothing,
      // which the check reports rather than failing to read here
      const source =
        mapped === undefined
          ? undefined
          : await core.collections
              .read({ projectId, id: mapped.from.collectionId })
              .catch((error: unknown) => {
                if (error instanceof CoreError && error.type === 'NotFound') {
                  return undefined;
                }
                throw error;
              });
      const fieldDefinitions = flattenFieldDefinitions(
        collection.fieldDefinitions
      );
      return {
        source,
        isSingleEntry: collection.isSingleEntry,
        fieldDefinitions,
        components: site.contract.components,
        languages,
        pluralSlug: collection.slug.plural,
        through: { ...site, collection },
        digest: buildModelDigest(
          fieldDefinitions,
          languages,
          site.contract.components,
          { mapped, source }
        ),
      };
    }

    const resolvedId =
      knownCollectionId ??
      (await core.collections.resolveCollectionId({
        projectId,
        idOrSlug: props.collectionIdOrSlug,
      }));
    const collection = await core.collections.read({
      projectId,
      id: resolvedId,
    });
    const { list: components } = await core.components.list({
      projectId,
      limit: 0,
    });
    const fieldDefinitions = flattenFieldDefinitions(
      collection.fieldDefinitions
    );
    return {
      source: collection,
      isSingleEntry: collection.isSingleEntry,
      fieldDefinitions,
      components,
      languages,
      pluralSlug: collection.slug.plural,
      through: undefined,
      digest: buildModelDigest(fieldDefinitions, languages, components),
    };
  };

  /**
   * Throws `BadRequest` naming every Collection, field and Entry the site's
   * Contract does not find in the Project, and why, in one error rather than
   * on the first one it meets.
   *
   * Only this Collection's half of the Mapping is read, because every other
   * Collection of the Contract is its own derived collection's to report.
   */
  const assertFits = (
    through: NonNullable<EntriesPlan['through']>,
    source: CollectionFile | undefined,
    entries: readonly Entry[],
    languages: ProjectLanguages
  ): void => {
    const mine = (issue: DestinationIssue): boolean => {
      return issue.contractCollectionId === through.collection.id;
    };
    const issues: DestinationIssue[] = mappingIssuesOf({
      destinationId: through.destination.id,
      contract: through.contract,
      mapping: through.destination.mapping,
      collections: source === undefined ? [] : [source],
    }).filter(mine);
    if (source !== undefined) {
      for (const entry of entries) {
        issues.push(
          ...entryIssuesOf({
            destinationId: through.destination.id,
            contract: through.contract,
            mapping: through.destination.mapping,
            collection: source,
            entry,
            languages,
          }).filter(mine)
        );
      }
    }
    if (issues.length === 0) {
      return;
    }
    const at =
      through.versionInUse === through.contract.version
        ? `version ${through.contract.version}`
        : `version ${through.contract.version} while the website uses ${through.versionInUse}`;
    // A Value issue carries zod's own wording, which says what is wrong
    // without saying where, so the field and the language go in front of it
    const named = issues.map((issue) => {
      if (isValueIssue(issue) === false) {
        return `- ${issue.message}`;
      }
      const language =
        issue.language === undefined ? '' : ` in "${issue.language}"`;
      return `- Entry "${issue.entryId}", field "${issue.contractFieldSlug}"${language}: ${issue.message}`;
    });
    throw CoreError.badRequest(
      `Collection "${through.collection.slug.plural}" of the Contract "${through.contract.name}" at ${at} is not filled by Project "${alias}" through Destination "${through.destination.name}":\n${named.join('\n')}`
    );
  };

  /**
   * Reads every Entry of the Collection into the store, returning the
   * Collection of the Project they came from. Runs on load and again on
   * every change in dev.
   *
   * Stops short when the content model no longer matches the schema
   * Astro built at startup. Reloading would validate Entries against a
   * schema that does not describe them any more, which either strips a
   * new field silently or fails on a removed one. Neither is worth
   * doing, and neither is fixable without a restart, so it says so.
   */
  const syncEntries = async (
    context: LoaderContext,
    isReload = false
  ): Promise<string | undefined> => {
    const core = getCore();
    await ensureProjectAvailable(core, alias, projectId);
    await logReadingProject(core, projectId, (message) =>
      context.logger.info(message)
    );
    let knownCollectionId: string | undefined;
    if (readsContract === false && collectionId !== undefined) {
      const current = await core.collections
        .resolveCollectionId({ projectId, idOrSlug: props.collectionIdOrSlug })
        .catch((error: unknown) => {
          if (error instanceof CoreError && error.type === 'NotFound') {
            return null;
          }
          throw error;
        });
      if (current !== collectionId) {
        context.logger.warn(
          `Collection "${props.collectionIdOrSlug}" of Project "${alias}" was renamed or replaced. Astro names a collection after the plural slug when it loads the content config, so restart the dev server to pick it up. Entries are not reloaded until then.`
        );
        return collectionId;
      }
      knownCollectionId = collectionId;
    }

    // Read after the guard above, never before: transforming an Entry
    // needs the Components to name each item's Component, and resolving
    // the Collection again here would throw rather than warn
    let plan: EntriesPlan;
    try {
      plan = await readPlan(core, knownCollectionId);
    } catch (error) {
      // On a reload the Destination or the site's own Contract moved under
      // the schema and the types Astro built once, which needs a restart
      // just as a model change does
      if (isReload && error instanceof CoreError && error.type === 'NotFound') {
        context.logger.warn(restartMessage);
        return collectionId;
      }
      throw error;
    }
    if (modelDigest !== undefined && plan.digest !== modelDigest) {
      context.logger.warn(restartMessage);
      return collectionId;
    }
    const componentsContext = makeComponentsContext(plan.components);

    context.logger.info(
      `Loading elek.io Entries of Collection "${props.collectionIdOrSlug}" of Project "${alias}"`
    );

    const source = plan.source;
    const read =
      source === undefined
        ? { list: [], total: 0 }
        : await core.entries.list({
            projectId,
            collectionId: source.id,
            limit: 0,
          });
    const entries: Entry[] = read.list;
    if (read.total === 0) {
      context.logger.warn('No Entries found');
    } else {
      context.logger.info(`Found ${read.total} Entries`);
    }

    // Before anything is stored, so a site never goes live with half a
    // Collection the website cannot take
    const through = plan.through;
    if (through !== undefined) {
      assertFits(through, source, entries, plan.languages);
    }

    // A Single Entry holds one Entry, which the site reads without knowing
    // its id. `entries.create` refuses a second one while the Collection
    // holds one, which a pull, a merge or two unserialized creates get past,
    // so the rest is left out rather than overwriting the one the site reads
    const loaded = plan.isSingleEntry ? entries.slice(0, 1) : entries;
    if (loaded.length < entries.length) {
      const holding =
        through === undefined
          ? `Collection "${props.collectionIdOrSlug}" of Project "${alias}" is a Single Entry holding ${entries.length} Entries`
          : `Collection "${plan.pluralSlug}" of the Contract "${through.contract.name}" is a Single Entry and the Collection of Project "${alias}" filling it holds ${entries.length} Entries`;
      context.logger.warn(
        `${holding}, of which the site reads the first. Creating an Entry there is refused while it holds one, so a sync of two editors' work can leave two, as can two creates at once. Delete the ones the site should not read.`
      );
    }

    const seen = new Set<string>();
    for (const entry of loaded) {
      const storeId = plan.isSingleEntry ? SINGLE_ENTRY_ID : entry.id;
      seen.add(storeId);
      // Read in the Contract's shape where the site names a Destination, so
      // the site's code never names the Project's own slugs
      const values = transformEntryValues(
        through === undefined || source === undefined
          ? entry.values
          : contractValuesOf({
              contract: through.contract,
              mapping: through.destination.mapping,
              contractCollectionId: through.collection.id,
              collection: source,
              entry,
              languages: plan.languages,
            }),
        componentsContext,
        entry.id
      );
      const digest = context.generateDigest(values);

      // Skip re-validating Entries whose data has not changed.
      const existing = context.store.get(storeId);
      if (existing?.digest === digest) continue;

      const parsed = await context.parseData({ id: storeId, data: values });
      context.store.set({ id: storeId, data: parsed, digest });
    }

    // Remove store entries for Entries that no longer exist in the Collection.
    for (const id of context.store.keys()) {
      if (!seen.has(id)) context.store.delete(id);
    }

    context.logger.info('Finished loading Entries');
    return source?.id;
  };

  return {
    name: 'elek-entries',
    createSchema: async () => {
      const core = getCore();
      await ensureProjectAvailable(core, alias, projectId);
      const plan = await readPlan(core);

      // Remembered so a reload can tell that the model moved on
      modelDigest = plan.digest;
      collectionId = plan.source?.id;

      return {
        schema: buildEntryValuesSchema(
          plan.fieldDefinitions,
          plan.languages,
          plan.components
        ),
        types: buildEntryValuesTypeString(
          plan.fieldDefinitions,
          plan.languages,
          plan.components,
          toPascalCase(plan.pluralSlug)
        ),
      };
    },
    load: async (context) => {
      const sourceCollectionId = await syncEntries(context);

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
            ...(sourceCollectionId === undefined
              ? []
              : [core.util.pathTo.entries(projectId, sourceCollectionId)]),
            core.util.pathTo.components(projectId),
          ],
          onChange: async () => {
            await syncEntries(context, true);
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
