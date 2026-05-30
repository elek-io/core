import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import core, {
  type ComponentValue,
  type DirectStringValue,
  type Project,
  uuid,
} from '../test/setup.js';
import { createProject } from '../test/util.js';

describe('ComponentService', function () {
  let project: Project & { destroy: () => Promise<void> };

  beforeAll(async function () {
    project = await createProject('ComponentService Test');
  });

  afterAll(async function () {
    await project.destroy();
  });

  it(
    'should be able to create, read, update, list, count, and delete Components',
    { timeout: 30000 },
    async function () {
      // Create a Component
      const heroComponent = await core.components.create({
        projectId: project.id,
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
          {
            id: uuid(),
            slug: 'subtitle',
            valueType: 'string',
            fieldType: 'text',
            label: { en: 'Subtitle', de: 'Subtitle' },
            description: null,
            defaultValue: null,
            isRequired: false,
            isDisabled: false,
            isUnique: false,
            inputWidth: '12',
            min: null,
            max: null,
          },
        ],
      });

      expect(heroComponent.id).to.be.a('string');
      expect(heroComponent.slug).to.equal('hero');
      expect(heroComponent.objectType).to.equal('component');

      // Read the Component
      const readComponent = await core.components.read({
        projectId: project.id,
        id: heroComponent.id,
      });
      expect(readComponent.slug).to.equal('hero');

      // Read by slug
      const readBySlug = await core.components.readBySlug({
        projectId: project.id,
        slug: 'hero',
      });
      expect(readBySlug.id).to.equal(heroComponent.id);

      // Count
      const count = await core.components.count({ projectId: project.id });
      expect(count).to.equal(1);

      // List
      const listed = await core.components.list({ projectId: project.id });
      expect(listed.total).to.equal(1);
      expect(listed.list[0]!.id).to.equal(heroComponent.id);

      // Update the Component (rename a field slug)
      const titleFieldId = heroComponent.fieldDefinitions[0]!.id;
      const subtitleFieldId = heroComponent.fieldDefinitions[1]!.id;
      const updatedComponent = await core.components.update({
        projectId: project.id,
        id: heroComponent.id,
        name: { en: 'Hero Section', de: 'Hero Section' },
        slug: 'hero',
        description: {
          en: 'An updated hero section',
          de: 'An updated hero section',
        },
        fieldDefinitions: [
          {
            id: titleFieldId,
            slug: 'heading', // renamed from 'title'
            valueType: 'string',
            fieldType: 'text',
            label: { en: 'Heading', de: 'Heading' },
            description: null,
            defaultValue: null,
            isRequired: true,
            isDisabled: false,
            isUnique: false,
            inputWidth: '12',
            min: null,
            max: null,
          },
          {
            id: subtitleFieldId,
            slug: 'subtitle',
            valueType: 'string',
            fieldType: 'text',
            label: { en: 'Subtitle', de: 'Subtitle' },
            description: null,
            defaultValue: null,
            isRequired: false,
            isDisabled: false,
            isUnique: false,
            inputWidth: '12',
            min: null,
            max: null,
          },
        ],
      });
      expect(updatedComponent.name.en).to.equal('Hero Section');
      expect(updatedComponent.fieldDefinitions[0]!.slug).to.equal('heading');

      // Create a second Component to test delete protection
      const cardComponent = await core.components.create({
        projectId: project.id,
        name: { en: 'Card', de: 'Card' },
        slug: 'card',
        description: null,
        fieldDefinitions: [
          {
            id: uuid(),
            slug: 'label',
            valueType: 'string',
            fieldType: 'text',
            label: { en: 'Label', de: 'Label' },
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

      // Create a Collection with a dynamic field referencing the hero component
      const pagesCollection = await core.collections.create({
        projectId: project.id,
        icon: 'home',
        name: {
          singular: { en: 'Page', de: 'Page' },
          plural: { en: 'Pages', de: 'Pages' },
        },
        description: {
          en: 'Pages with dynamic blocks',
          de: 'Pages with dynamic blocks',
        },
        slug: { singular: 'page', plural: 'pages' },
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
            ofComponents: [heroComponent.id],
            min: null,
            max: null,
          },
        ],
      });

      // Create an Entry with component data
      const entry = await core.entries.create({
        projectId: project.id,
        collectionId: pagesCollection.id,
        values: {
          blocks: {
            objectType: 'value',
            valueType: 'component',
            content: [
              {
                id: uuid(),
                componentId: heroComponent.id,
                values: {
                  heading: {
                    objectType: 'value',
                    valueType: 'string',
                    content: { en: 'Welcome', de: 'Welcome' },
                  },
                  subtitle: {
                    objectType: 'value',
                    valueType: 'string',
                    content: { en: null, de: null },
                  },
                },
              },
            ],
          },
        },
      });
      expect(entry.id).to.be.a('string');

      // Delete protection: hero component is referenced by the collection
      await expect(
        core.components.delete({
          projectId: project.id,
          id: heroComponent.id,
        })
      ).rejects.toThrow();

      // Card component is not referenced, should delete fine
      await core.components.delete({
        projectId: project.id,
        id: cardComponent.id,
      });
      const countAfterDelete = await core.components.count({
        projectId: project.id,
      });
      expect(countAfterDelete).to.equal(1);

      // History
      const history = await core.components.history({
        projectId: project.id,
        id: heroComponent.id,
      });
      expect(history.length).to.be.greaterThan(0);

      // Clean up
      await core.entries.delete({
        projectId: project.id,
        collectionId: pagesCollection.id,
        id: entry.id,
      });
      await core.collections.delete({
        projectId: project.id,
        id: pagesCollection.id,
      });
      await core.components.delete({
        projectId: project.id,
        id: heroComponent.id,
      });
    }
  );

  it(
    'should detect circular component references',
    { timeout: 15000 },
    async function () {
      const compA = await core.components.create({
        projectId: project.id,
        name: { en: 'Component A', de: 'Component A' },
        slug: 'comp-a',
        description: null,
        fieldDefinitions: [
          {
            id: uuid(),
            slug: 'label',
            valueType: 'string',
            fieldType: 'text',
            label: { en: 'Label', de: 'Label' },
            description: null,
            defaultValue: null,
            isRequired: false,
            isDisabled: false,
            isUnique: false,
            inputWidth: '12',
            min: null,
            max: null,
          },
        ],
      });

      // Create Component B that references A - this is fine
      const compB = await core.components.create({
        projectId: project.id,
        name: { en: 'Component B', de: 'Component B' },
        slug: 'comp-b',
        description: null,
        fieldDefinitions: [
          {
            id: uuid(),
            slug: 'nested-a',
            valueType: 'component',
            fieldType: 'dynamic',
            label: { en: 'Nested A', de: 'Nested A' },
            description: null,
            isRequired: false,
            isDisabled: false,
            isUnique: false,
            inputWidth: '12',
            ofComponents: [compA.id],
            min: null,
            max: null,
          },
        ],
      });

      // Now try to update A to reference B - creating a cycle A->B->A
      await expect(
        core.components.update({
          projectId: project.id,
          id: compA.id,
          name: { en: 'Component A', de: 'Component A' },
          slug: 'comp-a',
          description: null,
          fieldDefinitions: [
            {
              id: uuid(),
              slug: 'nested-b',
              valueType: 'component',
              fieldType: 'dynamic',
              label: { en: 'Nested B', de: 'Nested B' },
              description: null,
              isRequired: false,
              isDisabled: false,
              isUnique: false,
              inputWidth: '12',
              ofComponents: [compB.id],
              min: null,
              max: null,
            },
          ],
        })
      ).rejects.toThrow();

      // Clean up
      await core.components.delete({ projectId: project.id, id: compB.id });
      await core.components.delete({ projectId: project.id, id: compA.id });
    }
  );

  it(
    'should reject duplicate component slugs',
    { timeout: 15000 },
    async function () {
      const comp = await core.components.create({
        projectId: project.id,
        name: { en: 'Unique', de: 'Unique' },
        slug: 'unique-slug',
        description: null,
        fieldDefinitions: [],
      });

      await expect(
        core.components.create({
          projectId: project.id,
          name: { en: 'Duplicate', de: 'Duplicate' },
          slug: 'unique-slug',
          description: null,
          fieldDefinitions: [],
        })
      ).rejects.toThrow();

      await core.components.delete({ projectId: project.id, id: comp.id });
    }
  );

  it(
    'should cascade slug renames through entry data for nested components',
    { timeout: 30000 },
    async function () {
      // Create inner component with a field we'll rename
      const innerFieldId = uuid();
      const innerComponent = await core.components.create({
        projectId: project.id,
        name: { en: 'Inner', de: 'Inner' },
        slug: 'inner',
        description: null,
        fieldDefinitions: [
          {
            id: innerFieldId,
            slug: 'old-name',
            valueType: 'string',
            fieldType: 'text',
            label: { en: 'Name', de: 'Name' },
            description: null,
            defaultValue: null,
            isRequired: false,
            isDisabled: false,
            isUnique: false,
            inputWidth: '12',
            min: null,
            max: null,
          },
        ],
      });

      // Create outer component that references inner
      const outerComponent = await core.components.create({
        projectId: project.id,
        name: { en: 'Outer', de: 'Outer' },
        slug: 'outer',
        description: null,
        fieldDefinitions: [
          {
            id: uuid(),
            slug: 'nested',
            valueType: 'component',
            fieldType: 'dynamic',
            label: { en: 'Nested', de: 'Nested' },
            description: null,
            isRequired: false,
            isDisabled: false,
            isUnique: false,
            inputWidth: '12',
            ofComponents: [innerComponent.id],
            min: null,
            max: null,
          },
        ],
      });

      // Create collection with dynamic field -> outer component
      const collection = await core.collections.create({
        projectId: project.id,
        icon: 'home',
        name: {
          singular: { en: 'Block Page', de: 'Block Page' },
          plural: { en: 'Block Pages', de: 'Block Pages' },
        },
        description: {
          en: 'Pages with nested blocks',
          de: 'Pages with nested blocks',
        },
        slug: { singular: 'block-page', plural: 'block-pages' },
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
            ofComponents: [outerComponent.id],
            min: null,
            max: null,
          },
        ],
      });

      // Create entry with nested component data
      const entry = await core.entries.create({
        projectId: project.id,
        collectionId: collection.id,
        values: {
          sections: {
            objectType: 'value',
            valueType: 'component',
            content: [
              {
                id: uuid(),
                componentId: outerComponent.id,
                values: {
                  nested: {
                    objectType: 'value',
                    valueType: 'component',
                    content: [
                      {
                        id: uuid(),
                        componentId: innerComponent.id,
                        values: {
                          'old-name': {
                            objectType: 'value',
                            valueType: 'string',
                            content: { en: 'Hello', de: 'Hello' },
                          },
                        },
                      },
                    ],
                  },
                },
              },
            ],
          },
        },
      });

      // Rename inner component's field slug from 'old-name' to 'new-name'
      await core.components.update({
        projectId: project.id,
        id: innerComponent.id,
        name: { en: 'Inner', de: 'Inner' },
        slug: 'inner',
        description: null,
        fieldDefinitions: [
          {
            id: innerFieldId,
            slug: 'new-name', // renamed
            valueType: 'string',
            fieldType: 'text',
            label: { en: 'Name', de: 'Name' },
            description: null,
            defaultValue: null,
            isRequired: false,
            isDisabled: false,
            isUnique: false,
            inputWidth: '12',
            min: null,
            max: null,
          },
        ],
      });

      // Read the entry back and verify the slug was cascaded
      const updatedEntry = await core.entries.read({
        projectId: project.id,
        collectionId: collection.id,
        id: entry.id,
      });

      const sections = updatedEntry.values['sections'] as ComponentValue;
      expect(sections).toBeDefined();
      const outerContent = sections.content[0]!;
      const innerContent = (outerContent.values['nested'] as ComponentValue)
        .content[0]!;

      // The old key should be gone, the new key should exist
      expect(innerContent.values['old-name']).toBeUndefined();
      expect(innerContent.values['new-name']).toBeDefined();
      expect(
        (innerContent.values['new-name'] as DirectStringValue).content.en
      ).to.equal('Hello');

      // Clean up
      await core.entries.delete({
        projectId: project.id,
        collectionId: collection.id,
        id: entry.id,
      });
      await core.collections.delete({
        projectId: project.id,
        id: collection.id,
      });
      await core.components.delete({
        projectId: project.id,
        id: outerComponent.id,
      });
      await core.components.delete({
        projectId: project.id,
        id: innerComponent.id,
      });
    }
  );

  it(
    'should validate entries with nested component references',
    { timeout: 30000 },
    async function () {
      // Create Component B (simple)
      const compB = await core.components.create({
        projectId: project.id,
        name: { en: 'Comp B', de: 'Comp B' },
        slug: 'comp-b-nested',
        description: null,
        fieldDefinitions: [
          {
            id: uuid(),
            slug: 'item-count',
            valueType: 'number',
            fieldType: 'number',
            label: { en: 'Count', de: 'Count' },
            description: null,
            defaultValue: null,
            isRequired: false,
            isDisabled: false,
            isUnique: false,
            inputWidth: '12',
            min: null,
            max: null,
          },
        ],
      });

      // Create Component A with dynamic field -> B
      const compA = await core.components.create({
        projectId: project.id,
        name: { en: 'Comp A', de: 'Comp A' },
        slug: 'comp-a-nested',
        description: null,
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
          {
            id: uuid(),
            slug: 'children',
            valueType: 'component',
            fieldType: 'dynamic',
            label: { en: 'Children', de: 'Children' },
            description: null,
            isRequired: false,
            isDisabled: false,
            isUnique: false,
            inputWidth: '12',
            ofComponents: [compB.id],
            min: null,
            max: null,
          },
        ],
      });

      // Collection with dynamic field -> A
      const collection = await core.collections.create({
        projectId: project.id,
        icon: 'home',
        name: {
          singular: { en: 'Nested Page', de: 'Nested Page' },
          plural: { en: 'Nested Pages', de: 'Nested Pages' },
        },
        description: {
          en: 'Testing nested components',
          de: 'Testing nested components',
        },
        slug: { singular: 'nested-page', plural: 'nested-pages' },
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
            ofComponents: [compA.id],
            min: null,
            max: null,
          },
        ],
      });

      // Create entry with nested component data (A containing B)
      const entry = await core.entries.create({
        projectId: project.id,
        collectionId: collection.id,
        values: {
          blocks: {
            objectType: 'value',
            valueType: 'component',
            content: [
              {
                id: uuid(),
                componentId: compA.id,
                values: {
                  title: {
                    objectType: 'value',
                    valueType: 'string',
                    content: { en: 'Hello', de: 'Hello' },
                  },
                  children: {
                    objectType: 'value',
                    valueType: 'component',
                    content: [
                      {
                        id: uuid(),
                        componentId: compB.id,
                        values: {
                          'item-count': {
                            objectType: 'value',
                            valueType: 'number',
                            content: { en: 42, de: 42 },
                          },
                        },
                      },
                    ],
                  },
                },
              },
            ],
          },
        },
      });
      expect(entry.id).to.be.a('string');

      // Read back to verify
      const readEntry = await core.entries.read({
        projectId: project.id,
        collectionId: collection.id,
        id: entry.id,
      });
      expect(readEntry.id).to.equal(entry.id);

      // Clean up
      await core.entries.delete({
        projectId: project.id,
        collectionId: collection.id,
        id: entry.id,
      });
      await core.collections.delete({
        projectId: project.id,
        id: collection.id,
      });
      await core.components.delete({ projectId: project.id, id: compA.id });
      await core.components.delete({ projectId: project.id, id: compB.id });
    }
  );
});

