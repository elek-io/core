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
    const fields: Record<string, { fieldDefinitionId: string }> = {};
    for (const [contractField, projectField] of pairs) {
      if (contractField === omit?.field) continue;
      fields[contractField] = { fieldDefinitionId: projectField };
    }
    const collections: Mapping['collections'] = {
      [themeContacts.id]: {
        from: { collectionId: siteImprint.id },
        fields: { [themePhone.id]: { fieldDefinitionId: siteTelephone.id } },
      },
    };
    if (omit?.collection !== themePosts.id) {
      collections[themePosts.id] = {
        from: { collectionId: siteArticles.id },
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
    // Every later test reads this Collection through the Contract, which
    // this Entry stops until it is gone again
    onTestFinished(async function () {
      await core.entries
        .delete({
          projectId: siteProjectId,
          collectionId: siteArticles.id,
          id: tooLong.id,
        })
        .catch(() => undefined);
    });
    const refused = await buildSite({
      collectionIdOrSlug: 'posts',
      contract,
      destination: 'autohaus-ebersfelde.de',
    });

    await expectCoreError(
      refused.load(),
      'BadRequest',
      `Entry "${tooLong.id}", field "title" in "en"`
    );
    expect([...refused.store.keys()]).toEqual([]);

    await core.entries.delete({
      projectId: siteProjectId,
      collectionId: siteArticles.id,
      id: tooLong.id,
    });
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

  it('asks for a restart when the Mapping it reads through changes', async function () {
    const handlers: Array<(path: string) => unknown> = [];
    const { context, lines } = createLoaderContext({
      root: tmpDirPath(),
      watcher: {
        add: () => undefined,
        on: (_event, handler) => {
          handlers.push(handler);
        },
      },
    });
    const loader = elekEntriesLoader({
      config: {
        projects: {
          website: { id: siteProjectId, destination: 'autohaus-ebersfelde.de' },
        },
        contract,
      },
      project: 'website',
      collectionIdOrSlug: 'posts',
    });
    if ('createSchema' in loader && loader.createSchema !== undefined) {
      await loader.createSchema();
    }
    await loader.load(context);
    const before = lines.length;

    await withMapping(
      mappingWithout({ field: themeTeaser.id }),
      async function () {
        for (const handler of handlers) {
          handler(core.util.pathTo.entries(siteProjectId, siteArticles.id));
        }
        await vi.waitFor(
          function () {
            const warned = lines
              .slice(before)
              .some((line) => line.level === 'warn');
            if (warned === false) throw new Error('Not reloaded yet');
          },
          { timeout: 10000, interval: 20 }
        );
      }
    );

    expect(
      lines.slice(before).filter((line) => line.level === 'warn')
    ).toMatchObject([
      { message: expect.stringContaining('restart the dev server') },
    ]);
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
