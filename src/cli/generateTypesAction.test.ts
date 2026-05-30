import Fs from 'fs-extra';
import Path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import core, {
  type MarkdownFeatures,
  type Project,
  uuid,
} from '../test/setup.js';
import { createProject, expectTranspiles } from '../test/util.js';
import {
  generateTypes,
  generateTypesForProject,
} from './generateTypesAction.js';

/** All markdown features OFF — the all-field-types collection just needs a valid markdown field. */
const offMarkdownFeatures: MarkdownFeatures = {
  headings: [],
  blockquotes: false,
  lists: false,
  codeBlocks: false,
  thematicBreak: false,
  rawHtml: false,
  tables: false,
  taskListItems: false,
  footnotes: false,
  emphasis: false,
  strong: false,
  inlineCode: false,
  externalLinks: false,
  entryReferences: false,
  externalImages: false,
  assetReferences: false,
  strikethrough: false,
  hardLineBreaks: false,
};

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
      `Component "${orphanId}" referenced by dynamic field "blocks" not found in Project`
    );
  });
});

describe('generateTypesForProject - markdown field', () => {
  let project: Project & { destroy: () => Promise<void> };

  beforeAll(async () => {
    project = await createProject('generateTypesForProject Markdown Test');

    const features: MarkdownFeatures = {
      headings: [2, 3],
      blockquotes: true,
      lists: true,
      codeBlocks: false,
      thematicBreak: false,
      rawHtml: false,
      tables: false,
      taskListItems: true,
      footnotes: false,
      emphasis: true,
      strong: true,
      inlineCode: false,
      externalLinks: true,
      entryReferences: true,
      externalImages: false,
      assetReferences: true,
      strikethrough: false,
      hardLineBreaks: false,
    };

    await core.collections.create({
      projectId: project.id,
      icon: 'home',
      name: {
        singular: { en: 'Article', de: 'Article' },
        plural: { en: 'Articles', de: 'Articles' },
      },
      slug: { singular: 'article', plural: 'articles' },
      description: { en: 'Articles', de: 'Articles' },
      fieldDefinitions: [
        {
          id: uuid(),
          slug: 'body',
          valueType: 'mdast',
          fieldType: 'markdown',
          label: { en: 'Body', de: 'Body' },
          description: null,
          isRequired: false,
          isDisabled: false,
          isUnique: false,
          inputWidth: '12',
          min: null,
          max: null,
          features,
          ofCollections: [],
          ofAssetMimeTypes: ['image/jpeg', 'image/png'],
          defaultValue: null,
        },
      ],
    });
  }, 30000);

  afterAll(async () => {
    await project.destroy();
  });

  it('imports MdAstValue and MdAstRoot from @elek-io/core', async () => {
    const output = await generateTypesForProject(project);
    expect(output).toContain('MdAstValue');
    expect(output).toContain('MdAstRoot');
  });

  it('imports MarkdownFieldDefinition from @elek-io/core', async () => {
    const output = await generateTypesForProject(project);
    expect(output).toContain('MarkdownFieldDefinition');
  });

  it('emits the narrowed mdast content type on the Values interface', async () => {
    const output = await generateTypesForProject(project);

    const valuesBlockMatch = output.match(
      /export interface ArticlesValues \{[\s\S]*?\n\}/
    );
    expect(valuesBlockMatch).not.toBeNull();
    const valuesBlock = valuesBlockMatch?.[0] ?? '';

    expect(valuesBlock).toContain('body:');
    // The narrowed mdast value type from getNarrowedValueType('mdast').
    expect(valuesBlock).toContain(
      `Omit<MdAstValue, 'content'> & { content: Record<ProjectLanguage, MdAstRoot | null> }`
    );
  });

  it('emits features, ofCollections, ofAssetMimeTypes as literals in the fieldDefinitions tuple', async () => {
    const output = await generateTypesForProject(project);

    // The narrowed fieldDefinitions tuple lives inside the Collection
    // wrapper type — find that block and inspect it.
    const collectionBlockMatch = output.match(
      /export type ArticlesCollection[\s\S]*?\n\}/
    );
    expect(collectionBlockMatch).not.toBeNull();
    const collectionBlock = collectionBlockMatch?.[0] ?? '';

    // features as a literal object (alphabetical key order)
    expect(collectionBlock).toContain('features:');
    expect(collectionBlock).toContain('headings: [2, 3];');
    expect(collectionBlock).toContain('emphasis: true;');
    expect(collectionBlock).toContain('strong: true;');
    expect(collectionBlock).toContain('rawHtml: false;');
    expect(collectionBlock).toContain('lists: true;');
    expect(collectionBlock).toContain('taskListItems: true;');
    expect(collectionBlock).toContain('codeBlocks: false;');

    // ofCollections as a literal array (empty here)
    expect(collectionBlock).toContain('ofCollections: [];');

    // ofAssetMimeTypes as a literal array
    expect(collectionBlock).toContain(
      `ofAssetMimeTypes: ['image/jpeg', 'image/png'];`
    );
  });

  it('emits every MarkdownFeatures key (no silent drift when a new flag is added)', async () => {
    const output = await generateTypesForProject(project);
    const collectionBlockMatch = output.match(
      /export type ArticlesCollection[\s\S]*?\n\}/
    );
    const collectionBlock = collectionBlockMatch?.[0] ?? '';

    // Drive expectation off a fully-populated MarkdownFeatures instance so
    // adding a new feature flag forces this test to acknowledge it.
    const fullFeatures: MarkdownFeatures = {
      headings: [],
      blockquotes: false,
      lists: false,
      codeBlocks: false,
      thematicBreak: false,
      rawHtml: false,
      tables: false,
      taskListItems: false,
      footnotes: false,
      emphasis: false,
      strong: false,
      inlineCode: false,
      externalLinks: false,
      entryReferences: false,
      externalImages: false,
      assetReferences: false,
      strikethrough: false,
      hardLineBreaks: false,
    };

    for (const key of Object.keys(fullFeatures)) {
      expect(collectionBlock).toContain(`${key}:`);
    }
  });
});