describe('ComponentService - read at a commit', function () {
  let project: Project & { destroy: () => Promise<void> };

  beforeAll(async function () {
    project = await createProject('ComponentService Commit Test');
  });

  afterAll(async function () {
    await project.destroy();
  });

  it('reads the historical version of a Component at a given commit hash', { timeout: 30000 }, async function () {
    const component = await core.components.create({
      projectId: project.id,
      name: { en: 'Orig', de: 'Orig' },
      slug: 'historic',
      description: { en: 'Original', de: 'Original' },
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

    const historyAfterCreate = await core.components.history({
      projectId: project.id,
      id: component.id,
    });
    const creationHash = historyAfterCreate[historyAfterCreate.length - 1]!.hash;

    // A metadata-only update (name) — no field definition changes.
    await core.components.update({
      projectId: project.id,
      id: component.id,
      name: { en: 'Changed', de: 'Changed' },
      slug: 'historic',
      description: { en: 'Original', de: 'Original' },
      fieldDefinitions: component.fieldDefinitions,
    });

    const historical = await core.components.read({
      projectId: project.id,
      id: component.id,
      commitHash: creationHash,
    });
    expect(historical.name.en).to.equal('Orig');

    const current = await core.components.read({
      projectId: project.id,
      id: component.id,
    });
    expect(current.name.en).to.equal('Changed');

    await core.components.delete({ projectId: project.id, id: component.id });
  });
});

describe('ComponentService - update slug conflict', function () {
  let project: Project & { destroy: () => Promise<void> };

  beforeAll(async function () {
    project = await createProject('ComponentService Slug Conflict Test');
  });

  afterAll(async function () {
    await project.destroy();
  });

  const textComponent = (slug: string) => ({
    projectId: project.id,
    name: { en: slug, de: slug },
    slug,
    description: { en: slug, de: slug },
    fieldDefinitions: [
      {
        id: uuid(),
        slug: 'title',
        valueType: 'string' as const,
        fieldType: 'text' as const,
        label: { en: 'Title', de: 'Title' },
        description: null,
        defaultValue: null,
        isRequired: true,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12' as const,
        min: null,
        max: null,
      },
    ],
  });

  it('rejects updating a Component slug to one already used by another Component', { timeout: 30000 }, async function () {
    const alpha = await core.components.create(textComponent('alpha'));
    const beta = await core.components.create(textComponent('beta'));

    await expect(
      core.components.update({
        projectId: project.id,
        id: beta.id,
        name: beta.name,
        slug: 'alpha', // conflicts with the alpha component
        description: beta.description,
        fieldDefinitions: beta.fieldDefinitions,
      })
    ).rejects.toThrow(/already in use/);

    await core.components.delete({ projectId: project.id, id: alpha.id });
    await core.components.delete({ projectId: project.id, id: beta.id });
  });
});

describe('ComponentService - update entry resolutions', function () {
  let project: Project & { destroy: () => Promise<void> };
  let heroId: string;
  let collectionId: string;
  let entryId: string;

  // Adds a new REQUIRED field with no default to the hero Component, which
  // cannot be auto-resolved for the existing entry's component item.
  const heroWithRequiredSubtitle = () => ({
    projectId: project.id,
    id: heroId,
    name: { en: 'Hero', de: 'Hero' },
    slug: 'hero',
    description: { en: 'Hero', de: 'Hero' },
    fieldDefinitions: [
      {
        id: titleFieldId,
        slug: 'title',
        valueType: 'string' as const,
        fieldType: 'text' as const,
        label: { en: 'Title', de: 'Title' },
        description: null,
        defaultValue: null,
        isRequired: true,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12' as const,
        min: null,
        max: null,
      },
      {
        id: uuid(),
        slug: 'subtitle',
        valueType: 'string' as const,
        fieldType: 'text' as const,
        label: { en: 'Subtitle', de: 'Subtitle' },
        description: null,
        defaultValue: null,
        isRequired: true, // new required field, no default -> missing_required issue
        isDisabled: false,
        isUnique: false,
        inputWidth: '12' as const,
        min: null,
        max: null,
      },
    ],
  });

  let titleFieldId: string;

  beforeAll(async function () {
    project = await createProject('ComponentService Resolutions Test');

    titleFieldId = uuid();
    const hero = await core.components.create({
      projectId: project.id,
      name: { en: 'Hero', de: 'Hero' },
      slug: 'hero',
      description: { en: 'Hero', de: 'Hero' },
      fieldDefinitions: [
        {
          id: titleFieldId,
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
    heroId = hero.id;

    const collection = await core.collections.create({
      projectId: project.id,
      icon: 'home',
      name: { singular: { en: 'Page', de: 'Page' }, plural: { en: 'Pages', de: 'Pages' } },
      description: { en: 'Pages', de: 'Pages' },
      slug: { singular: 'page', plural: 'pages' },
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
          ofComponents: [heroId],
          min: null,
          max: null,
        },
      ],
    });
    collectionId = collection.id;

    const entry = await core.entries.create({
      projectId: project.id,
      collectionId,
      values: {
        blocks: {
          objectType: 'value',
          valueType: 'component',
          content: [
            {
              id: uuid(),
              componentId: heroId,
              values: {
                title: {
                  objectType: 'value',
                  valueType: 'string',
                  content: { en: 'Welcome', de: 'Welcome' },
                },
              },
            },
          ],
        },
      },
    });
    entryId = entry.id;
  }, 30000);

  afterAll(async function () {
    await project.destroy();
  });

  it('throws a conflict when field changes need unresolved entry resolutions', { timeout: 30000 }, async function () {
    await expect(
      core.components.update(heroWithRequiredSubtitle())
    ).rejects.toThrow(/require entry resolutions/);
  });

  it('rejects a resolution value that fails the new field schema', { timeout: 30000 }, async function () {
    await expect(
      core.components.update({
        ...heroWithRequiredSubtitle(),
        resolutions: {
          // Generically a valid Value, but the wrong valueType for a string field.
          [entryId]: {
            subtitle: {
              objectType: 'value',
              valueType: 'number',
              content: { en: 1, de: 1 },
            },
          },
        },
      })
    ).rejects.toThrow(/Resolution validation failed/);
  });
});
