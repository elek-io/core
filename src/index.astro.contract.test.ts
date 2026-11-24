import { sync } from 'astro';
import Fs from 'fs-extra';
import Path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import core, {
  CONTRACT_FILE_NAME,
  uuid,
  type Collection,
  type Contract,
  type Mapping,
  type StringFieldDefinition,
} from './test/setup.js';
import { contractFileOf, createFakeTheme } from './test/theme.js';
import { createProject, tmpDirPath } from './test/util.js';

/** A text field, which both sides of the Mapping below are built from */
function textField(
  slug: string,
  isRequired: boolean,
  max: number | null = null
): StringFieldDefinition {
  return {
    id: uuid(),
    slug,
    valueType: 'string',
    fieldType: 'text',
    label: { en: slug, de: slug },
    description: null,
    defaultValue: null,
    isRequired,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12',
    min: null,
    max,
  };
}

/** A Value holding one string in both languages */
function text(content: string) {
  return {
    objectType: 'value' as const,
    valueType: 'string' as const,
    content: { en: content, de: content },
  };
}

const themeTitle = textField('title', true, 10);
const themeTeaser = textField('teaser', false);
const siteHeadline = textField('headline', true, 200);
const siteStandfirst = textField('standfirst', false);

/**
 * Own test file on purpose, every sync() spins up a full Astro
 * pipeline in the worker process
 */
describe('a site built on its Contract through astro sync', function () {
  let contract: Contract;
  let themePosts: Collection;
  let siteArticles: Collection;
  let siteProjectId = '';
  const destroy: Array<() => Promise<void>> = [];

  beforeAll(async function () {
    const themeProject = await createProject('Theme of the Contract');
    destroy.push(themeProject.destroy);
    themePosts = await createCollection(themeProject.id, 'post', 'posts', [
      themeTitle,
      themeTeaser,
    ]);
    contract = await core.contracts.generate({
      projectId: themeProject.id,
      name: '@acme/dealer-site',
      version: '1.0.0',
    });

    const siteProject = await createProject('Dealer on its own model');
    destroy.push(siteProject.destroy);
    siteProjectId = siteProject.id;
    siteArticles = await createCollection(
      siteProjectId,
      'article',
      'articles',
      [siteHeadline, siteStandfirst]
    );
    await core.entries.create({
      projectId: siteProjectId,
      collectionId: siteArticles.id,
      values: { headline: text('Golf GTI'), standfirst: text('Fast') },
    });

    const theme = await createFakeTheme();
    await theme.release({ tag: 'v1.0.0', files: contractFileOf(contract) });
    const website = await core.destinations.addWebsite({
      projectId: siteProjectId,
      name: 'autohaus-ebersfelde.de',
      url: theme.url,
    });
    await core.destinations.update({
      projectId: siteProjectId,
      id: website.id,
      mapping: mapping(),
    });
  });

  afterAll(async function () {
    for (const one of destroy) await one();
  });

  function createCollection(
    projectId: string,
    singular: string,
    plural: string,
    fieldDefinitions: StringFieldDefinition[]
  ): Promise<Collection> {
    return core.collections.create({
      projectId,
      icon: 'home',
      name: {
        singular: { en: singular, de: singular },
        plural: { en: plural, de: plural },
      },
      slug: { singular, plural },
      description: { en: plural, de: plural },
      fieldDefinitions,
    });
  }

  /** Every Collection and field of the Contract filled from the Project */
  function mapping(): Mapping {
    return {
      collections: {
        [themePosts.id]: {
          from: { collectionId: siteArticles.id },
          fields: {
            [themeTitle.id]: { fieldDefinitionId: siteHeadline.id },
            [themeTeaser.id]: { fieldDefinitionId: siteStandfirst.id },
          },
        },
      },
    };
  }

  /**
   * An Astro project whose config names the website and imports the
   * `elek.contract.json` beside it, which is the theme's own Contract
   */
  async function writeAstroProject(): Promise<string> {
    const root = tmpDirPath();
    const srcDir = Path.join(root, 'src');
    await Fs.ensureDir(srcDir);
    await Fs.symlink(
      Path.resolve('node_modules'),
      Path.join(root, 'node_modules')
    );
    await Fs.outputFile(
      Path.join(root, CONTRACT_FILE_NAME),
      `${JSON.stringify(contract, null, 2)}\n`
    );

    const entryPath = Path.resolve('src/index.astro.ts').replaceAll('\\', '/');

    await Fs.writeFile(
      Path.join(srcDir, 'content.config.ts'),
      `
import { defineElekConfig, elekCollections } from '${entryPath}';
import contract from '../${CONTRACT_FILE_NAME}';

const config = defineElekConfig({
  projects: {
    website: {
      id: '${siteProjectId}',
      destination: 'autohaus-ebersfelde.de',
    },
  },
  contract,
});

export const collections = {
  ...(await elekCollections(config, { collections: { website: ['posts'] } })),
};
`
    );

    return root;
  }

  it('gives the site the Contract key and the Contract field slugs', async function () {
    const root = await writeAstroProject();
    const cacheDir = Path.join(root, '.cache');

    await sync({ root, configFile: false, logLevel: 'info', cacheDir });

    // The Contract's plural slug names the collection, so the site's code
    // never names the Project's own "articles"
    const types = await Fs.readFile(
      Path.join(root, '.astro', 'content.d.ts'),
      'utf-8'
    );
    expect(types).toContain('websitePosts');
    expect(types).not.toContain('websiteArticles');

    // Astro validated these against the schema the Contract built, so the
    // keys a page reads are the Contract's
    const store = await Fs.readFile(
      Path.join(cacheDir, 'data-store.json'),
      'utf-8'
    );
    expect(store).toContain('title');
    expect(store).toContain('Golf GTI');
    expect(store).not.toContain('headline');
  });

  it('fails the build naming the Entry the Contract refuses', async function () {
    const tooLong = await core.entries.create({
      projectId: siteProjectId,
      collectionId: siteArticles.id,
      values: {
        headline: text('Tiguan Allspace R-Line'),
        standfirst: text('Too long for the theme'),
      },
    });
    const root = await writeAstroProject();

    const error = await sync({
      root,
      configFile: false,
      logLevel: 'info',
      cacheDir: Path.join(root, '.cache'),
    }).then(
      () => null,
      (caught: unknown) => caught
    );

    expect(String(error)).toContain(
      `Entry "${tooLong.id}", field "title" in "en"`
    );
    expect(String(error)).toContain('<=10 characters');
  });
});
