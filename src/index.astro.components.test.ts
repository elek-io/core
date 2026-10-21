import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sync } from 'astro';
import Os from 'node:os';
import Path from 'node:path';
import Fs from 'fs-extra';
import core, { uuid } from './test/setup.js';
import { createProject, ensureCleanGitStatus } from './test/util.js';
import type { Collection, Component, Project } from './index.node.js';

/**
 * Own test file on purpose, every sync() spins up a full Astro pipeline in
 * the worker process.
 *
 * Covers a `dynamic` field whose items name their Component, end to end: the
 * loader transforms every item, Astro validates it against the schema the
 * same loader built and stores the result. The transform and the schema are
 * two walks over one Component list, so a disagreement about the item shape
 * fails the sync rather than showing up in a site.
 *
 * @see ../contributing/testing.md
 */
describe('Dynamic field items through astro sync', function () {
  let project: Project & { destroy: () => Promise<void> };
  let hero: Component;
  let quote: Component;
  let pages: Collection;
  let root: string;
  let cacheDir: string;

  /** A Component with a single required text field of the given slug. */
  function createTextComponent(slug: string, fieldSlug: string) {
    return core.components.create({
      projectId: project.id,
      name: { en: 'A Component', de: 'A Component' },
      slug,
      description: null,
      fieldDefinitions: [
        {
          id: uuid(),
          slug: fieldSlug,
          valueType: 'string',
          fieldType: 'text',
          label: { en: fieldSlug, de: fieldSlug },
          description: null,
          isRequired: true,
          isDisabled: false,
          isUnique: false,
          inputWidth: '12',
          min: null,
          max: null,
          defaultValue: null,
        },
      ],
    });
  }

  /** Astro's content store, read as text: a flat graph of shared values. */
  function readStore() {
    return Fs.readFile(Path.join(cacheDir, 'data-store.json'), 'utf-8');
  }

  /**
   * The Component id and slug of every stored item, in order. The store
   * deduplicates every value into one array and holds indices into it, so
   * an item's keys are read from its shape and its values are resolved.
   */
  async function storedItemComponents(): Promise<unknown[][]> {
    const store = await readStore();
    const graph = JSON.parse(store) as unknown[];
    const items = [
      ...store.matchAll(
        /\{"id":\d+,"componentId":(\d+),"componentSlug":(\d+),"values":\d+\}/g
      ),
    ];
    return items.map((item) => [
      graph[Number(item[1])],
      graph[Number(item[2])],
    ]);
  }

  /** The TypeScript the Entries loader handed Astro for the Collection. */
  function readGeneratedTypes() {
    return Fs.readFile(
      Path.join(root, '.astro', 'loaders', 'websitePages.ts'),
      'utf-8'
    );
  }

  beforeAll(async function () {
    project = await createProject('Astro Component Items Test');
    hero = await createTextComponent('hero', 'headline');
    quote = await createTextComponent('quote', 'text');

    pages = await core.collections.create({
      projectId: project.id,
      icon: 'home',
      name: {
        singular: { en: 'Page', de: 'Page' },
        plural: { en: 'Pages', de: 'Pages' },
      },
      slug: { singular: 'page', plural: 'pages' },
      description: { en: 'Pages', de: 'Pages' },
      fieldDefinitions: [
        {
          id: uuid(),
          slug: 'sections',
          valueType: 'component',
          fieldType: 'dynamic',
          label: { en: 'Sections', de: 'Sections' },
          description: null,
          isRequired: false,
          isDisabled: false,
          isUnique: false,
          inputWidth: '12',
          ofComponents: [hero.id, quote.id],
          min: null,
          max: null,
        },
      ],
    });

    // One item per allowed Component, the page builder shape a site has
    // to dispatch over
    await core.entries.create({
      projectId: project.id,
      collectionId: pages.id,
      values: {
        sections: {
          objectType: 'value',
          valueType: 'component',
          content: [
            {
              id: uuid(),
              componentId: hero.id,
              values: {
                headline: {
                  objectType: 'value',
                  valueType: 'string',
                  content: { en: 'Welcome', de: 'Willkommen' },
                },
              },
            },
            {
              id: uuid(),
              componentId: quote.id,
              values: {
                text: {
                  objectType: 'value',
                  valueType: 'string',
                  content: { en: 'Quoted', de: 'Zitiert' },
                },
              },
            },
          ],
        },
      },
    });

    root = Path.join(Os.tmpdir(), `elek-io-core-test-${uuid()}`);
    const srcDir = Path.join(root, 'src');
    await Fs.ensureDir(srcDir);
    await Fs.symlink(
      Path.resolve('node_modules'),
      Path.join(root, 'node_modules')
    );

    const entryPath = Path.resolve('src/index.astro.ts').replaceAll('\\', '/');
    await Fs.writeFile(
      Path.join(srcDir, 'content.config.ts'),
      `
import { defineElekConfig, elekCollections } from '${entryPath}';

const config = defineElekConfig({
  projects: {
    website: { id: '${project.id}' },
  },
});

export const collections = {
  ...(await elekCollections(config, { collections: { website: ['pages'] } })),
};
`
    );

    // Astro's content store would otherwise land in node_modules,
    // which every test root shares through its symlink
    cacheDir = Path.join(root, '.cache');
    await sync({ root, configFile: false, logLevel: 'info', cacheDir });
  }, 120000);

  afterAll(async function () {
    await project.destroy();
    await Fs.remove(root);
  }, 60000);

  it('should store every item under the slug of its Component', async function ({
    task,
  }) {
    // Each item carries the slug and the id, so a site dispatches on the
    // name and still addresses the same Component through Core, the local
    // API or the types the CLI generates
    expect(await storedItemComponents()).toEqual([
      [hero.id, 'hero'],
      [quote.id, 'quote'],
    ]);

    // The loaders derive the slug on every sync and write nothing back, so
    // upgrading migrates no content
    await ensureCleanGitStatus(task, project.id);
  }, 30000);

  it('should generate an item type discriminated on the Component slug', async function () {
    const types = await readGeneratedTypes();

    expect(types).toContain(
      `| { id: string; componentId: "${hero.id}"; componentSlug: "hero"; values: HeroComponentValues }`
    );
    expect(types).toContain(
      `| { id: string; componentId: "${quote.id}"; componentSlug: "quote"; values: QuoteComponentValues }`
    );
  }, 30000);

  /**
   * Runs last, it is the only test that changes the Project, and it syncs
   * again into the same cache.
   */
  it('should carry the new name after a Component was renamed', async function () {
    // What a build after a rename has to survive. The stored item names
    // its Component, so the digest the loader compares has to change with
    // the slug, otherwise the site keeps rendering the old name until the
    // cache is cleared by hand
    await core.components.update({
      projectId: project.id,
      id: hero.id,
      name: hero.name,
      slug: 'banner',
      description: hero.description,
      fieldDefinitions: hero.fieldDefinitions,
    });

    await sync({ root, configFile: false, logLevel: 'info', cacheDir });

    expect(await storedItemComponents()).toEqual([
      [hero.id, 'banner'],
      [quote.id, 'quote'],
    ]);
    expect(await readStore()).not.toContain('"hero"');
  }, 120000);
});
