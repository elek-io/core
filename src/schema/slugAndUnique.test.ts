import { describe, expect, it } from 'vitest';
import { uuid } from '../test/setup.js';
import {
  slugFieldDefinitionSchema,
  slugSeparatorSchema,
  stringFieldDefinitionSchema,
  type FieldDefinition,
} from './fieldSchema.js';
import { collectionFileSchema } from './collectionSchema.js';
import { componentFileSchema } from './componentSchema.js';

const ISO = '2024-01-01T00:00:00.000Z';

function baseFieldProps(overrides: Record<string, unknown> = {}) {
  return {
    id: uuid(),
    label: { en: 'Field' },
    description: null,
    isRequired: false,
    isDisabled: false,
    inputWidth: '12' as const,
    ...overrides,
  };
}

function makeTextFieldDef(overrides: Record<string, unknown> = {}) {
  return {
    ...baseFieldProps(),
    slug: 'name',
    valueType: 'string' as const,
    fieldType: 'text' as const,
    isUnique: false,
    defaultValue: null,
    min: null,
    max: null,
    ...overrides,
  };
}

function makeSlugFieldDef(overrides: Record<string, unknown> = {}) {
  return {
    ...baseFieldProps(),
    slug: 'slug',
    valueType: 'string' as const,
    fieldType: 'slug' as const,
    isUnique: true,
    defaultValue: null,
    separator: '-',
    lowercase: true,
    decamelize: true,
    ofFieldDefinitions: [],
    ...overrides,
  };
}

function makeCollectionFile(fieldDefinitions: unknown[]) {
  return {
    objectType: 'collection',
    id: uuid(),
    coreVersion: '1.0.0',
    created: ISO,
    updated: null,
    name: { singular: { en: 'Product' }, plural: { en: 'Products' } },
    slug: { singular: 'product', plural: 'products' },
    description: { en: 'desc' },
    icon: 'home',
    fieldDefinitions,
  };
}

function makeComponentFile(fieldDefinitions: unknown[]) {
  return {
    objectType: 'component',
    id: uuid(),
    coreVersion: '1.0.0',
    created: ISO,
    updated: null,
    name: { en: 'Hero' },
    slug: 'hero',
    description: null,
    fieldDefinitions,
  };
}

describe('slugSeparatorSchema', () => {
  it('accepts an empty separator and the URL-safe marks', () => {
    for (const separator of ['', '-', '_', '.', '~']) {
      expect(slugSeparatorSchema.safeParse(separator).success).toBe(true);
    }
  });

  it('rejects anything outside the allowlist', () => {
    // Includes characters slugify rewrites (&, €), strips (^), or that are
    // valid URL chars but not unreserved (+, /, @), plus whitespace.
    for (const separator of [
      'ab',
      'a',
      '1',
      '--',
      ' ',
      '+',
      '&',
      '♥',
      '🦄',
      '€',
      '^',
      '/',
      '@',
    ]) {
      expect(slugSeparatorSchema.safeParse(separator).success).toBe(false);
    }
  });
});

describe('slugFieldDefinitionSchema', () => {
  it('accepts a valid slug field definition', () => {
    expect(
      slugFieldDefinitionSchema.safeParse(makeSlugFieldDef()).success
    ).toBe(true);
  });

  it('requires isUnique to be true', () => {
    const result = slugFieldDefinitionSchema.safeParse(
      makeSlugFieldDef({ isUnique: false })
    );
    expect(result.success).toBe(false);
  });

  it('requires defaultValue to be null', () => {
    const result = slugFieldDefinitionSchema.safeParse(
      makeSlugFieldDef({ defaultValue: 'home' })
    );
    expect(result.success).toBe(false);
  });
});

