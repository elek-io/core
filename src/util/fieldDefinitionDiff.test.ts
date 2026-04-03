import { describe, expect, it } from 'vitest';
import { v4 as uuid } from 'uuid';
import { diffFieldDefinitions } from './fieldDefinitionDiff.js';
import type { FieldDefinition } from '../schema/fieldSchema.js';

function makeTextField(
  overrides: Partial<FieldDefinition> & { id: string; slug: string }
): FieldDefinition {
  return {
    valueType: 'string',
    fieldType: 'text',
    label: { en: overrides.slug },
    description: null,
    isRequired: false,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12',
    defaultValue: null,
    min: null,
    max: null,
    ...overrides,
  } as FieldDefinition;
}

describe('diffFieldDefinitions', () => {
  it('returns empty array when definitions are identical', () => {
    const id = uuid();
    const defs = [makeTextField({ id, slug: 'title' })];
    expect(diffFieldDefinitions(defs, defs)).toEqual([]);
  });

  it('detects added fields', () => {
    const id = uuid();
    const newField = makeTextField({ id, slug: 'title' });
    const changes = diffFieldDefinitions([], [newField]);

    expect(changes).toHaveLength(1);
    expect(changes[0]!.kind).toBe('added');
    if (changes[0]!.kind === 'added') {
      expect(changes[0]!.fieldDefinition.id).toBe(id);
    }
  });

  it('detects removed fields', () => {
    const id = uuid();
    const oldField = makeTextField({ id, slug: 'title' });
    const changes = diffFieldDefinitions([oldField], []);

    expect(changes).toHaveLength(1);
    expect(changes[0]!.kind).toBe('removed');
    if (changes[0]!.kind === 'removed') {
      expect(changes[0]!.oldFieldDefinition.id).toBe(id);
    }
  });

  it('detects slug renames as updated', () => {
    const id = uuid();
    const oldField = makeTextField({ id, slug: 'title' });
    const newField = makeTextField({ id, slug: 'name' });
    const changes = diffFieldDefinitions([oldField], [newField]);

    expect(changes).toHaveLength(1);
    expect(changes[0]!.kind).toBe('updated');
    if (changes[0]!.kind === 'updated') {
      expect(changes[0]!.oldFieldDefinition.slug).toBe('title');
      expect(changes[0]!.newFieldDefinition.slug).toBe('name');
    }
  });

  it('detects isRequired changes as updated', () => {
    const id = uuid();
    const oldField = makeTextField({ id, slug: 'title', isRequired: false });
    const newField = makeTextField({ id, slug: 'title', isRequired: true });
    const changes = diffFieldDefinitions([oldField], [newField]);

    expect(changes).toHaveLength(1);
    expect(changes[0]!.kind).toBe('updated');
  });

  it('handles simultaneous add and remove (field replacement)', () => {
    const oldId = uuid();
    const newId = uuid();
    const oldField = makeTextField({ id: oldId, slug: 'title' });
    const newField = makeTextField({ id: newId, slug: 'title' });
    const changes = diffFieldDefinitions([oldField], [newField]);

    expect(changes).toHaveLength(2);
    const removed = changes.find((c) => c.kind === 'removed');
    const added = changes.find((c) => c.kind === 'added');
    expect(removed).toBeDefined();
    expect(added).toBeDefined();
  });

  it('handles slug swap (A→B and B→A)', () => {
    const idA = uuid();
    const idB = uuid();
    const oldDefs = [
      makeTextField({ id: idA, slug: 'title' }),
      makeTextField({ id: idB, slug: 'name' }),
    ];
    const newDefs = [
      makeTextField({ id: idA, slug: 'name' }),
      makeTextField({ id: idB, slug: 'title' }),
    ];
    const changes = diffFieldDefinitions(oldDefs, newDefs);

    expect(changes).toHaveLength(2);
    expect(changes.every((c) => c.kind === 'updated')).toBe(true);
  });

  it('does not report unchanged fields', () => {
    const idA = uuid();
    const idB = uuid();
    const oldDefs = [
      makeTextField({ id: idA, slug: 'title' }),
      makeTextField({ id: idB, slug: 'name' }),
    ];
    const newDefs = [
      makeTextField({ id: idA, slug: 'title' }),
      makeTextField({ id: idB, slug: 'description' }), // only B changed
    ];
    const changes = diffFieldDefinitions(oldDefs, newDefs);

    expect(changes).toHaveLength(1);
    expect(changes[0]!.kind).toBe('updated');
    if (changes[0]!.kind === 'updated') {
      expect(changes[0]!.oldFieldDefinition.slug).toBe('name');
      expect(changes[0]!.newFieldDefinition.slug).toBe('description');
    }
  });

  it('handles multiple change types simultaneously', () => {
    const keepId = uuid();
    const removeId = uuid();
    const updateId = uuid();
    const addId = uuid();

    const oldDefs = [
      makeTextField({ id: keepId, slug: 'keep' }),
      makeTextField({ id: removeId, slug: 'remove-me' }),
      makeTextField({ id: updateId, slug: 'old-slug' }),
    ];
    const newDefs = [
      makeTextField({ id: keepId, slug: 'keep' }),
      makeTextField({ id: updateId, slug: 'new-slug' }),
      makeTextField({ id: addId, slug: 'new-field' }),
    ];
    const changes = diffFieldDefinitions(oldDefs, newDefs);

    expect(changes).toHaveLength(3);
    expect(changes.filter((c) => c.kind === 'removed')).toHaveLength(1);
    expect(changes.filter((c) => c.kind === 'added')).toHaveLength(1);
    expect(changes.filter((c) => c.kind === 'updated')).toHaveLength(1);
  });
});
