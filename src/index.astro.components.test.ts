import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sync } from 'astro';
import Os from 'node:os';
import Path from 'node:path';
import Fs from 'fs-extra';
import core, { uuid } from './test/setup.js';
import { createProject } from './test/util.js';
import type { Collection, Component, Project } from './index.node.js';

/**
 * Own test file on purpose, every sync() spins up a full Astro
 * pipeline in the worker process.
 *
 * Covers a polymorphic dynamic field end to end: the loader transforms
 * every item, Astro validates it against the schema the same loader
 * built and stores the result. The two are built from the same
 * Components but by different code, so a disagreement about the item
 * shape fails the sync rather than showing up in a site.
 */
describe('Dynamic field items through astro sync', function () {
  let project: Project & { destroy: () => Promise<void> };
  let hero: Component;
  let quote: Component;
  let pages: Collection;
  let root: string;
  let cacheDir: string;

  /** Component with a single required text field of the given slug */
  async function createTextComponent(slug: string, fieldSlug: string) {
    return core.components.create({
      projectId: project.id,
      name: { en: slug, de: slug },
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

    // One item per allowed Component, which is the page-builder shape a
    // site has to dispatch on
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

  it('should store every item under the slug of its Component', async function () {
    // Read as text on purpose. The store is a flat graph of
    // deduplicated values, so an item's keys are read from its shape
    // and the slugs from the values the graph holds.
    const store = await Fs.readFile(
      Path.join(cacheDir, 'data-store.json'),
      'utf-8'
    );

    const items = store.match(
      /\{"id":\d+,"componentId":\d+,"componentSlug":\d+,"values":\d+\}/g
    );
    expect(items).toHaveLength(2);
    expect(store).toContain('"hero"');
    expect(store).toContain('"quote"');
    expect(store).toContain(`"${hero.id}"`);
    expect(store).toContain(`"${quote.id}"`);
  });

  it('should generate an item type discriminated on the Component slug', async function () {
    const types = await Fs.readFile(
      Path.join(root, '.astro', 'loaders', 'websitePages.ts'),
      'utf-8'
    );

    expect(types).toContain(
      `| { id: string; componentId: "${hero.id}"; componentSlug: "hero"; values: HeroComponentValues }`
    );
    expect(types).toContain(
      `| { id: string; componentId: "${quote.id}"; componentSlug: "quote"; values: QuoteComponentValues }`
    );
  });
});
