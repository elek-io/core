import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { uuid } from '../test/setup.js';
import {
  getCreateCollectionSchemaFromLanguages,
  getCreateComponentSchemaFromLanguages,
  getCreateEntrySchemaFromFieldDefinitions,
  getEntrySchemaFromFieldDefinitions,
  getUpdateCollectionSchemaFromLanguages,
  getUpdateComponentSchemaFromLanguages,
  getUpdateEntrySchemaFromFieldDefinitions,
} from './strictEntitySchema.js';
import type { FieldDefinition } from './fieldSchema.js';

const singleLanguage = ['en'] as const;
const bilingual = ['en', 'de'] as const;

type TranslatableString = Record<string, string>;

function titleFieldDef(
  label: TranslatableString,
  description: TranslatableString | null = null
): FieldDefinition {
  return {
    id: uuid(),
    slug: 'title',
    valueType: 'string',
    fieldType: 'text',
    label,
    description,
    isRequired: true,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12',
    min: null,
    max: null,
    defaultValue: null,
  };
}

function bilingualCollection({
  nameSingular = { en: 'Product', de: 'Produkt' },
  namePlural = { en: 'Products', de: 'Produkte' },
  description = { en: 'A product', de: 'Ein Produkt' },
  fieldDefinitions = [titleFieldDef({ en: 'Title', de: 'Titel' })],
}: {
  nameSingular?: TranslatableString;
  namePlural?: TranslatableString;
  description?: TranslatableString;
  fieldDefinitions?: FieldDefinition[];
} = {}) {
  return {
    projectId: uuid(),
    icon: 'home' as const,
    name: { singular: nameSingular, plural: namePlural },
    slug: { singular: 'product', plural: 'products' },
    description,
    fieldDefinitions,
  };
}

function bilingualComponent({
  name = { en: 'Hero', de: 'Held' },
  description = { en: 'A hero section', de: 'Ein Hero-Bereich' },
  fieldDefinitions = [titleFieldDef({ en: 'Title', de: 'Titel' })],
}: {
  name?: TranslatableString;
  description?: TranslatableString | null;
  fieldDefinitions?: FieldDefinition[];
} = {}) {
  return {
    projectId: uuid(),
    name,
    slug: 'hero',
    description,
    fieldDefinitions,
  };
}

function expectZodIssuesAt(err: unknown, paths: (string | number)[][]) {
  if (!(err instanceof ZodError)) {
    throw new Error(`expected a ZodError, got ${String(err)}`);
  }
  for (const path of paths) {
    const found = err.issues.some((issue) =>
      path.every((segment, i) => issue.path[i] === segment)
    );
    expect(
      found,
      `expected a ZodError issue with path prefix ${JSON.stringify(path)}; got paths ${JSON.stringify(err.issues.map((i) => i.path))}`
    ).toBe(true);
  }
}

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------

describe('getCreateCollectionSchemaFromLanguages', () => {
  it('accepts a fully translated collection', () => {
    const schema = getCreateCollectionSchemaFromLanguages([...bilingual]);
    expect(() => schema.parse(bilingualCollection())).not.toThrow();
  });

  it('rejects when a project language is missing on name.singular', () => {
    const schema = getCreateCollectionSchemaFromLanguages([...bilingual]);
    const result = schema.safeParse(
      bilingualCollection({ nameSingular: { en: 'Product' } })
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expectZodIssuesAt(result.error, [['name', 'singular']]);
    }
  });

  it('rejects when a field definition label is missing a language', () => {
    const schema = getCreateCollectionSchemaFromLanguages([...bilingual]);
    const result = schema.safeParse(
      bilingualCollection({
        fieldDefinitions: [titleFieldDef({ en: 'Title' })],
      })
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expectZodIssuesAt(result.error, [['fieldDefinitions', 0, 'label']]);
    }
  });

  it('aggregates every missing-language issue into a single ZodError', () => {
    const schema = getCreateCollectionSchemaFromLanguages([...bilingual]);
    const result = schema.safeParse(
      bilingualCollection({
        nameSingular: { en: 'Product' },
        namePlural: { de: 'Produkte' },
        description: { en: 'A product' },
        fieldDefinitions: [titleFieldDef({ en: 'Title' })],
      })
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expectZodIssuesAt(result.error, [
        ['name', 'singular'],
        ['name', 'plural'],
        ['description'],
        ['fieldDefinitions', 0, 'label'],
      ]);
    }
  });

  it('allows nullable field-definition description to be null', () => {
    const schema = getCreateCollectionSchemaFromLanguages([...bilingual]);
    expect(() =>
      schema.parse(
        bilingualCollection({
          fieldDefinitions: [titleFieldDef({ en: 'Title', de: 'Titel' }, null)],
        })
      )
    ).not.toThrow();
  });
});