describe('generateTypesForProject - every field type', () => {
  let project: Project & { destroy: () => Promise<void> };
  let output: string;

  beforeAll(async () => {
    // Single supported language keeps field labels to `{ en }` only.
    project = await createProject('generateTypesForProject All Field Types', {
      language: { default: 'en', supported: ['en'] },
    });

    // One field of every fieldType, plus a FieldDefinitionGroup. This drives
    // every branch of getValueTypeName / getNarrowedValueType /
    // getFieldDefinitionTypeName as well as the group-emitting branch.
    const base = {
      description: null,
      isDisabled: false,
      inputWidth: '12' as const,
    };
    await core.collections.create({
      projectId: project.id,
      icon: 'home',
      name: {
        singular: { en: 'Widget' },
        plural: { en: 'Widgets' },
      },
      slug: { singular: 'widget', plural: 'widgets' },
      description: { en: 'Widgets' },
      fieldDefinitions: [
        {
          ...base,
          id: uuid(),
          slug: 'text-field',
          valueType: 'string',
          fieldType: 'text',
          label: { en: 'Text' },
          isRequired: false,
          isUnique: false,
          min: null,
          max: null,
          defaultValue: null,
        },
        {
          ...base,
          id: uuid(),
          slug: 'textarea-field',
          valueType: 'string',
          fieldType: 'textarea',
          label: { en: 'Textarea' },
          isRequired: false,
          isUnique: false,
          min: null,
          max: null,
          defaultValue: null,
        },
        {
          ...base,
          id: uuid(),
          slug: 'email-field',
          valueType: 'string',
          fieldType: 'email',
          label: { en: 'Email' },
          isRequired: false,
          isUnique: false,
          defaultValue: null,
        },
        {
          ...base,
          id: uuid(),
          slug: 'url-field',
          valueType: 'string',
          fieldType: 'url',
          label: { en: 'Url' },
          isRequired: false,
          isUnique: false,
          defaultValue: null,
        },
        {
          ...base,
          id: uuid(),
          slug: 'ipv4-field',
          valueType: 'string',
          fieldType: 'ipv4',
          label: { en: 'Ipv4' },
          isRequired: false,
          isUnique: false,
          defaultValue: null,
        },
        {
          ...base,
          id: uuid(),
          slug: 'date-field',
          valueType: 'string',
          fieldType: 'date',
          label: { en: 'Date' },
          isRequired: false,
          isUnique: false,
          defaultValue: null,
        },
        {
          ...base,
          id: uuid(),
          slug: 'time-field',
          valueType: 'string',
          fieldType: 'time',
          label: { en: 'Time' },
          isRequired: false,
          isUnique: false,
          defaultValue: null,
        },
        {
          ...base,
          id: uuid(),
          slug: 'datetime-field',
          valueType: 'string',
          fieldType: 'datetime',
          label: { en: 'Datetime' },
          isRequired: false,
          isUnique: false,
          defaultValue: null,
        },
        {
          ...base,
          id: uuid(),
          slug: 'telephone-field',
          valueType: 'string',
          fieldType: 'telephone',
          label: { en: 'Telephone' },
          isRequired: false,
          isUnique: false,
          defaultValue: null,
        },
        {
          ...base,
          id: uuid(),
          slug: 'string-select-field',
          valueType: 'string',
          fieldType: 'select',
          label: { en: 'String select' },
          isRequired: false,
          isUnique: false,
          defaultValue: null,
          options: [{ value: 'a', label: { en: 'A' } }],
        },
        {
          ...base,
          id: uuid(),
          slug: 'number-field',
          valueType: 'number',
          fieldType: 'number',
          label: { en: 'Number' },
          isRequired: false,
          isUnique: false,
          min: null,
          max: null,
          defaultValue: null,
        },
        {
          ...base,
          id: uuid(),
          slug: 'range-field',
          valueType: 'number',
          fieldType: 'range',
          label: { en: 'Range' },
          isRequired: true,
          isUnique: false,
          min: 0,
          max: 10,
          defaultValue: 5,
        },
        {
          ...base,
          id: uuid(),
          slug: 'number-select-field',
          valueType: 'number',
          fieldType: 'select',
          label: { en: 'Number select' },
          isRequired: false,
          isUnique: false,
          min: null,
          max: null,
          defaultValue: null,
          options: [{ value: 1, label: { en: 'One' } }],
        },
        {
          ...base,
          id: uuid(),
          slug: 'toggle-field',
          valueType: 'boolean',
          fieldType: 'toggle',
          label: { en: 'Toggle' },
          isRequired: true,
          isUnique: false,
          defaultValue: false,
        },
        {
          ...base,
          id: uuid(),
          slug: 'asset-field',
          valueType: 'reference',
          fieldType: 'asset',
          label: { en: 'Asset' },
          isRequired: false,
          isUnique: false,
          min: null,
          max: null,
          ofAssetMimeTypes: [],
        },
        {
          ...base,
          id: uuid(),
          slug: 'entry-field',
          valueType: 'reference',
          fieldType: 'entry',
          label: { en: 'Entry' },
          isRequired: false,
          isUnique: false,
          min: null,
          max: null,
          ofCollections: [],
        },
        {
          ...base,
          id: uuid(),
          slug: 'dynamic-field',
          valueType: 'component',
          fieldType: 'dynamic',
          label: { en: 'Dynamic' },
          isRequired: false,
          isUnique: false,
          min: null,
          max: null,
          ofComponents: [],
        },
        {
          ...base,
          id: uuid(),
          slug: 'markdown-field',
          valueType: 'mdast',
          fieldType: 'markdown',
          label: { en: 'Markdown' },
          isRequired: false,
          isUnique: false,
          min: null,
          max: null,
          features: offMarkdownFeatures,
          ofCollections: [],
          ofAssetMimeTypes: [],
          defaultValue: null,
        },
        {
          isGroup: true,
          id: uuid(),
          label: { en: 'Group' },
          description: null,
          fieldDefinitions: [
            {
              ...base,
              id: uuid(),
              slug: 'grouped-text',
              valueType: 'string',
              fieldType: 'text',
              label: { en: 'Grouped text' },
              isRequired: false,
              isUnique: false,
              min: null,
              max: null,
              defaultValue: null,
            },
          ],
        },
      ],
    });

    output = await generateTypesForProject(project);
  }, 30000);

  afterAll(async () => {
    await project.destroy();
  });

  it('imports every FieldDefinition subtype used by the collection', () => {
    for (const typeName of [
      'TextFieldDefinition',
      'TextareaFieldDefinition',
      'EmailFieldDefinition',
      'UrlFieldDefinition',
      'Ipv4FieldDefinition',
      'DateFieldDefinition',
      'TimeFieldDefinition',
      'DatetimeFieldDefinition',
      'TelephoneFieldDefinition',
      'StringSelectFieldDefinition',
      'NumberFieldDefinition',
      'RangeFieldDefinition',
      'NumberSelectFieldDefinition',
      'ToggleFieldDefinition',
      'AssetFieldDefinition',
      'EntryFieldDefinition',
      'DynamicFieldDefinition',
      'MarkdownFieldDefinition',
    ]) {
      expect(output, typeName).toContain(typeName);
    }
  });

  it('emits the narrowed value types for direct, number, boolean, reference and mdast fields', () => {
    expect(output).toContain('DirectStringValue');
    expect(output).toContain('DirectNumberValue');
    expect(output).toContain('DirectBooleanValue');
    expect(output).toContain('ReferencedValue');
    expect(output).toContain('MdAstValue');
  });

  it('emits a FieldDefinitionGroup wrapper for grouped fields', () => {
    expect(output).toContain('FieldDefinitionGroup & {');
    expect(output).toContain('isGroup: true;');
  });

  it('emits TypeScript that transpiles without syntax errors', () => {
    // Substring assertions above check intent; this checks the output is
    // actually well-formed TypeScript (the richest input: every field type
    // plus a group, where malformed type literals are most likely).
    expectTranspiles(output, 'generated types');
  });
});

describe('generateTypes - writes type files to disk', () => {
  let project: Project & { destroy: () => Promise<void> };
  let outDir: string;

  beforeAll(async () => {
    project = await createProject('generateTypes Disk Test', {
      language: { default: 'en', supported: ['en'] },
    });
    outDir = Path.join(core.util.pathTo.tmp, `generate-types-${uuid()}`);
    await core.collections.create({
      projectId: project.id,
      icon: 'home',
      name: {
        singular: { en: 'Note' },
        plural: { en: 'Notes' },
      },
      slug: { singular: 'note', plural: 'notes' },
      description: { en: 'Notes' },
      fieldDefinitions: [
        {
          id: uuid(),
          slug: 'title',
          valueType: 'string',
          fieldType: 'text',
          label: { en: 'Title' },
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
  }, 30000);

  afterAll(async () => {
    await project.destroy();
    await Fs.remove(outDir);
  });

  it('writes a types.ts file and returns a project-id-to-file map', async () => {
    const result = await generateTypes({ outDir, projects: [project.id] });

    expect(result.get(project.id)).toBe('types.ts');
    const written = await Fs.readFile(Path.join(outDir, 'types.ts'), 'utf-8');
    expect(written).toContain('export type NotesCollection');
  });
});