describe('unique field cannot have a default value', () => {
  it('rejects a unique string field with a non-null default', () => {
    const result = stringFieldDefinitionSchema.safeParse(
      makeTextFieldDef({ isUnique: true, defaultValue: 'foo' })
    );
    expect(result.success).toBe(false);
  });

  it('allows a non-unique string field with a default', () => {
    const result = stringFieldDefinitionSchema.safeParse(
      makeTextFieldDef({ isUnique: false, defaultValue: 'foo' })
    );
    expect(result.success).toBe(true);
  });

  it('allows a unique string field with a null default', () => {
    const result = stringFieldDefinitionSchema.safeParse(
      makeTextFieldDef({ isUnique: true, defaultValue: null })
    );
    expect(result.success).toBe(true);
  });
});

describe('slug source references (collection-level)', () => {
  it('accepts a slug field referencing a sibling non-slug string field', () => {
    const title = makeTextFieldDef({ slug: 'title' });
    const slugField = makeSlugFieldDef({ ofFieldDefinitions: [title.id] });
    const result = collectionFileSchema.safeParse(
      makeCollectionFile([title, slugField])
    );
    expect(result.success).toBe(true);
  });

  it('accepts a standalone slug field (empty ofFieldDefinitions)', () => {
    const result = collectionFileSchema.safeParse(
      makeCollectionFile([makeSlugFieldDef()])
    );
    expect(result.success).toBe(true);
  });

  it('rejects a source that does not exist in the collection', () => {
    const slugField = makeSlugFieldDef({ ofFieldDefinitions: [uuid()] });
    const result = collectionFileSchema.safeParse(
      makeCollectionFile([slugField])
    );
    expect(result.success).toBe(false);
  });

  it('rejects a slug field referencing itself', () => {
    const id = uuid();
    const slugField = makeSlugFieldDef({ id, ofFieldDefinitions: [id] });
    const result = collectionFileSchema.safeParse(
      makeCollectionFile([slugField])
    );
    expect(result.success).toBe(false);
  });

  it('rejects a source that is another slug field (no chains)', () => {
    const otherSlug = makeSlugFieldDef({ slug: 'other-slug' });
    const slugField = makeSlugFieldDef({
      ofFieldDefinitions: [otherSlug.id],
    });
    const result = collectionFileSchema.safeParse(
      makeCollectionFile([otherSlug, slugField])
    );
    expect(result.success).toBe(false);
  });

  it('rejects a non-string source field', () => {
    const numberField = {
      ...baseFieldProps(),
      slug: 'count',
      valueType: 'number' as const,
      fieldType: 'number' as const,
      isUnique: false as const,
      defaultValue: null,
      min: null,
      max: null,
    };
    const slugField = makeSlugFieldDef({
      ofFieldDefinitions: [numberField.id],
    });
    const result = collectionFileSchema.safeParse(
      makeCollectionFile([numberField, slugField])
    );
    expect(result.success).toBe(false);
  });

  it('rejects duplicate sources', () => {
    const title = makeTextFieldDef({ slug: 'title' });
    const slugField = makeSlugFieldDef({
      ofFieldDefinitions: [title.id, title.id],
    });
    const result = collectionFileSchema.safeParse(
      makeCollectionFile([title, slugField])
    );
    expect(result.success).toBe(false);
  });
});

describe('uniqueness forbidden inside components', () => {
  it('rejects a unique field inside a component', () => {
    const result = componentFileSchema.safeParse(
      makeComponentFile([makeTextFieldDef({ isUnique: true })])
    );
    expect(result.success).toBe(false);
  });

  it('rejects a slug field inside a component', () => {
    const result = componentFileSchema.safeParse(
      makeComponentFile([makeSlugFieldDef()])
    );
    expect(result.success).toBe(false);
  });

  it('accepts a non-unique field inside a component', () => {
    const result = componentFileSchema.safeParse(
      makeComponentFile([makeTextFieldDef({ isUnique: false })])
    );
    expect(result.success).toBe(true);
  });
});

// Ensures the FieldDefinition union now includes slug for downstream consumers.
const _slugIsFieldDefinition: FieldDefinition =
  slugFieldDefinitionSchema.parse(makeSlugFieldDef());
void _slugIsFieldDefinition;
