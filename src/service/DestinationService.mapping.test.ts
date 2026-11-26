import Fs from 'fs-extra';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  onTestFinished,
} from 'vitest';
import core, {
  CoreError,
  flattenFieldDefinitions,
  uuid,
  type Collection,
  type Contract,
  type EntryCondition,
  type FieldDefinition,
  type Mapping,
  type Value,
} from '../test/setup.js';
import {
  contractFileOf,
  createFakeTheme,
  type FakeTheme,
} from '../test/theme.js';
import { createProject, expectCoreError } from '../test/util.js';

function textField(
  slug: string,
  props: { isRequired?: boolean; max?: number | null } = {}
): FieldDefinition {
  return {
    id: uuid(),
    slug,
    valueType: 'string',
    fieldType: 'text',
    label: { en: slug, de: slug },
    description: null,
    defaultValue: null,
    isRequired: props.isRequired ?? false,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12',
    min: null,
    max: props.max ?? null,
  };
}

function numberField(slug: string): FieldDefinition {
  return {
    id: uuid(),
    slug,
    valueType: 'number',
    fieldType: 'number',
    label: { en: slug, de: slug },
    description: null,
    defaultValue: null,
    isRequired: false,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12',
    min: null,
    max: null,
  };
}

function selectField(slug: string, options: string[]): FieldDefinition {
  return {
    id: uuid(),
    slug,
    valueType: 'string',
    fieldType: 'select',
    label: { en: slug, de: slug },
    description: null,
    defaultValue: null,
    isRequired: false,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12',
    options: options.map((value) => ({
      value,
      label: { en: value, de: value },
    })),
  };
}

function entryField(slug: string): FieldDefinition {
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
    ofCollections: [],
    min: null,
    max: null,
  };
}

function dynamicField(
  slug: string,
  ofComponents: string[],
  props: { isRequired?: boolean } = {}
): FieldDefinition {
  return {
    id: uuid(),
    slug,
    valueType: 'component',
    fieldType: 'dynamic',
    label: { en: slug, de: slug },
    description: null,
    isRequired: props.isRequired ?? false,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12',
    ofComponents,
    min: null,
    max: null,
  };
}

/** One Component item of the Component given, in both languages */
function items(componentId: string, values: Record<string, Value>): Value {
  return {
    objectType: 'value',
    valueType: 'component',
    content: [{ id: uuid(), componentId, values }],
  };
}

/** One string in both languages, or nothing in either */
function text(content: string | null): Value {
  return {
    objectType: 'value',
    valueType: 'string',
    content: { en: content, de: content },
  };
}

/** One string per language, which is what a language order reads */
function textPer(en: string | null, de: string | null): Value {
  return { objectType: 'value', valueType: 'string', content: { en, de } };
}

/** One number in both languages */
function count(content: number | null): Value {
  return {
    objectType: 'value',
    valueType: 'number',
    content: { en: content, de: content },
  };
}

/** References to Entries of one Collection, in both languages */
function references(collectionId: string, ids: string[]): Value {
  const content = ids.map((id) => ({
    objectType: 'entry' as const,
    id,
    collectionId,
  }));
  return {
    objectType: 'value',
    valueType: 'reference',
    content: { en: content, de: content },
  };
}

const themeTitle = textField('title', { isRequired: true });
const themeCode = textField('code', { max: 4 });
const themeTeaser = textField('teaser');
const themeStatus = selectField('status', ['available', 'sold']);
const themeSeats = numberField('seats');
const themeRelated = entryField('related');
const themeHeadline = textField('headline');
const themePhone = textField('phone', { isRequired: true });
const demandedVin = textField('vin', { isRequired: true });
const demandedTitle = textField('title');
const siteHeadline = textField('headline', { isRequired: true, max: 200 });
const siteStandfirst = textField('standfirst');
const siteZustand = selectField('zustand', ['frei', 'verkauft']);
const siteSitze = numberField('sitze');
const siteSeeAlso = entryField('see-also');
const siteTelephone = textField('telephone', { isRequired: true });

/**
 * A Collection, pointed at itself where one of its fields references
 * Entries, which is what the Contract generated from it needs
 */
async function createCollectionOf(props: {
  projectId: string;
  slug: { singular: string; plural: string };
  fieldDefinitions: FieldDefinition[];
  isSingleEntry?: boolean;
  pointsAt?: string;
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
    return field.fieldType === 'entry';
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
        ? { ...field, ofCollections: [props.pointsAt ?? created.id] }
        : field
    ),
  });
}

/** A website on a theme that released the Contract given, and that theme */
async function addWebsite(props: {
  projectId: string;
  name: string;
  contract: Contract;
}) {
  const theme = await createFakeTheme();
  await theme.release({
    tag: `v${props.contract.version}`,
    files: contractFileOf(props.contract),
  });
  const website = await core.destinations.addWebsite({
    projectId: props.projectId,
    name: props.name,
    url: theme.url,
  });
  return { website, theme };
}

/**
 * How a Mapping fills a theme's fields, which Entries a website takes, what
 * it creates from its theme and what it refuses to.
 */
