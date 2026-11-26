import Fs from 'fs-extra';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from 'vitest';
import { createLoaderContext } from '../test/astro.js';
import core, {
  CoreError,
  flattenFieldDefinitions,
  uuid,
  type Collection,
  type Contract,
  type EntryFieldDefinition,
  type Mapping,
  type StringFieldDefinition,
} from '../test/setup.js';
import { contractFileOf, createFakeTheme } from '../test/theme.js';
import { createProject, expectCoreError, tmpDirPath } from '../test/util.js';
import { elekCollections } from './collections.js';
import { elekEntriesLoader } from './loaders.js';
import { buildEntryValuesSchema } from './schema.js';
import { contractCollectionOf } from './siteContract.js';

/** A text field, which both sides of a Mapping are built from here */
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

/** An optional Entry reference, pointed at its own Collection after creation */
function entryField(slug: string): EntryFieldDefinition {
  return {
    id: uuid(),
    slug,
    valueType: 'reference',
    fieldType: 'entry',
    label: { en: slug, de: slug },
    description: null,
    isRequired: false,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12',
    min: null,
    max: null,
    ofCollections: [],
  };
}

const themeTitle = textField('title', true, 10);
const themeTeaser = textField('teaser', false);
const themeRelated = entryField('related');
const themePhone = textField('phone', true);
const siteHeadline = textField('headline', true, 200);
const siteStandfirst = textField('standfirst', false);
const siteSeeAlso = entryField('see-also');
const siteTelephone = textField('telephone', true);

/** A Value holding one string in both languages, or nothing in either */
function text(content: string | null) {
  return {
    objectType: 'value' as const,
    valueType: 'string' as const,
    content: { en: content, de: content },
  };
}

/** A Value pointing at Entries of one Collection, in both languages */
function references(collectionId: string, ids: string[]) {
  const content = ids.map((id) => ({
    objectType: 'entry' as const,
    id,
    collectionId,
  }));
  return {
    objectType: 'value' as const,
    valueType: 'reference' as const,
    content: { en: content, de: content },
  };
}

/**
 * A Project's Collection and, where a field points at Entries, that
 * Collection itself, which is what a Contract needs to be generated from it
 */
async function createCollectionOf(props: {
  projectId: string;
  slug: { singular: string; plural: string };
  fieldDefinitions: Array<StringFieldDefinition | EntryFieldDefinition>;
  isSingleEntry?: boolean;
}): Promise<Collection> {
  const created = await core.collections.create({
    projectId: props.projectId,
    icon: 'home',
    ...(props.isSingleEntry === undefined
      ? {}
      : { isSingleEntry: props.isSingleEntry }),
    name: {
      singular: { en: props.slug.singular, de: props.slug.singular },
      plural: { en: props.slug.plural, de: props.slug.plural },
    },
    slug: props.slug,
    description: { en: props.slug.plural, de: props.slug.plural },
    fieldDefinitions: props.fieldDefinitions,
  });
  const points = props.fieldDefinitions.some((field) => {
    return field.valueType === 'reference';
  });
  if (points === false) {
    return created;
  }
  return core.collections.update({
    projectId: props.projectId,
    id: created.id,
    icon: created.icon,
    name: created.name,
    description: created.description,
    slug: created.slug,
    fieldDefinitions: created.fieldDefinitions.map((field) =>
      'ofCollections' in field
        ? { ...field, ofCollections: [created.id] }
        : field
    ),
  });
}

/**
 * A theme whose Contract was generated from a Project of its own, and a
 * second Project on different Collection and field slugs that a Mapping
 * points at it, which is what a launch customer's own content model is.
 */
