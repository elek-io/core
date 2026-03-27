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
        name: { en: 'Hero' },
        slug: 'hero',
        description: { en: 'A hero section' },
        fieldDefinitions: [
          {
            id: uuid(),
            slug: 'title',
            valueType: 'string',
            fieldType: 'text',
            label: { en: 'Title' },
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
            label: { en: 'Subtitle' },
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
        name: { en: 'Hero Section' },
        slug: 'hero',
        description: { en: 'An updated hero section' },
        fieldDefinitions: [
          {
            id: titleFieldId,
            slug: 'heading', // renamed from 'title'
            valueType: 'string',
            fieldType: 'text',
            label: { en: 'Heading' },
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
            label: { en: 'Subtitle' },
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
        name: { en: 'Card' },
        slug: 'card',
        description: null,
        fieldDefinitions: [
          {
            id: uuid(),
            slug: 'label',
            valueType: 'string',
            fieldType: 'text',
            label: { en: 'Label' },
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
          singular: { en: 'Page' },
          plural: { en: 'Pages' },
        },
        description: { en: 'Pages with dynamic blocks' },
        slug: { singular: 'page', plural: 'pages' },
        fieldDefinitions: [
          {
            id: uuid(),
            slug: 'blocks',
            valueType: 'component',
            fieldType: 'dynamic',
            label: { en: 'Blocks' },
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
                componentId: heroComponent.id,
                values: {
                  heading: {
                    objectType: 'value',
                    valueType: 'string',
                    content: { en: 'Welcome' },
                  },
                  subtitle: {
                    objectType: 'value',
                    valueType: 'string',
                    content: {},
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
        name: { en: 'Component A' },
        slug: 'comp-a',
        description: null,
        fieldDefinitions: [
          {
            id: uuid(),
            slug: 'label',
            valueType: 'string',
            fieldType: 'text',
            label: { en: 'Label' },
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
        name: { en: 'Component B' },
        slug: 'comp-b',
        description: null,
        fieldDefinitions: [
          {
            id: uuid(),
            slug: 'nested-a',
            valueType: 'component',
            fieldType: 'dynamic',
            label: { en: 'Nested A' },
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
          name: { en: 'Component A' },
          slug: 'comp-a',
          description: null,
          fieldDefinitions: [
            {
              id: uuid(),
              slug: 'nested-b',
              valueType: 'component',
              fieldType: 'dynamic',
              label: { en: 'Nested B' },
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
        name: { en: 'Unique' },
        slug: 'unique-slug',
        description: null,
        fieldDefinitions: [],
      });

      await expect(
        core.components.create({
          projectId: project.id,
          name: { en: 'Duplicate' },
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
        name: { en: 'Inner' },
        slug: 'inner',
        description: null,
        fieldDefinitions: [
          {
            id: innerFieldId,
            slug: 'old-name',
            valueType: 'string',
            fieldType: 'text',
            label: { en: 'Name' },
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
        name: { en: 'Outer' },
        slug: 'outer',
        description: null,
        fieldDefinitions: [
          {
            id: uuid(),
            slug: 'nested',
            valueType: 'component',
            fieldType: 'dynamic',
            label: { en: 'Nested' },
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
          singular: { en: 'Block Page' },
          plural: { en: 'Block Pages' },
        },
        description: { en: 'Pages with nested blocks' },
        slug: { singular: 'block-page', plural: 'block-pages' },
        fieldDefinitions: [
          {
            id: uuid(),
            slug: 'sections',
            valueType: 'component',
            fieldType: 'dynamic',
            label: { en: 'Sections' },
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
                componentId: outerComponent.id,
                values: {
                  nested: {
                    objectType: 'value',
                    valueType: 'component',
                    content: [
                      {
                        componentId: innerComponent.id,
                        values: {
                          'old-name': {
                            objectType: 'value',
                            valueType: 'string',
                            content: { en: 'Hello' },
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
        name: { en: 'Inner' },
        slug: 'inner',
        description: null,
        fieldDefinitions: [
          {
            id: innerFieldId,
            slug: 'new-name', // renamed
            valueType: 'string',
            fieldType: 'text',
            label: { en: 'Name' },
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
        name: { en: 'Comp B' },
        slug: 'comp-b-nested',
        description: null,
        fieldDefinitions: [
          {
            id: uuid(),
            slug: 'item-count',
            valueType: 'number',
            fieldType: 'number',
            label: { en: 'Count' },
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
        name: { en: 'Comp A' },
        slug: 'comp-a-nested',
        description: null,
        fieldDefinitions: [
          {
            id: uuid(),
            slug: 'title',
            valueType: 'string',
            fieldType: 'text',
            label: { en: 'Title' },
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
            label: { en: 'Children' },
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
          singular: { en: 'Nested Page' },
          plural: { en: 'Nested Pages' },
        },
        description: { en: 'Testing nested components' },
        slug: { singular: 'nested-page', plural: 'nested-pages' },
        fieldDefinitions: [
          {
            id: uuid(),
            slug: 'blocks',
            valueType: 'component',
            fieldType: 'dynamic',
            label: { en: 'Blocks' },
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
                componentId: compA.id,
                values: {
                  title: {
                    objectType: 'value',
                    valueType: 'string',
                    content: { en: 'Hello' },
                  },
                  children: {
                    objectType: 'value',
                    valueType: 'component',
                    content: [
                      {
                        componentId: compB.id,
                        values: {
                          'item-count': {
                            objectType: 'value',
                            valueType: 'number',
                            content: { en: 42 },
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
