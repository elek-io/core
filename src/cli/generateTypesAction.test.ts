import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import core, { type Project, uuid } from '../test/setup.js';
import { createProject } from '../test/util.js';
import { generateTypesForProject } from './generateTypesAction.js';

describe('generateTypesForProject', () => {
  let project: Project & { destroy: () => Promise<void> };

  beforeAll(async () => {
    project = await createProject('generateTypesForProject Test');

    const cta = await core.components.create({
      projectId: project.id,
      name: { en: 'CTA', de: 'CTA' },
      slug: 'cta',
      description: { en: 'A call to action', de: 'A call to action' },
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

    const hero = await core.components.create({
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
          slug: 'sub-blocks',
          valueType: 'component',
          fieldType: 'dynamic',
          label: { en: 'Sub blocks', de: 'Sub blocks' },
          description: null,
          isRequired: false,
          isDisabled: false,
          isUnique: false,
          inputWidth: '12',
          ofComponents: [cta.id],
          min: null,
          max: null,
        },
      ],
    });

    await core.collections.create({
      projectId: project.id,
      icon: 'home',
      name: {
        singular: { en: 'Blog post', de: 'Blogeintrag' },
        plural: { en: 'Blog posts', de: 'Blogeinträge' },
      },
      slug: { singular: 'blog-post', plural: 'blog-posts' },
      description: { en: 'Blog posts', de: 'Blogeinträge' },
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
          ofComponents: [hero.id],
          min: null,
          max: null,
        },
      ],
    });
  }, 30000);

  afterAll(async () => {
    await project.destroy();
  });

  it('emits a per-Component-internal discriminated union for nested dynamic fields', async () => {
    const output = await generateTypesForProject(project);

    expect(output).toContain('export type HeroSubBlocksItem =');
    expect(output).toContain(
      '| { id: string; componentId: typeof CtaComponentId; values: CtaComponentValues }'
    );
  });

  it('references the per-field item type from the Component values interface', async () => {
    const output = await generateTypesForProject(project);

    const valuesBlockMatch = output.match(
      /export interface HeroComponentValues \{[\s\S]*?\n\}/
    );
    expect(valuesBlockMatch).not.toBeNull();
    const valuesBlock = valuesBlockMatch?.[0] ?? '';

    expect(valuesBlock).toContain(`'sub-blocks': {`);
    expect(valuesBlock).toContain(`content: HeroSubBlocksItem[];`);
    expect(valuesBlock).not.toContain('ComponentValue;');
  });

  it('still emits the collection-level discriminated union', async () => {
    const output = await generateTypesForProject(project);

    expect(output).toContain('export type BlogPostsBlocksItem =');
    expect(output).toContain(
      '| { id: string; componentId: typeof HeroComponentId; values: HeroComponentValues }'
    );
  });
});

describe('generateTypesForProject - missing component reference', () => {
  let project: Project & { destroy: () => Promise<void> };
  let orphanId: string;

  beforeAll(async () => {
    project = await createProject(
      'generateTypesForProject Missing Component Test'
    );

    // Collection.create does not validate ofComponents existence - referencing
    // an unknown UUID is accepted at write time and surfaces only at generation.
    orphanId = uuid();
    await core.collections.create({
      projectId: project.id,
      icon: 'home',
      name: {
        singular: { en: 'Page', de: 'Seite' },
        plural: { en: 'Pages', de: 'Seiten' },
      },
      slug: { singular: 'page', plural: 'pages' },
      description: { en: 'Pages', de: 'Seiten' },
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
          ofComponents: [orphanId],
          min: null,
          max: null,
        },
      ],
    });
  }, 30000);

  afterAll(async () => {
    await project.destroy();
  });

  it('throws when ofComponents references an unknown Component', async () => {
    await expect(generateTypesForProject(project)).rejects.toThrow(
      `Component "${orphanId}" referenced by dynamic field "blocks" not found in project`
    );
  });
});