describe('getUpdateCollectionSchemaFromLanguages', () => {
  it('accepts a fully translated update payload', () => {
    const schema = getUpdateCollectionSchemaFromLanguages([...bilingual]);
    expect(() =>
      schema.parse({ id: uuid(), ...bilingualCollection() })
    ).not.toThrow();
  });

  it('rejects a missing language on description', () => {
    const schema = getUpdateCollectionSchemaFromLanguages([...bilingual]);
    const result = schema.safeParse({
      id: uuid(),
      ...bilingualCollection({ description: { en: 'A product' } }),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expectZodIssuesAt(result.error, [['description']]);
    }
  });
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

describe('getCreateComponentSchemaFromLanguages', () => {
  it('accepts a fully translated component', () => {
    const schema = getCreateComponentSchemaFromLanguages([...bilingual]);
    expect(() => schema.parse(bilingualComponent())).not.toThrow();
  });

  it('rejects when a project language is missing on name', () => {
    const schema = getCreateComponentSchemaFromLanguages([...bilingual]);
    const result = schema.safeParse(
      bilingualComponent({ name: { en: 'Hero' } })
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expectZodIssuesAt(result.error, [['name']]);
    }
  });

  it('accepts a null description (nullable)', () => {
    const schema = getCreateComponentSchemaFromLanguages([...bilingual]);
    expect(() =>
      schema.parse(bilingualComponent({ description: null }))
    ).not.toThrow();
  });

  it('aggregates name and field-definition issues into one ZodError', () => {
    const schema = getCreateComponentSchemaFromLanguages([...bilingual]);
    const result = schema.safeParse(
      bilingualComponent({
        name: { en: 'Hero' },
        fieldDefinitions: [titleFieldDef({ de: 'Titel' })],
      })
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expectZodIssuesAt(result.error, [
        ['name'],
        ['fieldDefinitions', 0, 'label'],
      ]);
    }
  });
});

describe('getUpdateComponentSchemaFromLanguages', () => {
  it('accepts a fully translated update payload', () => {
    const schema = getUpdateComponentSchemaFromLanguages([...bilingual]);
    expect(() =>
      schema.parse({ id: uuid(), ...bilingualComponent() })
    ).not.toThrow();
  });

  it('rejects a missing language on a field-definition label', () => {
    const schema = getUpdateComponentSchemaFromLanguages([...bilingual]);
    const result = schema.safeParse({
      id: uuid(),
      ...bilingualComponent({
        fieldDefinitions: [titleFieldDef({ de: 'Titel' })],
      }),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expectZodIssuesAt(result.error, [['fieldDefinitions', 0, 'label']]);
    }
  });
});

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

describe('getEntrySchemaFromFieldDefinitions', () => {
  it('generates a valid entry schema with dynamic values', () => {
    const schema = getEntrySchemaFromFieldDefinitions(
      [titleFieldDef({ en: 'Title' })],
      [...singleLanguage]
    );
    const valid = {
      objectType: 'entry',
      id: uuid(),
      coreVersion: '0.16.0',
      created: new Date().toISOString(),
      updated: null,
      values: {
        title: {
          objectType: 'value',
          valueType: 'string',
          content: { en: 'Hello' },
        },
      },
    };
    expect(() => schema.parse(valid)).not.toThrow();
  });
});

describe('getCreateEntrySchemaFromFieldDefinitions', () => {
  it('generates a valid create entry schema with dynamic values', () => {
    const schema = getCreateEntrySchemaFromFieldDefinitions(
      [titleFieldDef({ en: 'Title' })],
      [...singleLanguage]
    );
    const valid = {
      projectId: uuid(),
      collectionId: uuid(),
      values: {
        title: {
          objectType: 'value',
          valueType: 'string',
          content: { en: 'Hello' },
        },
      },
    };
    expect(() => schema.parse(valid)).not.toThrow();
  });

  it('rejects entry values whose content is missing a project language', () => {
    const schema = getCreateEntrySchemaFromFieldDefinitions(
      [titleFieldDef({ en: 'Title', de: 'Titel' })],
      [...bilingual]
    );
    const invalid = {
      projectId: uuid(),
      collectionId: uuid(),
      values: {
        title: {
          objectType: 'value',
          valueType: 'string',
          content: { en: 'Hello' },
        },
      },
    };

    const result = schema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expectZodIssuesAt(result.error, [['values', 'title', 'content']]);
    }
  });
});

describe('getUpdateEntrySchemaFromFieldDefinitions', () => {
  it('generates a valid update entry schema with dynamic values', () => {
    const schema = getUpdateEntrySchemaFromFieldDefinitions(
      [titleFieldDef({ en: 'Title' })],
      [...singleLanguage]
    );
    const valid = {
      id: uuid(),
      projectId: uuid(),
      collectionId: uuid(),
      values: {
        title: {
          objectType: 'value',
          valueType: 'string',
          content: { en: 'Hello' },
        },
      },
    };
    expect(() => schema.parse(valid)).not.toThrow();
  });
});