describe('a site reading its Entries through its own Contract', function () {
  let contract: Contract;
  let themePosts: Collection;
  let themeContacts: Collection;
  let siteArticles: Collection;
  let siteImprint: Collection;
  let siteProjectId = '';
  let websiteId = '';
  let firstEntryId = '';
  let secondEntryId = '';
  const destroy: Array<() => Promise<void>> = [];

  beforeAll(async function () {
    const themeProject = await createProject('Theme of the Contract');
    destroy.push(themeProject.destroy);
    themePosts = await createCollectionOf({
      projectId: themeProject.id,
      slug: { singular: 'post', plural: 'posts' },
      fieldDefinitions: [themeTitle, themeTeaser, themeRelated],
    });
    themeContacts = await createCollectionOf({
      projectId: themeProject.id,
      slug: { singular: 'contact-details', plural: 'contact-details' },
      fieldDefinitions: [themePhone],
      isSingleEntry: true,
    });
    contract = await core.contracts.generate({
      projectId: themeProject.id,
      name: '@acme/dealer-site',
      version: '1.0.0',
    });

    const siteProject = await createProject('Dealer on its own model');
    destroy.push(siteProject.destroy);
    siteProjectId = siteProject.id;
    siteArticles = await createCollectionOf({
      projectId: siteProjectId,
      slug: { singular: 'article', plural: 'articles' },
      fieldDefinitions: [siteHeadline, siteStandfirst, siteSeeAlso],
    });
    siteImprint = await createCollectionOf({
      projectId: siteProjectId,
      slug: { singular: 'imprint', plural: 'imprints' },
      fieldDefinitions: [siteTelephone],
      isSingleEntry: true,
    });

    const first = await core.entries.create({
      projectId: siteProjectId,
      collectionId: siteArticles.id,
      values: {
        headline: text('Golf GTI'),
        standfirst: text(null),
        'see-also': references(siteArticles.id, []),
      },
    });
    firstEntryId = first.id;
    const second = await core.entries.create({
      projectId: siteProjectId,
      collectionId: siteArticles.id,
      values: {
        headline: text('Polo'),
        standfirst: text('Small and cheap'),
        'see-also': references(siteArticles.id, [first.id]),
      },
    });
    secondEntryId = second.id;
    await core.entries.create({
      projectId: siteProjectId,
      collectionId: siteImprint.id,
      values: { telephone: text('030 123456') },
    });

    const theme = await createFakeTheme();
    await theme.release({ tag: 'v1.0.0', files: contractFileOf(contract) });
    const website = await core.destinations.addWebsite({
      projectId: siteProjectId,
      name: 'autohaus-ebersfelde.de',
      url: theme.url,
    });
    websiteId = website.id;
    await core.destinations.update({
      projectId: siteProjectId,
      id: websiteId,
      mapping: fullMapping(),
    });
  });

  afterAll(async function () {
    for (const one of destroy) await one();
  });

  /**
   * Every Collection and field of the Contract filled from the Project,
   * minus the one an `omit` names, which is how a test narrows a Mapping an
   * editor has not finished.
   */
  function mappingWithout(omit?: {
    collection?: string;
    field?: string;
  }): Mapping {
    const pairs: Array<[string, string]> = [
      [themeTitle.id, siteHeadline.id],
      [themeTeaser.id, siteStandfirst.id],
      [themeRelated.id, siteSeeAlso.id],
    ];
    const fields: Mapping['collections'][string]['fields'] = {};
    for (const [contractField, projectField] of pairs) {
      if (contractField === omit?.field) continue;
      fields[contractField] = {
        fill: 'field',
        fieldDefinitionId: projectField,
      };
    }
    const collections: Mapping['collections'] = {
      [themeContacts.id]: {
        from: { collectionId: siteImprint.id, where: [] },
        fields: {
          [themePhone.id]: {
            fill: 'field',
            fieldDefinitionId: siteTelephone.id,
          },
        },
      },
    };
    if (omit?.collection !== themePosts.id) {
      collections[themePosts.id] = {
        from: { collectionId: siteArticles.id, where: [] },
        fields,
      };
    }
    return { collections };
  }

  /** Every Collection and field of the Contract filled from the Project */
  function fullMapping(): Mapping {
    return mappingWithout();
  }

  /**
   * Runs the Entries loader the way a build does, with the site's own
   * Contract where one is given, and validates what it stores against the
   * schema the Contract builds, which is what Astro's own parseData does.
   */
  async function buildSite(options: {
    collectionIdOrSlug: string;
    contract?: Contract;
    destination?: string;
  }) {
    const given = options.contract;
    const schema =
      given === undefined
        ? undefined
        : buildEntryValuesSchema(
            flattenFieldDefinitions(
              contractCollectionOf(given, options.collectionIdOrSlug)
                .fieldDefinitions
            ),
            ['en', 'de'],
            given.components
          );
    const { context, lines, store } = createLoaderContext({
      root: tmpDirPath(),
      ...(schema === undefined
        ? {}
        : { parse: (data: unknown) => schema.parseAsync(data) }),
    });
    const loader = elekEntriesLoader({
      config: {
        projects: {
          website: {
            id: siteProjectId,
            ...(options.destination === undefined
              ? {}
              : { destination: options.destination }),
          },
        },
        ...(given === undefined ? {} : { contract: given }),
      },
      project: 'website',
      collectionIdOrSlug: options.collectionIdOrSlug,
    });
    const built =
      'createSchema' in loader && loader.createSchema !== undefined
        ? await loader.createSchema()
        : undefined;
    const load = () => loader.load(context);
    return { lines, store, load, types: built?.types ?? '' };
  }

  /**
   * Runs the Entries loader the way `astro dev` does, through the site's
   * Contract, and reports a change at a path of the caller's choosing, which
   * is the one the app writes for the edit the test made.
   */
  async function startSite(destination = 'autohaus-ebersfelde.de') {
    const added: string[] = [];
    const handlers: Array<(path: string) => unknown> = [];
    const { context, lines, store } = createLoaderContext({
      root: tmpDirPath(),
      watcher: {
        add: (path) => {
          added.push(path);
        },
        on: (_event, handler) => {
          handlers.push(handler);
        },
      },
    });
    const loader = elekEntriesLoader({
      config: {
        projects: { website: { id: siteProjectId, destination } },
        contract,
      },
      project: 'website',
      collectionIdOrSlug: 'posts',
    });
    if ('createSchema' in loader && loader.createSchema !== undefined) {
      await loader.createSchema();
    }
    await loader.load(context);
    let before = lines.length;
    const warned = () =>
      lines
        .slice(before)
        .filter((line) => line.level === 'warn')
        .map((line) => line.message);

    return {
      /** The paths the loader asked the watcher to cover */
      added,
      store,
      warnedSince: warned,
      reload: async (
        changedPath = core.util.pathTo.entries(siteProjectId, siteArticles.id)
      ) => {
        before = lines.length;
        for (const handler of handlers) {
          handler(changedPath);
        }
        await vi.waitFor(
          function () {
            if (warned().length === 0) throw new Error('Not reloaded yet');
          },
          { timeout: 10000, interval: 20 }
        );
      },
    };
  }

  /** The Contract at another version, with one field added to its posts */
  function contractAdding(
    version: string,
    added: StringFieldDefinition
  ): Contract {
    const next = structuredClone(contract);
    next.version = version;
    for (const collection of next.collections) {
      if (collection.id === themePosts.id) {
        collection.fieldDefinitions.push(added);
      }
    }
    return next;
  }

  /** The same website on a Mapping the test narrowed, restored afterwards */
  async function withMapping(mapping: Mapping, run: () => Promise<void>) {
    await core.destinations.update({
      projectId: siteProjectId,
      id: websiteId,
      mapping,
    });
    try {
      await run();
    } finally {
      await core.destinations.update({
        projectId: siteProjectId,
        id: websiteId,
        mapping: fullMapping(),
      });
    }
  }

  it('stores every Entry under the field slugs of the Contract', async function () {
    const site = await buildSite({
      collectionIdOrSlug: 'posts',
      contract,
      destination: 'autohaus-ebersfelde.de',
    });

    await site.load();

    expect([...site.store.keys()].toSorted()).toEqual(
      [firstEntryId, secondEntryId].toSorted()
    );
    expect(site.store.get(secondEntryId)?.data).toEqual({
      title: { en: 'Polo', de: 'Polo' },
      teaser: { en: 'Small and cheap', de: 'Small and cheap' },
      // Moved onto the Collection of the Contract the Project's own fills,
      // so the site follows it with the collection key it derived
      related: {
        en: [
          {
            objectType: 'entry',
            id: firstEntryId,
            collectionId: themePosts.id,
          },
        ],
        de: [
          {
            objectType: 'entry',
            id: firstEntryId,
            collectionId: themePosts.id,
          },
        ],
      },
    });
    expect(site.types).toContain('"title"');
    expect(site.types).toContain('"teaser"');
    expect(site.types).not.toContain('headline');
  });

  it('reads the Project of a site that names no website as it always did', async function () {
    const site = await buildSite({ collectionIdOrSlug: 'articles' });

    await site.load();

    expect(site.store.get(secondEntryId)?.data).toEqual({
      headline: { en: 'Polo', de: 'Polo' },
      standfirst: { en: 'Small and cheap', de: 'Small and cheap' },
      'see-also': {
        en: [
          {
            objectType: 'entry',
            id: firstEntryId,
            collectionId: siteArticles.id,
          },
        ],
        de: [
          {
            objectType: 'entry',
            id: firstEntryId,
            collectionId: siteArticles.id,
          },
        ],
      },
    });
    expect(site.types).toContain('"headline"');
  });

  it('leaves a field of the Contract nothing fills empty', async function () {
    await withMapping(
      mappingWithout({ field: themeTeaser.id }),
      async function () {
        const site = await buildSite({
          collectionIdOrSlug: 'posts',
          contract,
          destination: 'autohaus-ebersfelde.de',
        });

        await site.load();

        expect(site.store.get(secondEntryId)?.data).toMatchObject({
          title: { en: 'Polo', de: 'Polo' },
          teaser: { en: null, de: null },
        });
      }
    );
  });

  it('reads the one Entry of a Single Entry of the Contract under single', async function () {
    const site = await buildSite({
      collectionIdOrSlug: 'contact-details',
      contract,
      destination: 'autohaus-ebersfelde.de',
    });

    await site.load();

    expect([...site.store.keys()]).toEqual(['single']);
    expect(site.store.get('single')?.data).toEqual({
      phone: { en: '030 123456', de: '030 123456' },
    });
  });

  it('stops the build when several Entries fill a Single Entry of the Contract', async function () {
    const narrowed = fullMapping();
    // The Contract holds one Entry there, this Collection of the Project is
    // no Single Entry and holds two
    narrowed.collections[themeContacts.id] = {
      from: { collectionId: siteArticles.id, where: [] },
      fields: {
        [themePhone.id]: { fill: 'field', fieldDefinitionId: siteHeadline.id },
      },
    };

    await withMapping(narrowed, async function () {
      const site = await buildSite({
        collectionIdOrSlug: 'contact-details',
        contract,
        destination: 'autohaus-ebersfelde.de',
      });

      await expectCoreError(
        site.load(),
        'BadRequest',
        '- Collection "articles" of Project "website" fills the Single Entry "contact-details" of the Contract with 2 Entries, of which the site would read an arbitrary one. Leave one Entry there, or fill it from a Collection that holds one.'
      );
      // Nothing is stored, so no page renders whichever Entry came first
      expect([...site.store.keys()]).toEqual([]);
    });
  });

  it('stops the build when a Single Entry of the Project ended up holding two', async function () {
    // Core refuses a second Entry while a Single Entry holds one, so a
    // second one comes from a pull, a merge or another writer, as here
    const { list } = await core.entries.list({
      projectId: siteProjectId,
      collectionId: siteImprint.id,
      limit: 0,
    });
    const [one] = list;
    if (one === undefined) {
      throw new Error('The Single Entry of the Project holds no Entry');
    }
    const secondId = uuid();
    const secondPath = core.util.pathTo.entryFile(
      siteProjectId,
      siteImprint.id,
      secondId
    );
    await Fs.outputJson(secondPath, { ...one, id: secondId });
    onTestFinished(async function () {
      await Fs.remove(secondPath);
    });
    const site = await buildSite({
      collectionIdOrSlug: 'contact-details',
      contract,
      destination: 'autohaus-ebersfelde.de',
    });

    // The Collection filling it is a Single Entry itself, so the way out is
    // the Entry rather than the Mapping
    await expectCoreError(
      site.load(),
      'BadRequest',
      '- Collection "imprints" of Project "website" fills the Single Entry "contact-details" of the Contract with 2 Entries, of which the site would read an arbitrary one. Leave one Entry there, or fill it from a Collection that holds one.'
    );
    expect([...site.store.keys()]).toEqual([]);
  });

  it('names the Collection of the Contract in the lines it logs', async function () {
    // The id is what elekCollections() hands a loader, so a line that
    // named what it was given would read as a bare UUID
    const site = await buildSite({
      collectionIdOrSlug: themePosts.id,
      contract,
      destination: 'autohaus-ebersfelde.de',
    });

    await site.load();

    expect(site.lines.map((line) => line.message)).toContain(
      'Loading elek.io Entries of Collection "posts" of the Contract "@acme/dealer-site" of Project "website"'
    );
  });

  it('stops the build naming a Collection of the Contract nothing fills', async function () {
    const narrowed = mappingWithout({ collection: themePosts.id });

    await withMapping(narrowed, async function () {
      const site = await buildSite({
        collectionIdOrSlug: 'posts',
        contract,
        destination: 'autohaus-ebersfelde.de',
      });

      await expectCoreError(
        site.load(),
        'BadRequest',
        'No Collection of the Project fills "posts"'
      );
      expect([...site.store.keys()]).toEqual([]);
    });
  });

  it('stops the build naming a required field of the Contract nothing fills', async function () {
    const narrowed = mappingWithout({ field: themeTitle.id });

    await withMapping(narrowed, async function () {
      const site = await buildSite({
        collectionIdOrSlug: 'posts',
        contract,
        destination: 'autohaus-ebersfelde.de',
      });

      await expectCoreError(
        site.load(),
        'BadRequest',
        'No field of the Project fills the required field "title" of "posts"'
      );
    });
  });

  it('stops the build naming every Entry the Contract refuses, and builds once none is left', async function () {
    const tooLong = await core.entries.create({
      projectId: siteProjectId,
      collectionId: siteArticles.id,
      values: {
        headline: text('Tiguan Allspace R-Line'),
        standfirst: text(null),
        'see-also': references(siteArticles.id, []),
      },
    });
    // A second refused Entry, so a build that stopped at the first one
    // would leave this one for the developer to find on the next run
    const alsoTooLong = await core.entries.create({
      projectId: siteProjectId,
      collectionId: siteArticles.id,
      values: {
        headline: text('Arteon Shooting Brake'),
        standfirst: text(null),
        'see-also': references(siteArticles.id, []),
      },
    });
    const refusedIds = [tooLong.id, alsoTooLong.id];
    // Every later test reads this Collection through the Contract, which
    // these Entries stop until they are gone again
    onTestFinished(async function () {
      for (const id of refusedIds) {
        await core.entries
          .delete({
            projectId: siteProjectId,
            collectionId: siteArticles.id,
            id,
          })
          .catch(() => undefined);
      }
    });
    const refused = await buildSite({
      collectionIdOrSlug: 'posts',
      contract,
      destination: 'autohaus-ebersfelde.de',
    });

    const error = await refused.load().then(
      () => null,
      (caught: unknown) => caught
    );

    expect(error).toBeInstanceOf(CoreError);
    const message = error instanceof CoreError ? error.message : '';
    // Word for word, because `docs/usage.md` quotes these two lines
    expect(message.split('\n')[0]).toBe(
      'Collection "posts" of the Contract "@acme/dealer-site" at version 1.0.0 is not filled by Project "website" through Destination "autohaus-ebersfelde.de":'
    );
    for (const id of refusedIds) {
      expect(message.split('\n')).toContain(
        `- Entry "${id}", field "title" in "en": Too big: expected string to have <=10 characters`
      );
    }
    expect([...refused.store.keys()]).toEqual([]);

    for (const id of refusedIds) {
      await core.entries.delete({
        projectId: siteProjectId,
        collectionId: siteArticles.id,
        id,
      });
    }
    const site = await buildSite({
      collectionIdOrSlug: 'posts',
      contract,
      destination: 'autohaus-ebersfelde.de',
    });
    await site.load();

    expect([...site.store.keys()].toSorted()).toEqual(
      [firstEntryId, secondEntryId].toSorted()
    );
  });

  it('stops the build naming what the Project lacks when the site moved ahead', async function () {
    const ahead = contractAdding('1.1.0', textField('author', true));
    const site = await buildSite({
      collectionIdOrSlug: 'posts',
      contract: ahead,
      destination: 'autohaus-ebersfelde.de',
    });

    const error = await site.load().then(
      () => null,
      (caught: unknown) => caught
    );

    expect(error).toBeInstanceOf(CoreError);
    expect(error instanceof CoreError && error.type).toBe('BadRequest');
    expect(error instanceof CoreError && error.message).toContain(
      'No field of the Project fills the required field "author" of "posts"'
    );
    expect(error instanceof CoreError && error.message).toContain(
      'version 1.1.0 while the website uses 1.0.0'
    );
  });

  it('builds a site one version behind, leaving out what its Contract does not name', async function () {
    const theme = await createFakeTheme();
    const ahead = contractAdding('1.1.0', textField('author', false));
    await theme.release({ tag: 'v1.0.0', files: contractFileOf(contract) });
    await theme.release({ tag: 'v1.1.0', files: contractFileOf(ahead) });
    const website = await core.destinations.addWebsite({
      projectId: siteProjectId,
      name: 'ahead.example',
      url: theme.url,
    });
    await core.destinations.update({
      projectId: siteProjectId,
      id: website.id,
      mapping: fullMapping(),
    });
    const site = await buildSite({
      collectionIdOrSlug: 'posts',
      contract,
      destination: 'ahead.example',
    });

    await site.load();

    expect(website.contract.version).toBe('1.1.0');
    expect(site.store.get(secondEntryId)?.data).not.toHaveProperty('author');
    expect(site.store.get(secondEntryId)?.data).toMatchObject({
      title: { en: 'Polo', de: 'Polo' },
    });

    await core.destinations.delete({
      projectId: siteProjectId,
      id: website.id,
    });
  });

  it('reads the version in use while a newer one waits', async function () {
    const theme = await createFakeTheme();
    // What the editor has not mapped yet, so the new version waits
    const ahead = contractAdding('1.1.0', textField('author', true));
    await theme.release({ tag: 'v1.0.0', files: contractFileOf(contract) });
    await theme.release({ tag: 'v1.1.0', files: contractFileOf(ahead) });
    const website = await core.destinations.addWebsite({
      projectId: siteProjectId,
      name: 'waiting.example',
      url: theme.url,
      version: '1.0.0',
    });
    await core.destinations.update({
      projectId: siteProjectId,
      id: website.id,
      mapping: fullMapping(),
    });
    const kept = await core.destinations.keepVersion({
      projectId: siteProjectId,
      id: website.id,
    });
    // A Mapping of its own that fills nothing, so a build reading it would
    // stop rather than build what the version in use fills
    const waiting = await core.destinations.update({
      projectId: siteProjectId,
      id: website.id,
      waitingMapping: { collections: {} },
    });
    const site = await buildSite({
      collectionIdOrSlug: 'posts',
      contract,
      destination: 'waiting.example',
    });

    await site.load();

    expect(kept.destination.contract.version).toBe('1.0.0');
    expect(kept.destination.waiting?.version).toBe('1.1.0');
    expect(waiting.mapping).toEqual(fullMapping());
    expect(site.store.get(secondEntryId)?.data).toMatchObject({
      title: { en: 'Polo', de: 'Polo' },
    });

    await core.destinations.delete({
      projectId: siteProjectId,
      id: website.id,
    });
  });

  it('builds with the theme repository gone, which no pipeline needs', async function () {
    const theme = await createFakeTheme();
    await theme.release({ tag: 'v1.0.0', files: contractFileOf(contract) });
    const website = await core.destinations.addWebsite({
      projectId: siteProjectId,
      name: 'no-theme-access.example',
      url: theme.url,
    });
    await core.destinations.update({
      projectId: siteProjectId,
      id: website.id,
      mapping: fullMapping(),
    });
    // What a build on a runner that was never given the theme's address
    // has, which is the Project and the site's own repository
    await Fs.remove(theme.url);
    const site = await buildSite({
      collectionIdOrSlug: 'posts',
      contract,
      destination: 'no-theme-access.example',
    });

    await site.load();

    expect(site.store.get(secondEntryId)?.data).toMatchObject({
      title: { en: 'Polo', de: 'Polo' },
    });

    await core.destinations.delete({
      projectId: siteProjectId,
      id: website.id,
    });
  });

  it('stops a site whose Contract is another theme than its website follows', async function () {
    const other = structuredClone(contract);
    other.name = '@acme/other-site';

    await expectCoreError(
      buildSite({
        collectionIdOrSlug: 'posts',
        contract: other,
        destination: 'autohaus-ebersfelde.de',
      }),
      'BadRequest',
      'This site\'s Contract is "@acme/other-site" while Destination "autohaus-ebersfelde.de" of Project "website" follows "@acme/dealer-site"'
    );
  });

  it('names the Destinations the Project has when it holds none of that name', async function () {
    await expectCoreError(
      buildSite({
        collectionIdOrSlug: 'posts',
        contract,
        destination: 'nothing.example',
      }),
      'NotFound',
      'has no Destination "nothing.example"'
    );
  });

  it('stops the build when the Mapping names a Collection the Project dropped', async function () {
    const caption = textField('caption', true);
    const offers = await createCollectionOf({
      projectId: siteProjectId,
      slug: { singular: 'offer', plural: 'offers' },
      fieldDefinitions: [caption],
    });
    const theme = await createFakeTheme();
    await theme.release({ tag: 'v1.0.0', files: contractFileOf(contract) });
    const website = await core.destinations.addWebsite({
      projectId: siteProjectId,
      name: 'dropped-collection.example',
      url: theme.url,
    });
    await core.destinations.update({
      projectId: siteProjectId,
      id: website.id,
      mapping: {
        collections: {
          [themePosts.id]: {
            from: { collectionId: offers.id, where: [] },
            fields: {
              [themeTitle.id]: { fill: 'field', fieldDefinitionId: caption.id },
            },
          },
        },
      },
    });
    onTestFinished(async function () {
      await core.destinations.delete({
        projectId: siteProjectId,
        id: website.id,
      });
    });
    // Nothing refuses this today, so a Mapping can outlive the Collection
    // it reads from
    await core.collections.delete({
      projectId: siteProjectId,
      id: offers.id,
    });
    const named = `The Mapping fills "posts" from the Collection "${offers.id}", which the Project does not hold, so nothing fills it`;

    await expectCoreError(
      elekCollections(
        {
          projects: {
            website: {
              id: siteProjectId,
              destination: 'dropped-collection.example',
            },
          },
          contract,
        },
        { collections: { website: ['posts'] } }
      ),
      'BadRequest',
      named
    );

    const site = await buildSite({
      collectionIdOrSlug: 'posts',
      contract,
      destination: 'dropped-collection.example',
    });
    await expectCoreError(site.load(), 'BadRequest', named);
    expect([...site.store.keys()]).toEqual([]);
  });

  it('stops the build naming a refused Value that belongs to no language', async function () {
    // A Collection of the Project the Mapping does not name, so a reference
    // into it reaches no Collection of the Contract
    const brands = await createCollectionOf({
      projectId: siteProjectId,
      slug: { singular: 'brand', plural: 'brands' },
      fieldDefinitions: [textField('name', true)],
    });
    const brand = await core.entries.create({
      projectId: siteProjectId,
      collectionId: brands.id,
      values: { name: text('Volkswagen') },
    });
    // Core refuses a reference the field does not allow, so an Entry
    // holding one comes from a merge or another writer, as here
    const first = await core.entries.read({
      projectId: siteProjectId,
      collectionId: siteArticles.id,
      id: firstEntryId,
    });
    const strayId = uuid();
    const strayPath = core.util.pathTo.entryFile(
      siteProjectId,
      siteArticles.id,
      strayId
    );
    await Fs.outputJson(strayPath, {
      ...first,
      id: strayId,
      values: {
        ...first.values,
        'see-also': references(brands.id, [brand.id]),
      },
    });
    onTestFinished(async function () {
      await Fs.remove(strayPath);
      await core.entries.delete({
        projectId: siteProjectId,
        collectionId: brands.id,
        id: brand.id,
      });
      await core.collections.delete({
        projectId: siteProjectId,
        id: brands.id,
      });
    });
    const site = await buildSite({
      collectionIdOrSlug: 'posts',
      contract,
      destination: 'autohaus-ebersfelde.de',
    });

    // No language in front of it, because the Mapping refuses this
    // reference in every language at once
    await expectCoreError(
      site.load(),
      'BadRequest',
      `- Entry "${strayId}", field "related": The field "related" points at an Entry of the Collection "${brands.id}" of the Project, which fills no Collection of the Contract`
    );
  });

  it('names the Contract when a collection declared by hand reads one it does not hold', async function () {
    const { context } = createLoaderContext({ root: tmpDirPath() });
    const loader = elekEntriesLoader({
      config: {
        projects: {
          website: { id: siteProjectId, destination: 'autohaus-ebersfelde.de' },
        },
        contract,
      },
      project: 'website',
      // The Project's own plural slug, which is what a collection declared
      // by hand reaches for while the Contract names it "posts"
      collectionIdOrSlug: 'articles',
    });

    const error = await loader.load(context).then(
      () => null,
      (caught: unknown) => caught
    );

    expect(error).toBeInstanceOf(CoreError);
    expect(error instanceof CoreError && error.type).toBe('NotFound');
    const message = error instanceof CoreError ? error.message : '';
    expect(message).toContain(
      'The Contract "@acme/dealer-site" has no Collection "articles". It has '
    );
    // Every Collection it does hold, in whatever order the Contract lists them
    expect(message).toContain('"posts"');
    expect(message).toContain('"contact-details"');
    expect(message).toContain(
      'Name a Collection by its plural slug or its id.'
    );
  });

  it('leaves a reference field of the Contract nothing fills as an empty list', async function () {
    await withMapping(
      mappingWithout({ field: themeRelated.id }),
      async function () {
        const site = await buildSite({
          collectionIdOrSlug: 'posts',
          contract,
          destination: 'autohaus-ebersfelde.de',
        });

        await site.load();

        expect(site.store.get(secondEntryId)?.data).toMatchObject({
          related: { en: [], de: [] },
        });
      }
    );
  });

  it('asks for a restart when the Mapping it reads through changes', async function () {
    const site = await startSite();

    await withMapping(mappingWithout({ field: themeTeaser.id }), () =>
      site.reload()
    );

    expect(site.warnedSince()).toEqual([
      expect.stringContaining('restart the dev server'),
    ]);
  });

  it('asks for a restart when the Collection it reads through changes', async function () {
    const site = await startSite();

    await core.collections.update({
      projectId: siteProjectId,
      id: siteArticles.id,
      icon: siteArticles.icon,
      name: siteArticles.name,
      description: siteArticles.description,
      slug: siteArticles.slug,
      fieldDefinitions: [
        ...siteArticles.fieldDefinitions,
        textField('byline', false),
      ],
    });
    onTestFinished(async function () {
      await core.collections.update({
        projectId: siteProjectId,
        id: siteArticles.id,
        icon: siteArticles.icon,
        name: siteArticles.name,
        description: siteArticles.description,
        slug: siteArticles.slug,
        fieldDefinitions: siteArticles.fieldDefinitions,
      });
    });
    await site.reload();

    expect(site.warnedSince()).toEqual([
      expect.stringContaining('restart the dev server'),
    ]);
  });

  it('asks for a restart when the Mapping changes and nothing else does', async function () {
    const site = await startSite();

    // Remapping a field in the app writes the Destination's own file, so
    // that is the only path a reload can hear about it on
    await withMapping(mappingWithout({ field: themeTeaser.id }), () =>
      site.reload(core.util.pathTo.destinationFile(siteProjectId, websiteId))
    );

    expect(site.added).toContain(
      core.util.pathTo.destination(siteProjectId, websiteId)
    );
    expect(site.warnedSince()).toEqual([
      // The Collection named here is the Contract's, the one the site's own
      // code reads, because the Project holds none of that name
      'The content model of Collection "posts" of the Contract "@acme/dealer-site" of Project "website" changed. Astro builds a collection\'s schema and types once, when it loads the content config, so restart the dev server to pick them up. Entries are not reloaded until then.',
    ]);
  });

  it('asks for a restart when the website it reads through is gone', async function () {
    const theme = await createFakeTheme();
    await theme.release({ tag: 'v1.0.0', files: contractFileOf(contract) });
    const website = await core.destinations.addWebsite({
      projectId: siteProjectId,
      name: 'deleted-while-running.example',
      url: theme.url,
    });
    await core.destinations.update({
      projectId: siteProjectId,
      id: website.id,
      mapping: fullMapping(),
    });
    const site = await startSite('deleted-while-running.example');
    expect([...site.store.keys()].toSorted()).toEqual(
      [firstEntryId, secondEntryId].toSorted()
    );

    await core.destinations.delete({
      projectId: siteProjectId,
      id: website.id,
    });
    await site.reload(
      core.util.pathTo.destinationFile(siteProjectId, website.id)
    );

    expect(site.warnedSince()).toEqual([
      expect.stringContaining('restart the dev server'),
    ]);
    // The open page keeps rendering what was loaded, rather than losing it
    // to a website the editor removed
    expect([...site.store.keys()].toSorted()).toEqual(
      [firstEntryId, secondEntryId].toSorted()
    );
  });

  it('derives the Collections of the Contract rather than the Project', async function () {
    const collections = await elekCollections(
      {
        projects: {
          website: {
            id: siteProjectId,
            destination: 'autohaus-ebersfelde.de',
          },
        },
        contract,
      },
      { collections: { website: ['posts'] } }
    );

    expect(Object.keys(collections)).toEqual(['websitePosts']);
  });

  it('names every Collection and required field of the Contract the Mapping leaves unfilled', async function () {
    const narrowed = mappingWithout({ collection: themePosts.id });
    narrowed.collections[themeContacts.id] = {
      from: { collectionId: siteImprint.id, where: [] },
      fields: {},
    };

    await withMapping(narrowed, async function () {
      const error = await elekCollections({
        projects: {
          website: { id: siteProjectId, destination: 'autohaus-ebersfelde.de' },
        },
        contract,
      }).then(
        () => null,
        (caught: unknown) => caught
      );

      expect(error).toBeInstanceOf(CoreError);
      // Word for word, because `docs/usage.md` quotes this error. The issues
      // follow the Contract's own order, which is the order it lists its
      // Collections in
      const lines = (error instanceof CoreError ? error.message : '').split(
        '\n'
      );
      expect(lines[0]).toBe(
        'Destination "autohaus-ebersfelde.de" of Project "website" does not fill the Contract "@acme/dealer-site" at version 1.0.0:'
      );
      expect(lines.slice(1, -1).toSorted()).toEqual(
        [
          '- No Collection of the Project fills "posts"',
          '- No field of the Project fills the required field "phone" of "contact-details"',
        ].toSorted()
      );
      expect(lines.at(-1)).toBe(
        "Map them onto the Project's own Collections and fields, or leave the Collection out of elekCollections()."
      );
    });
  });

  it('leaves a Collection of the Contract nothing fills to the loader when the site does not derive it', async function () {
    const narrowed = mappingWithout({ collection: themePosts.id });

    await withMapping(narrowed, async function () {
      const collections = await elekCollections(
        {
          projects: {
            website: {
              id: siteProjectId,
              destination: 'autohaus-ebersfelde.de',
            },
          },
          contract,
        },
        { collections: { website: ['contact-details'] } }
      );

      expect(Object.keys(collections)).toEqual(['websiteContactDetails']);
    });
  });

  describe('the way a Mapping fills each field of the Contract', function () {
    /** The full Mapping, with the Contract's teaser filled the way given */
    function teaserFilledBy(
      fieldMapping: Mapping['collections'][string]['fields'][string]
    ): Mapping {
      const mapping = fullMapping();
      const posts = mapping.collections[themePosts.id];
      if (posts === undefined) {
        throw new Error('The Mapping does not fill the posts of the Contract');
      }
      posts.fields[themeTeaser.id] = fieldMapping;
      return mapping;
    }

    /** The full Mapping, taking the Entries the condition lets through */
    function postsWhere(headline: string): Mapping {
      const mapping = fullMapping();
      const posts = mapping.collections[themePosts.id];
      if (posts === undefined) {
        throw new Error('The Mapping does not fill the posts of the Contract');
      }
      posts.from.where = [
        { fieldDefinitionId: siteHeadline.id, equals: [headline] },
      ];
      return mapping;
    }

    /** The site built through its website, loaded */
    async function loadPosts() {
      const site = await buildSite({
        collectionIdOrSlug: 'posts',
        contract,
        destination: 'autohaus-ebersfelde.de',
      });
      await site.load();
      return site;
    }

    it('gives the site a fixed Value', async function () {
      await withMapping(
        teaserFilledBy({
          fill: 'fixed',
          value: {
            objectType: 'value',
            valueType: 'string',
            content: { en: 'From Ebersfelde', de: 'Aus Ebersfelde' },
          },
        }),
        async function () {
          const site = await loadPosts();

          expect(site.store.get(firstEntryId)?.data).toMatchObject({
            teaser: { en: 'From Ebersfelde', de: 'Aus Ebersfelde' },
          });
        }
      );
    });

    it('gives the site several fields joined into one', async function () {
      await withMapping(
        teaserFilledBy({
          fill: 'combined',
          fieldDefinitionIds: [siteHeadline.id, siteStandfirst.id],
          separator: ' - ',
        }),
        async function () {
          const site = await loadPosts();

          expect(site.store.get(secondEntryId)?.data).toMatchObject({
            teaser: {
              en: 'Polo - Small and cheap',
              de: 'Polo - Small and cheap',
            },
          });
          // The Entry holding nothing in the second field keeps the first
          expect(site.store.get(firstEntryId)?.data).toMatchObject({
            teaser: { en: 'Golf GTI', de: 'Golf GTI' },
          });
        }
      );
    });

    it('gives the site another language where the first holds nothing', async function () {
      const third = await core.entries.create({
        projectId: siteProjectId,
        collectionId: siteArticles.id,
        values: {
          headline: text('Up'),
          standfirst: {
            objectType: 'value',
            valueType: 'string',
            content: { en: null, de: 'Nur auf Deutsch' },
          },
          'see-also': references(siteArticles.id, []),
        },
      });
      onTestFinished(async function () {
        await core.entries.delete({
          projectId: siteProjectId,
          collectionId: siteArticles.id,
          id: third.id,
        });
      });

      await withMapping(
        teaserFilledBy({
          fill: 'field',
          fieldDefinitionId: siteStandfirst.id,
          language: { order: ['en', 'de'] },
        }),
        async function () {
          const site = await loadPosts();

          expect(site.store.get(third.id)?.data).toMatchObject({
            teaser: { en: 'Nur auf Deutsch', de: 'Nur auf Deutsch' },
          });
        }
      );
    });

    it('loads only the Entries the Mapping lets through', async function () {
      await withMapping(postsWhere('Golf GTI'), async function () {
        const site = await loadPosts();

        expect([...site.store.keys()]).toEqual([firstEntryId]);
      });
    });

    it('stops the build when an Entry points at one the website does not take', async function () {
      await withMapping(postsWhere('Polo'), async function () {
        const site = await buildSite({
          collectionIdOrSlug: 'posts',
          contract,
          destination: 'autohaus-ebersfelde.de',
        });

        await expectCoreError(
          site.load(),
          'BadRequest',
          `field "related": The field "related" points at the Entry "${firstEntryId}" of the Collection "${siteArticles.id}" of the Project, which the website does not take`
        );
        expect([...site.store.keys()]).toEqual([]);
      });
    });
  });

  it('names the Contract when a selection names a Collection it does not hold', async function () {
    await expectCoreError(
      elekCollections(
        {
          projects: {
            website: {
              id: siteProjectId,
              destination: 'autohaus-ebersfelde.de',
            },
          },
          contract,
        },
        { collections: { website: ['articles'] } }
      ),
      'NotFound',
      'the Contract "@acme/dealer-site" of Project "website" has no Collection "articles"'
    );
  });
});