describe('a Mapping with an editor’s options', function () {
  let siteProjectId = '';
  let articles: Collection;
  let imprints: Collection;
  let contract: Contract;
  let creatingContract: Contract;
  let demandingContract: Contract;
  let blockingContract: Contract;
  let themePosts: Collection;
  let themeContacts: Collection;
  let creating: {
    pages: Collection;
    landings: Collection;
    galleries: Collection;
    tours: Collection;
    news: Collection;
  };
  let websiteId = '';
  let creatingId = '';
  let demandingId = '';
  let blockingId = '';
  let golf = '';
  let polo = '';
  let theme: FakeTheme;
  const destroy: Array<() => Promise<void>> = [];

  beforeAll(async function () {
    const themeProject = await createProject('Theme of the Contract');
    destroy.push(themeProject.destroy);
    themePosts = await createCollectionOf({
      projectId: themeProject.id,
      slug: { singular: 'post', plural: 'posts' },
      fieldDefinitions: [
        themeTitle,
        themeCode,
        themeTeaser,
        themeStatus,
        themeSeats,
        themeRelated,
        themeHeadline,
      ],
    });
    themeContacts = await createCollectionOf({
      projectId: themeProject.id,
      slug: { singular: 'contact-detail', plural: 'contact-details' },
      fieldDefinitions: [themePhone],
      isSingleEntry: true,
    });
    contract = await core.contracts.generate({
      projectId: themeProject.id,
      name: '@acme/dealer-site',
      version: '1.0.0',
    });

    // A theme whose Collections the Project does not have, to create from
    const creatingProject = await createProject('Theme to create from');
    destroy.push(creatingProject.destroy);
    const hero = await core.components.create({
      projectId: creatingProject.id,
      name: { en: 'Hero', de: 'Hero' },
      slug: 'hero',
      description: null,
      fieldDefinitions: [textField('heading'), entryField('about-page')],
    });
    const gallery = await core.components.create({
      projectId: creatingProject.id,
      name: { en: 'Gallery', de: 'Gallery' },
      slug: 'gallery',
      description: null,
      fieldDefinitions: [textField('caption')],
    });
    const pages = await createCollectionOf({
      projectId: creatingProject.id,
      slug: { singular: 'page', plural: 'pages' },
      fieldDefinitions: [
        textField('heading', { isRequired: true }),
        dynamicField('sections', [hero.id]),
      ],
    });
    // The Component of the theme points at the Collection it comes with,
    // which only exists once that Collection is created
    await core.components.update({
      projectId: creatingProject.id,
      id: hero.id,
      name: hero.name,
      slug: hero.slug,
      description: hero.description,
      fieldDefinitions: hero.fieldDefinitions.map((field) =>
        'ofCollections' in field
          ? { ...field, ofCollections: [pages.id] }
          : field
      ),
    });
    const landings = await createCollectionOf({
      projectId: creatingProject.id,
      slug: { singular: 'landing', plural: 'landings' },
      fieldDefinitions: [
        dynamicField('sections', [hero.id]),
        entryField('about'),
      ],
      pointsAt: pages.id,
    });
    const galleries = await createCollectionOf({
      projectId: creatingProject.id,
      slug: { singular: 'gallery-page', plural: 'gallery-pages' },
      fieldDefinitions: [dynamicField('blocks', [gallery.id])],
    });
    const tours = await createCollectionOf({
      projectId: creatingProject.id,
      slug: { singular: 'tour', plural: 'tours' },
      fieldDefinitions: [entryField('nearby')],
    });
    const news = await createCollectionOf({
      projectId: creatingProject.id,
      slug: { singular: 'news-item', plural: 'news' },
      fieldDefinitions: [textField('headline')],
    });
    creating = { pages, landings, galleries, tours, news };
    creatingContract = await core.contracts.generate({
      projectId: creatingProject.id,
      name: '@acme/blocks-site',
      version: '1.0.0',
    });

    // A theme needing a field the Project has nothing for
    const demandingProject = await createProject('Theme that demands a field');
    destroy.push(demandingProject.destroy);
    await createCollectionOf({
      projectId: demandingProject.id,
      slug: { singular: 'vehicle', plural: 'vehicles' },
      fieldDefinitions: [demandedTitle, demandedVin],
    });
    demandingContract = await core.contracts.generate({
      projectId: demandingProject.id,
      name: '@acme/vin-site',
      version: '1.0.0',
    });

    // A theme needing a required field whose Component comes with it
    const blockingProject = await createProject('Theme that demands blocks');
    destroy.push(blockingProject.destroy);
    const teaser = await core.components.create({
      projectId: blockingProject.id,
      name: { en: 'Teaser', de: 'Teaser' },
      slug: 'teaser',
      description: null,
      fieldDefinitions: [textField('heading')],
    });
    await createCollectionOf({
      projectId: blockingProject.id,
      slug: { singular: 'room', plural: 'rooms' },
      fieldDefinitions: [
        textField('title'),
        dynamicField('blocks', [teaser.id], { isRequired: true }),
      ],
    });
    blockingContract = await core.contracts.generate({
      projectId: blockingProject.id,
      name: '@acme/blocks-theme',
      version: '1.0.0',
    });

    const siteProject = await createProject('Dealer on its own model');
    destroy.push(siteProject.destroy);
    siteProjectId = siteProject.id;
    articles = await createCollectionOf({
      projectId: siteProjectId,
      slug: { singular: 'article', plural: 'articles' },
      fieldDefinitions: [
        siteHeadline,
        siteStandfirst,
        siteZustand,
        siteSitze,
        siteSeeAlso,
      ],
    });
    imprints = await createCollectionOf({
      projectId: siteProjectId,
      slug: { singular: 'imprint', plural: 'imprints' },
      fieldDefinitions: [siteTelephone],
      isSingleEntry: true,
    });

    const sold = await core.entries.create({
      projectId: siteProjectId,
      collectionId: articles.id,
      values: {
        headline: text('Polo'),
        standfirst: textPer(null, 'Nur auf Deutsch'),
        zustand: text('verkauft'),
        sitze: count(2),
        'see-also': references(articles.id, []),
      },
    });
    polo = sold.id;
    const forSale = await core.entries.create({
      projectId: siteProjectId,
      collectionId: articles.id,
      values: {
        headline: text('Golf GTI'),
        standfirst: text(null),
        zustand: text('frei'),
        sitze: count(5),
        'see-also': references(articles.id, [sold.id]),
      },
    });
    golf = forSale.id;
    await core.entries.create({
      projectId: siteProjectId,
      collectionId: imprints.id,
      values: { telephone: text('030 123456') },
    });

    const added = await addWebsite({
      projectId: siteProjectId,
      name: 'autohaus-ebersfelde.de',
      contract,
    });
    websiteId = added.website.id;
    theme = added.theme;
    creatingId = (
      await addWebsite({
        projectId: siteProjectId,
        name: 'blocks.example',
        contract: creatingContract,
      })
    ).website.id;
    demandingId = (
      await addWebsite({
        projectId: siteProjectId,
        name: 'vin.example',
        contract: demandingContract,
      })
    ).website.id;
    blockingId = (
      await addWebsite({
        projectId: siteProjectId,
        name: 'blocks.test',
        contract: blockingContract,
      })
    ).website.id;
  });

  afterAll(async function () {
    for (const one of destroy) await one();
  });

  /**
   * The website's Mapping with its posts filled the way given and its
   * contact details filled from the Project's own Single Entry
   */
  function mappingOf(props: {
    fields: Mapping['collections'][string]['fields'];
    where?: EntryCondition[];
  }): Mapping {
    return {
      collections: {
        [themePosts.id]: {
          from: { collectionId: articles.id, where: props.where ?? [] },
          fields: props.fields,
        },
        [themeContacts.id]: {
          from: { collectionId: imprints.id, where: [] },
          fields: {
            [themePhone.id]: {
              fill: 'field',
              fieldDefinitionId: siteTelephone.id,
            },
          },
        },
      },
    };
  }

  /** The website on the Mapping given, which it keeps afterwards */
  async function withMapping(mapping: Mapping) {
    return core.destinations.update({
      projectId: siteProjectId,
      id: websiteId,
      mapping,
    });
  }

  /** What the website fills one Collection of the Contract with, per Entry */
  async function valuesOf(entryId: string) {
    return core.destinations.values({
      projectId: siteProjectId,
      id: websiteId,
      contractCollectionId: themePosts.id,
      entryId,
    });
  }

  describe('the ways one field is filled', function () {
    it('fills a field from one field of the Project', async function () {
      await withMapping(
        mappingOf({
          fields: {
            [themeTitle.id]: {
              fill: 'field',
              fieldDefinitionId: siteHeadline.id,
            },
            [themeRelated.id]: {
              fill: 'field',
              fieldDefinitionId: siteSeeAlso.id,
            },
          },
        })
      );

      const values = await valuesOf(golf);
      expect(values['title']).toEqual(text('Golf GTI'));
      // The reference comes back on the Contract's own Collection id, which
      // is what a site built on the Contract reads
      expect(values['related']).toEqual(references(themePosts.id, [polo]));
    });

    it('fills a field from a fixed Value', async function () {
      await withMapping(
        mappingOf({
          fields: {
            [themeTitle.id]: {
              fill: 'field',
              fieldDefinitionId: siteHeadline.id,
            },
            [themeTeaser.id]: {
              fill: 'fixed',
              value: {
                objectType: 'value',
                valueType: 'string',
                content: { en: 'From Ebersfelde', de: 'Aus Ebersfelde' },
              },
            },
          },
        })
      );

      expect((await valuesOf(golf))['teaser']).toEqual(
        textPer('From Ebersfelde', 'Aus Ebersfelde')
      );
      expect((await valuesOf(polo))['teaser']).toEqual(
        textPer('From Ebersfelde', 'Aus Ebersfelde')
      );
    });

    it('fills a field from several fields together', async function () {
      await withMapping(
        mappingOf({
          fields: {
            [themeTitle.id]: {
              fill: 'field',
              fieldDefinitionId: siteHeadline.id,
            },
            [themeTeaser.id]: {
              fill: 'combined',
              fieldDefinitionIds: [siteHeadline.id, siteSitze.id],
              separator: ', ',
            },
          },
        })
      );

      expect((await valuesOf(golf))['teaser']).toEqual(text('Golf GTI, 5'));
    });

    it('fills a field by matching the options of one field', async function () {
      await withMapping(
        mappingOf({
          fields: {
            [themeTitle.id]: {
              fill: 'field',
              fieldDefinitionId: siteHeadline.id,
            },
            [themeStatus.id]: {
              fill: 'options',
              fieldDefinitionId: siteZustand.id,
              options: [
                { from: 'frei', to: 'available' },
                { from: 'verkauft', to: 'sold' },
              ],
            },
          },
        })
      );

      expect((await valuesOf(golf))['status']).toEqual(text('available'));
      expect((await valuesOf(polo))['status']).toEqual(text('sold'));
    });

    it('fills a field from another language with a fallback', async function () {
      await withMapping(
        mappingOf({
          fields: {
            [themeTitle.id]: {
              fill: 'field',
              fieldDefinitionId: siteHeadline.id,
            },
            [themeTeaser.id]: {
              fill: 'field',
              fieldDefinitionId: siteStandfirst.id,
              language: { order: ['en', 'de'] },
            },
          },
        })
      );

      // English holds nothing there, so German fills both languages
      expect((await valuesOf(polo))['teaser']).toEqual(text('Nur auf Deutsch'));
      // Neither language holds anything, so the field stays empty
      expect((await valuesOf(golf))['teaser']).toEqual(text(null));
    });
  });

  describe('which Entries the website takes', function () {
    /** The Mapping with the Contract's code field filled, which Polo fits */
    function mappingTaking(where: EntryCondition[]): Mapping {
      return mappingOf({
        where,
        fields: {
          [themeTitle.id]: {
            fill: 'field',
            fieldDefinitionId: siteHeadline.id,
          },
          [themeCode.id]: { fill: 'field', fieldDefinitionId: siteHeadline.id },
          [themeRelated.id]: {
            fill: 'field',
            fieldDefinitionId: siteSeeAlso.id,
          },
        },
      });
    }

    it('leaves out the Entries its conditions do not let through', async function () {
      await withMapping(mappingTaking([]));
      const all = await core.destinations.checkAll({
        projectId: siteProjectId,
        id: websiteId,
      });

      // "Golf GTI" is too long for the Contract's code field, "Polo" fits,
      // and a Value is refused in each language holding it
      expect(all).toMatchObject([
        {
          issue: 'constraint_violation',
          entryId: golf,
          fieldSlug: 'headline',
          language: 'en',
        },
        {
          issue: 'constraint_violation',
          entryId: golf,
          fieldSlug: 'headline',
          language: 'de',
        },
      ]);

      await withMapping(
        mappingTaking([
          { fieldDefinitionId: siteZustand.id, equals: ['verkauft'] },
        ])
      );

      expect(
        await core.destinations.checkAll({
          projectId: siteProjectId,
          id: websiteId,
        })
      ).toEqual([]);
    });

    it('names an Entry pointing at one the website does not take', async function () {
      await withMapping(
        mappingTaking([{ fieldDefinitionId: siteZustand.id, equals: ['frei'] }])
      );
      const all = await core.destinations.checkAll({
        projectId: siteProjectId,
        id: websiteId,
      });

      expect(all).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            issue: 'reference_not_taken',
            entryId: golf,
            contractFieldSlug: 'related',
            message: `The field "related" points at the Entry "${polo}" of the Collection "${articles.id}" of the Project, which the website does not take`,
          }),
        ])
      );
      // The one Entry it takes is checked as before
      expect(all).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ issue: 'constraint_violation' }),
        ])
      );
    });

    it('checks one Entry the same way', async function () {
      await withMapping(
        mappingTaking([{ fieldDefinitionId: siteZustand.id, equals: ['frei'] }])
      );

      expect(
        await core.destinations.check({
          projectId: siteProjectId,
          id: websiteId,
          collectionId: articles.id,
          entryId: polo,
        })
      ).toEqual([]);
      expect(
        await core.destinations.check({
          projectId: siteProjectId,
          id: websiteId,
          collectionId: articles.id,
          entryId: golf,
        })
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ issue: 'reference_not_taken' }),
        ])
      );
    });
  });

  describe('checking a Mapping before it is saved', function () {
    it('says why an option, a field and a missing field do not fit', async function () {
      const saved = await withMapping(
        mappingOf({
          fields: {
            [themeTitle.id]: {
              fill: 'field',
              fieldDefinitionId: siteHeadline.id,
            },
          },
        })
      );
      const issues = await core.destinations.checkMapping({
        projectId: siteProjectId,
        id: websiteId,
        mapping: mappingOf({
          fields: {
            [themeStatus.id]: {
              fill: 'field',
              fieldDefinitionId: siteZustand.id,
            },
            [themeTeaser.id]: {
              fill: 'field',
              fieldDefinitionId: siteSitze.id,
            },
          },
        }),
      });

      expect(issues).toMatchObject([
        {
          issue: 'field_not_mapped',
          message:
            'No field of the Project fills the required field "title" of "posts"',
        },
        {
          issue: 'does_not_fit',
          message:
            'The field "teaser" takes a Value of type "string" and the field "sitze" of the Project holds one of type "number"',
        },
        {
          issue: 'option_not_matched',
          message:
            'The option "frei" of the field "zustand" of the Project matches no option of the field "status". Match the options, or pick another field.',
        },
        { issue: 'option_not_matched' },
      ]);
      // Nothing of the Mapping it was asked about was saved
      expect(
        (
          await core.destinations.read({
            projectId: siteProjectId,
            id: websiteId,
          })
        ).mapping
      ).toEqual(saved.mapping);
    });

    it('reads no Entry, so a broken Entry raises nothing', async function () {
      const issues = await core.destinations.checkMapping({
        projectId: siteProjectId,
        id: websiteId,
        mapping: mappingOf({
          fields: {
            [themeTitle.id]: {
              fill: 'field',
              fieldDefinitionId: siteHeadline.id,
            },
            [themeCode.id]: {
              fill: 'field',
              fieldDefinitionId: siteHeadline.id,
            },
          },
        }),
      });

      // The whole-Project check names "Golf GTI" for the code field, this
      // one is about the Mapping alone
      expect(issues).toEqual([]);
    });

    it('refuses a Mapping filling a Collection the Contract does not hold', async function () {
      const saved = await core.destinations.read({
        projectId: siteProjectId,
        id: websiteId,
      });

      await expectCoreError(
        core.destinations.update({
          projectId: siteProjectId,
          id: websiteId,
          mapping: {
            collections: {
              [articles.id]: {
                from: { collectionId: articles.id, where: [] },
                fields: {},
              },
            },
          },
        }),
        'BadRequest',
        'does not hold'
      );
      await expectCoreError(
        core.destinations.checkMapping({
          projectId: siteProjectId,
          id: websiteId,
          mapping: {
            collections: {
              [articles.id]: {
                from: { collectionId: articles.id, where: [] },
                fields: {},
              },
            },
          },
        }),
        'BadRequest',
        'does not hold'
      );
      expect(
        (
          await core.destinations.read({
            projectId: siteProjectId,
            id: websiteId,
          })
        ).mapping
      ).toEqual(saved.mapping);
    });
  });

  describe('a Mapping made before a field had ways of filling', function () {
    it('keeps working as it is', async function () {
      const website = await core.destinations.read({
        projectId: siteProjectId,
        id: websiteId,
      });
      // A `destination.json` as Core wrote one before a field had ways of
      // filling it and a Collection had conditions, written as a second
      // website of the same theme so nothing of it was ever parsed
      const id = uuid();
      const path = core.util.pathTo.destinationFile(siteProjectId, id);
      await Fs.outputJson(path, {
        objectType: 'destination',
        id,
        coreVersion: website.coreVersion,
        created: website.created,
        updated: null,
        name: 'written-before.example',
        kind: 'website',
        contract: website.contract,
        mapping: {
          collections: {
            [themePosts.id]: {
              from: { collectionId: articles.id },
              fields: {
                [themeTitle.id]: { fieldDefinitionId: siteHeadline.id },
              },
            },
            [themeContacts.id]: {
              from: { collectionId: imprints.id },
              fields: {
                [themePhone.id]: { fieldDefinitionId: siteTelephone.id },
              },
            },
          },
        },
      });
      onTestFinished(async function () {
        await Fs.remove(core.util.pathTo.destination(siteProjectId, id));
      });

      const read = await core.destinations.read({
        projectId: siteProjectId,
        id,
      });

      expect(read.mapping.collections[themePosts.id]).toEqual({
        from: { collectionId: articles.id, where: [] },
        fields: {
          [themeTitle.id]: {
            fill: 'field',
            fieldDefinitionId: siteHeadline.id,
          },
        },
      });
      expect(read.createdFromTheme).toEqual({
        collectionIds: [],
        componentIds: [],
      });
      expect(
        await core.destinations.values({
          projectId: siteProjectId,
          id,
          contractCollectionId: themePosts.id,
          entryId: golf,
        })
      ).toMatchObject({ title: text('Golf GTI') });
      expect(
        await core.destinations.checkAll({ projectId: siteProjectId, id })
      ).toEqual([]);
      expect(
        await core.destinations.createdCollections({
          projectId: siteProjectId,
          id,
        })
      ).toEqual([]);
    });
  });

  describe('creating a Collection from the theme', function () {
    /** The website that creates from its theme, as it stands */
    async function creatingWebsite() {
      return core.destinations.read({
        projectId: siteProjectId,
        id: creatingId,
      });
    }

    /** The Collection of the Project one Collection of the theme is filled from */
    async function filledFrom(contractCollectionId: string) {
      const mapping = (await creatingWebsite()).mapping;
      const id = mapping.collections[contractCollectionId]?.from.collectionId;
      if (id === undefined) {
        throw new Error('Nothing fills it');
      }
      return core.collections.read({ projectId: siteProjectId, id });
    }

    it('refuses one pointing at a Collection of the Contract nothing fills', async function () {
      await expectCoreError(
        core.destinations.createCollection({
          projectId: siteProjectId,
          id: creatingId,
          contractCollectionId: creating['landings'].id,
        }),
        'PreconditionFailed',
        'which no Collection of the Project fills'
      );
      expect((await creatingWebsite()).createdFromTheme.collectionIds).toEqual(
        []
      );
    });

    it('creates the Collection with the Components it needs and fills the Mapping with it', async function () {
      const pages = creating['pages'];
      if (pages === undefined) {
        throw new Error('No Collection to create');
      }

      const website = await core.destinations.createCollection({
        projectId: siteProjectId,
        id: creatingId,
        contractCollectionId: pages.id,
      });
      const created = await filledFrom(pages.id);
      const fields = flattenFieldDefinitions(created.fieldDefinitions);
      const sections = fields.find(({ slug }) => slug === 'sections');
      const component = await core.components.readBySlug({
        projectId: siteProjectId,
        slug: 'hero',
      });

      expect(created.slug).toEqual({ singular: 'page', plural: 'pages' });
      expect(created.id).not.toEqual(pages.id);
      // Every id is the Project's own, and the Mapping points at them
      expect(fields.map(({ id }) => id)).not.toContain(
        flattenFieldDefinitions(pages.fieldDefinitions)[0]?.id
      );
      const mapped = website.mapping.collections[pages.id];
      expect(mapped?.from.collectionId).toEqual(created.id);
      expect(
        Object.values(mapped?.fields ?? {}).map((one) =>
          one.fill === 'field' ? one.fieldDefinitionId : one.fill
        )
      ).toEqual(expect.arrayContaining(fields.map(({ id }) => id)));
      // The Component of the theme came with it, under its own id
      expect(sections).toMatchObject({ ofComponents: [component.id] });
      expect(website.createdFromTheme).toEqual({
        collectionIds: [created.id],
        componentIds: [component.id],
      });
      expect(
        await core.destinations.checkMapping({
          projectId: siteProjectId,
          id: creatingId,
          mapping: website.mapping,
        })
      ).toMatchObject([
        { issue: 'collection_not_mapped' },
        { issue: 'collection_not_mapped' },
        { issue: 'collection_not_mapped' },
        { issue: 'collection_not_mapped' },
      ]);
    });

    it('points a Component of the theme at the Collection it came with', async function () {
      const pages = creating['pages'];
      if (pages === undefined) {
        throw new Error('No Collection to create');
      }
      const component = await core.components.readBySlug({
        projectId: siteProjectId,
        slug: 'hero',
      });
      const about = component.fieldDefinitions.find(
        ({ slug }) => slug === 'about-page'
      );

      // The theme points it at its own Collection, so the Component of the
      // Project points at the one created from it rather than at anything
      expect(about).toMatchObject({
        ofCollections: [(await filledFrom(pages.id)).id],
      });
    });

    it('points a reference at what fills it and reuses a Component it created', async function () {
      const landings = creating['landings'];
      const pages = creating['pages'];
      if (landings === undefined || pages === undefined) {
        throw new Error('No Collection to create');
      }
      const before = await core.components.count({ projectId: siteProjectId });

      await core.destinations.createCollection({
        projectId: siteProjectId,
        id: creatingId,
        contractCollectionId: landings.id,
      });
      const created = await filledFrom(landings.id);
      const about = flattenFieldDefinitions(created.fieldDefinitions).find(
        ({ slug }) => slug === 'about'
      );

      expect(about).toMatchObject({
        ofCollections: [(await filledFrom(pages.id)).id],
      });
      expect(await core.components.count({ projectId: siteProjectId })).toEqual(
        before
      );
    });

    it('refuses a Contract whose Components point at each other', async function () {
      const rooms = blockingContract.collections[0];
      if (rooms === undefined) {
        throw new Error('No Collection in the Contract');
      }
      const alpha = uuid();
      const beta = uuid();
      const ringOf = (
        id: string,
        slug: string,
        names: string
      ): Contract['components'][number] => ({
        objectType: 'component',
        id,
        coreVersion: '0.28.0',
        created: '2026-11-26T00:00:00.000Z',
        updated: null,
        name: { en: slug, de: slug },
        slug,
        description: null,
        fieldDefinitions: [dynamicField('inner', [names])],
      });
      // A ring Core's own generate() cannot write, because a Project refuses
      // a Component naming one that names it back
      const ring = await addWebsite({
        projectId: siteProjectId,
        name: 'ring.test',
        contract: {
          ...blockingContract,
          name: '@acme/ring-theme',
          collections: [
            {
              ...rooms,
              slug: { singular: 'ring-room', plural: 'ring-rooms' },
              fieldDefinitions: [dynamicField('blocks', [alpha])],
            },
          ],
          components: [
            ringOf(alpha, 'alpha', beta),
            ringOf(beta, 'beta', alpha),
          ],
        },
      });

      await expectCoreError(
        core.destinations.createCollection({
          projectId: siteProjectId,
          id: ring.website.id,
          contractCollectionId: rooms.id,
        }),
        'BadRequest',
        'in a ring of Components pointing at each other'
      );
      expect(
        (
          await core.components.list({ projectId: siteProjectId, limit: 0 })
        ).list
          .map(({ slug }) => slug)
          .filter((slug) => slug === 'alpha' || slug === 'beta')
      ).toEqual([]);
    });

    it('refuses a Contract naming a Component it does not hold', async function () {
      const rooms = blockingContract.collections[0];
      if (rooms === undefined) {
        throw new Error('No Collection in the Contract');
      }
      const missing = await addWebsite({
        projectId: siteProjectId,
        name: 'missing.test',
        contract: {
          ...blockingContract,
          name: '@acme/missing-theme',
          collections: [
            {
              ...rooms,
              slug: { singular: 'missing-room', plural: 'missing-rooms' },
              fieldDefinitions: [dynamicField('blocks', [uuid()])],
            },
          ],
          components: [],
        },
      });

      await expectCoreError(
        core.destinations.createCollection({
          projectId: siteProjectId,
          id: missing.website.id,
          contractCollectionId: rooms.id,
        }),
        'BadRequest',
        'which the Contract does not hold'
      );
    });

    it('refuses a Collection of the Contract something already fills', async function () {
      await expectCoreError(
        core.destinations.createCollection({
          projectId: siteProjectId,
          id: creatingId,
          contractCollectionId: creating['pages'].id,
        }),
        'Conflict',
        'is filled from the Collection'
      );
    });

    it('refuses to overwrite a Collection the Project already holds', async function () {
      const news = creating['news'];
      if (news === undefined) {
        throw new Error('No Collection to create');
      }
      const own = await createCollectionOf({
        projectId: siteProjectId,
        slug: { singular: 'news-item', plural: 'news' },
        fieldDefinitions: [textField('own-headline')],
      });

      await expectCoreError(
        core.destinations.createCollection({
          projectId: siteProjectId,
          id: creatingId,
          contractCollectionId: news.id,
        }),
        'Conflict',
        `holds the Collection "${own.id}" under the slug "news" already`
      );
      expect(
        (await creatingWebsite()).mapping.collections[news.id]
      ).toBeUndefined();
      expect(
        flattenFieldDefinitions(
          (
            await core.collections.read({
              projectId: siteProjectId,
              id: own.id,
            })
          ).fieldDefinitions
        ).map(({ slug }) => slug)
      ).toEqual(['own-headline']);
    });

    it('refuses to overwrite a Component the Project already holds', async function () {
      const galleries = creating['galleries'];
      if (galleries === undefined) {
        throw new Error('No Collection to create');
      }
      const own = await core.components.create({
        projectId: siteProjectId,
        name: { en: 'Gallery', de: 'Gallery' },
        slug: 'gallery',
        description: null,
        fieldDefinitions: [textField('own-caption')],
      });

      await expectCoreError(
        core.destinations.createCollection({
          projectId: siteProjectId,
          id: creatingId,
          contractCollectionId: galleries.id,
        }),
        'Conflict',
        `holds the Component "${own.id}" under the slug "gallery" already`
      );
      expect(
        (await creatingWebsite()).mapping.collections[galleries.id]
      ).toBeUndefined();
      expect(
        (
          await core.components.read({ projectId: siteProjectId, id: own.id })
        ).fieldDefinitions.map(({ slug }) => slug)
      ).toEqual(['own-caption']);
    });

    it('points a Collection that references itself at itself', async function () {
      const tours = creating['tours'];
      if (tours === undefined) {
        throw new Error('No Collection to create');
      }

      await core.destinations.createCollection({
        projectId: siteProjectId,
        id: creatingId,
        contractCollectionId: tours.id,
      });
      const created = await filledFrom(tours.id);

      expect(
        flattenFieldDefinitions(created.fieldDefinitions).find(
          ({ slug }) => slug === 'nearby'
        )
      ).toMatchObject({ ofCollections: [created.id] });
    });

    it('answers which Collections the website created, leaving out a deleted one', async function () {
      const created = await core.destinations.createdCollections({
        projectId: siteProjectId,
        id: creatingId,
      });
      const tours = await filledFrom(creating['tours'].id);

      expect(created.map(({ slug }) => slug.plural)).toEqual([
        'pages',
        'landings',
        'tours',
      ]);

      await core.collections.delete({
        projectId: siteProjectId,
        id: tours.id,
      });

      expect(
        (
          await core.destinations.createdCollections({
            projectId: siteProjectId,
            id: creatingId,
          })
        ).map(({ slug }) => slug.plural)
      ).toEqual(['pages', 'landings']);
    });
  });

  describe('the version that waits beside the one in use', function () {
    it('gets every way of filling a field, the Values and the check', async function () {
      await withMapping(
        mappingOf({
          fields: {
            [themeTitle.id]: {
              fill: 'field',
              fieldDefinitionId: siteHeadline.id,
            },
          },
        })
      );
      // The theme tags a version holding a Collection the Project lacks
      const offers: Collection = {
        ...structuredClone(creating['news']),
        id: uuid(),
        name: {
          singular: { en: 'offer', de: 'offer' },
          plural: { en: 'offers', de: 'offers' },
        },
        slug: { singular: 'offer', plural: 'offers' },
        fieldDefinitions: [textField('caption')],
      };
      const next: Contract = {
        ...contract,
        version: '1.1.0',
        collections: [...contract.collections, offers],
      };
      await theme.release({ tag: 'v1.1.0', files: contractFileOf(next) });
      const kept = await core.destinations.keepVersion({
        projectId: siteProjectId,
        id: websiteId,
      });
      const waiting = kept.destination.waiting;
      if (waiting === null) {
        throw new Error('No version waits');
      }

      expect(waiting.version).toEqual('1.1.0');
      // What the waiting version needs and nothing fills yet
      expect(
        await core.destinations.checkMapping({
          projectId: siteProjectId,
          id: websiteId,
          mapping: waiting.mapping,
          isWaitingVersion: true,
        })
      ).toMatchObject([
        { issue: 'collection_not_mapped', contractCollectionId: offers.id },
      ]);
      // The Values its Mapping fills, read against its own Contract copy
      expect(
        await core.destinations.values({
          projectId: siteProjectId,
          id: websiteId,
          contractCollectionId: themePosts.id,
          entryId: golf,
          isWaitingVersion: true,
        })
      ).toMatchObject({ title: text('Golf GTI') });

      const website = await core.destinations.createCollection({
        projectId: siteProjectId,
        id: websiteId,
        contractCollectionId: offers.id,
        isWaitingVersion: true,
      });

      // Created for the version that waits, and the one in use is as it was
      expect(
        website.waiting?.mapping.collections[offers.id]?.from.collectionId
      ).toBeDefined();
      expect(website.mapping.collections[offers.id]).toBeUndefined();
      expect(
        await core.destinations.checkMapping({
          projectId: siteProjectId,
          id: websiteId,
          mapping: website.waiting?.mapping ?? { collections: {} },
          isWaitingVersion: true,
        })
      ).toEqual([]);
    });
  });

  describe('a theme whose words do not cover the Project', function () {
    it('refuses to create from it, naming what it lacks', async function () {
      const oneLanguage = await createProject('Theme in one language', {
        language: { default: 'en', supported: ['en'] },
      });
      destroy.push(oneLanguage.destroy);
      await core.collections.create({
        projectId: oneLanguage.id,
        icon: 'home',
        name: { singular: { en: 'listing' }, plural: { en: 'listings' } },
        slug: { singular: 'listing', plural: 'listings' },
        description: { en: 'listings' },
        fieldDefinitions: [
          { ...textField('caption'), label: { en: 'caption' } },
        ],
      });
      const narrow = await core.contracts.generate({
        projectId: oneLanguage.id,
        name: '@acme/english-site',
        version: '1.0.0',
      });
      const { website } = await addWebsite({
        projectId: siteProjectId,
        name: 'english.example',
        contract: narrow,
      });
      const listings = narrow.collections[0];
      if (listings === undefined) {
        throw new Error('No Collection in the Contract');
      }

      await expectCoreError(
        core.destinations.createCollection({
          projectId: siteProjectId,
          id: website.id,
          contractCollectionId: listings.id,
        }),
        'BadRequest',
        '"name"'
      );
      expect(
        (
          await core.destinations.read({
            projectId: siteProjectId,
            id: website.id,
          })
        ).createdFromTheme.collectionIds
      ).toEqual([]);
    });
  });

  describe('creating a field from the theme', function () {
    it('adds it to the Collection filling its Collection of the Contract', async function () {
      await withMapping(
        mappingOf({
          fields: {
            [themeTitle.id]: {
              fill: 'field',
              fieldDefinitionId: siteHeadline.id,
            },
          },
        })
      );

      const website = await core.destinations.createFieldDefinition({
        projectId: siteProjectId,
        id: websiteId,
        contractCollectionId: themePosts.id,
        contractFieldDefinitionId: themeSeats.id,
      });
      const collection = await core.collections.read({
        projectId: siteProjectId,
        id: articles.id,
      });
      const added = flattenFieldDefinitions(collection.fieldDefinitions).find(
        ({ slug }) => slug === 'seats'
      );

      expect(added?.id).not.toEqual(themeSeats.id);
      expect(
        website.mapping.collections[themePosts.id]?.fields[themeSeats.id]
      ).toEqual({ fill: 'field', fieldDefinitionId: added?.id });
      // The Value the website reads comes from the new field right away
      expect((await valuesOf(golf))['seats']).toEqual(count(null));
    });

    it('refuses to overwrite a field the Collection already holds', async function () {
      const refused = await core.destinations
        .createFieldDefinition({
          projectId: siteProjectId,
          id: websiteId,
          contractCollectionId: themePosts.id,
          contractFieldDefinitionId: themeHeadline.id,
        })
        .catch((error: unknown) => error);

      expect(refused).toBeInstanceOf(CoreError);
      const message = refused instanceof CoreError ? refused.message : '';
      expect(message).toContain('holds the field "headline" already');
      // The Collection of the Project is named by its id, because the
      // service boundary logs the message, see contributing/logging.md
      expect(message).toContain(articles.id);
      expect(message).not.toContain(articles.slug.plural);
      expect(
        (
          await core.destinations.read({
            projectId: siteProjectId,
            id: websiteId,
          })
        ).mapping.collections[themePosts.id]?.fields[themeHeadline.id]
      ).toBeUndefined();
    });

    it('refuses a field the Collection of the Contract does not hold', async function () {
      await expectCoreError(
        core.destinations.createFieldDefinition({
          projectId: siteProjectId,
          id: websiteId,
          contractCollectionId: themePosts.id,
          contractFieldDefinitionId: uuid(),
        }),
        'NotFound',
        'has no field'
      );
    });

    it('refuses a field something already fills', async function () {
      await expectCoreError(
        core.destinations.createFieldDefinition({
          projectId: siteProjectId,
          id: websiteId,
          contractCollectionId: themePosts.id,
          contractFieldDefinitionId: themeTitle.id,
        }),
        'Conflict',
        'is filled already'
      );
    });

    it('refuses a field of a Collection of the Contract nothing fills', async function () {
      const blocks = flattenFieldDefinitions(
        creating['galleries'].fieldDefinitions
      )[0];
      if (blocks === undefined) {
        throw new Error('No field to create');
      }

      await expectCoreError(
        core.destinations.createFieldDefinition({
          projectId: siteProjectId,
          id: creatingId,
          contractCollectionId: creating['galleries'].id,
          contractFieldDefinitionId: blocks.id,
        }),
        'PreconditionFailed',
        'so there is nothing to add the field'
      );
    });

    it('creates a required field whose Component comes with it, on the retry', async function () {
      const rooms = blockingContract.collections[0];
      const blocks = flattenFieldDefinitions(
        rooms?.fieldDefinitions ?? []
      ).find(({ slug }) => slug === 'blocks');
      const title = flattenFieldDefinitions(rooms?.fieldDefinitions ?? []).find(
        ({ slug }) => slug === 'title'
      );
      if (rooms === undefined || blocks === undefined || title === undefined) {
        throw new Error('No field to create');
      }
      await core.destinations.update({
        projectId: siteProjectId,
        id: blockingId,
        mapping: {
          collections: {
            [rooms.id]: {
              from: { collectionId: articles.id, where: [] },
              fields: {
                [title.id]: {
                  fill: 'field',
                  fieldDefinitionId: siteHeadline.id,
                },
              },
            },
          },
        },
      });
      const created = () =>
        core.destinations.createFieldDefinition({
          projectId: siteProjectId,
          id: blockingId,
          contractCollectionId: rooms.id,
          contractFieldDefinitionId: blocks.id,
        });

      // The Entries hold no Value for it, so the first call refuses, and the
      // Component it wrote for the field is recorded as this website's
      await expectCoreError(created(), 'Conflict', 'require entry resolutions');
      const teaser = await core.components.readBySlug({
        projectId: siteProjectId,
        slug: 'teaser',
      });
      expect(
        (
          await core.destinations.read({
            projectId: siteProjectId,
            id: blockingId,
          })
        ).createdFromTheme.componentIds
      ).toEqual([teaser.id]);

      const website = await core.destinations.createFieldDefinition({
        projectId: siteProjectId,
        id: blockingId,
        contractCollectionId: rooms.id,
        contractFieldDefinitionId: blocks.id,
        resolutions: {
          [golf]: { blocks: items(teaser.id, { heading: text('Golf') }) },
          [polo]: { blocks: items(teaser.id, { heading: text('Polo') }) },
        },
      });
      const collection = await core.collections.read({
        projectId: siteProjectId,
        id: articles.id,
      });
      const added = flattenFieldDefinitions(collection.fieldDefinitions).find(
        ({ slug }) => slug === 'blocks'
      );

      // The field lands on the retry and the Component is there once
      expect(website.mapping.collections[rooms.id]?.fields[blocks.id]).toEqual({
        fill: 'field',
        fieldDefinitionId: added?.id,
      });
      expect(added).toMatchObject({ ofComponents: [teaser.id] });
      expect(website.createdFromTheme.componentIds).toEqual([teaser.id]);
      expect(
        (
          await core.components.list({ projectId: siteProjectId, limit: 0 })
        ).list
          .filter((one) => one.slug === 'teaser')
          .map(({ id }) => id)
      ).toEqual([teaser.id]);
    });

    it('needs the Value of a required field the Entries have nothing for', async function () {
      const vehicles = demandingContract.collections[0];
      if (vehicles === undefined) {
        throw new Error('No Collection in the Contract');
      }
      await core.destinations.update({
        projectId: siteProjectId,
        id: demandingId,
        mapping: {
          collections: {
            [vehicles.id]: {
              from: { collectionId: articles.id, where: [] },
              fields: {
                [demandedTitle.id]: {
                  fill: 'field',
                  fieldDefinitionId: siteHeadline.id,
                },
              },
            },
          },
        },
      });

      // The Mapping names the field nothing fills, which is what the editor
      // creates from the theme
      expect(
        await core.destinations.checkMapping({
          projectId: siteProjectId,
          id: demandingId,
          mapping: (
            await core.destinations.read({
              projectId: siteProjectId,
              id: demandingId,
            })
          ).mapping,
        })
      ).toMatchObject([
        {
          issue: 'field_not_mapped',
          contractFieldDefinitionId: demandedVin.id,
        },
      ]);
      const refused = await core.destinations
        .createFieldDefinition({
          projectId: siteProjectId,
          id: demandingId,
          contractCollectionId: vehicles.id,
          contractFieldDefinitionId: demandedVin.id,
        })
        .catch((error: unknown) => error);
      if (refused instanceof CoreError === false) {
        throw new Error('The field was added without a Value for it');
      }

      expect(refused.type).toEqual('Conflict');
      // Its cause names every Entry that needs the Value, the way a field
      // definition change does
      expect(
        (Array.isArray(refused.cause) ? refused.cause : []).map(
          (issue: { entryId: string }) => issue.entryId
        )
      ).toEqual(expect.arrayContaining([golf, polo]));

      const website = await core.destinations.createFieldDefinition({
        projectId: siteProjectId,
        id: demandingId,
        contractCollectionId: vehicles.id,
        contractFieldDefinitionId: demandedVin.id,
        resolutions: {
          [golf]: { vin: text('WVWZZZ1KZAW000001') },
          [polo]: { vin: text('WVWZZZ6RZAW000002') },
        },
      });

      expect(
        website.mapping.collections[vehicles.id]?.fields[demandedVin.id]
      ).toBeDefined();
      expect(
        await core.destinations.checkAll({
          projectId: siteProjectId,
          id: demandingId,
        })
      ).toEqual([]);
    });
  });
});
