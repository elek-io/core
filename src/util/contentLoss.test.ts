import { describe, expect, it } from 'vitest';
import { v4 as uuid } from 'uuid';
import {
  acceptedContentLossOf,
  contentLossRefusal,
  holdsContent,
  lossOfRemovedField,
  narrowAllowlists,
  updateRefusalMessage,
  withoutAcceptedContentLoss,
} from './contentLoss.js';
import type { EntryIssue, EntryIssueType } from './entryIssue.js';
import { CoreError } from './shared.js';
import type { FieldDefinition } from '../schema/fieldSchema.js';
import type { Value } from '../schema/valueSchema.js';

const entryId = uuid();
const collectionId = uuid();

function dynamicField(ofComponents: string[]): FieldDefinition {
  return {
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
    ofComponents,
    min: null,
    max: null,
  };
}

function entryField(ofCollections: string[]): FieldDefinition {
  return {
    id: uuid(),
    slug: 'related',
    valueType: 'reference',
    fieldType: 'entry',
    label: { en: 'Related' },
    description: null,
    isRequired: false,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12',
    ofCollections,
    min: null,
    max: null,
  };
}

function issueAt(fieldDefinitionId: string, issue: EntryIssueType): EntryIssue {
  if (issue === 'content_loss') {
    return {
      entryId,
      collectionId,
      fieldDefinitionId,
      fieldSlug: 'title',
      issue,
      reason: 'field_removed',
      currentValue: {
        objectType: 'value',
        valueType: 'string',
        content: { en: 'Gone' },
      },
      transformedValues: {},
    };
  }
  if (issue === 'unique_collision') {
    return {
      entryId,
      collectionId,
      fieldDefinitionId,
      fieldSlug: 'title',
      issue,
      value: 'Hello',
      language: 'en',
      conflictingEntryId: uuid(),
      transformedValues: {},
    };
  }
  return {
    entryId,
    collectionId,
    fieldDefinitionId,
    fieldSlug: 'title',
    issue,
    transformedValues: {},
  };
}

describe('holdsContent', function () {
  it('reads an empty string, reference and Component Value as nothing', function () {
    const empty: Value[] = [
      { objectType: 'value', valueType: 'string', content: { en: null } },
      { objectType: 'value', valueType: 'number', content: { en: null } },
      { objectType: 'value', valueType: 'mdast', content: { en: null } },
      { objectType: 'value', valueType: 'reference', content: { en: [] } },
      { objectType: 'value', valueType: 'component', content: [] },
    ];

    for (const value of empty) {
      expect(holdsContent(value), value.valueType).toBe(false);
      expect(lossOfRemovedField(value)).toEqual([]);
    }
  });

  it('reads a toggle as content, because Core cannot tell a chosen false from an untouched one', function () {
    const toggle: Value = {
      objectType: 'value',
      valueType: 'boolean',
      content: { en: false },
    };

    expect(holdsContent(toggle)).toBe(true);
    expect(lossOfRemovedField(toggle)).toHaveLength(1);
  });
});

describe('narrowAllowlists', function () {
  const componentA = uuid();
  const componentB = uuid();
  const blocks: Value = {
    objectType: 'value',
    valueType: 'component',
    content: [
      { id: uuid(), componentId: componentA, values: {} },
      { id: uuid(), componentId: componentB, values: {} },
    ],
  };

  it('drops nothing for an empty, a widened or a reordered allowlist', function () {
    const unchanged = [
      dynamicField([]),
      dynamicField([componentA, componentB, uuid()]),
      dynamicField([componentB, componentA]),
    ];

    for (const fieldDefinition of unchanged) {
      const result = narrowAllowlists(blocks, fieldDefinition);
      expect(result.losses).toEqual([]);
      expect(result.value).toBe(blocks);
    }
  });

  it('keeps an Asset reference inside a narrowed ofCollections', function () {
    const asset = { id: uuid(), objectType: 'asset' as const };
    const value: Value = {
      objectType: 'value',
      valueType: 'reference',
      content: { en: [asset] },
    };

    const result = narrowAllowlists(value, entryField([uuid()]));

    expect(result.losses).toEqual([]);
    expect(result.value).toBe(value);
  });

  it('counts one loss per language that loses a reference', function () {
    const allowed = uuid();
    const disallowed = uuid();
    const value: Value = {
      objectType: 'value',
      valueType: 'reference',
      content: {
        en: [
          { id: uuid(), objectType: 'entry', collectionId: allowed },
          { id: uuid(), objectType: 'entry', collectionId: disallowed },
        ],
        de: [{ id: uuid(), objectType: 'entry', collectionId: disallowed }],
      },
    };

    const result = narrowAllowlists(value, entryField([allowed]));

    expect(result.losses.map((loss) => loss.reason)).toEqual([
      'collections_narrowed',
      'collections_narrowed',
    ]);
    expect(
      result.losses.map((loss) =>
        loss.reason === 'collections_narrowed'
          ? [loss.language, loss.itemCount]
          : null
      )
    ).toEqual([
      ['en', 1],
      ['de', 1],
    ]);
  });
});

describe('withoutAcceptedContentLoss', function () {
  const removed = uuid();
  const alsoRemoved = uuid();

  it('keeps a refusal the acceptance does not name', function () {
    const issues = [
      issueAt(removed, 'content_loss'),
      issueAt(alsoRemoved, 'content_loss'),
    ];

    const open = withoutAcceptedContentLoss(issues, [removed]);

    expect(open).toHaveLength(1);
    expect(open[0]!.fieldDefinitionId).toBe(alsoRemoved);
  });

  it('never clears an issue a caller has to resolve', function () {
    const issues = [
      issueAt(removed, 'content_loss'),
      issueAt(removed, 'missing_required'),
    ];

    const open = withoutAcceptedContentLoss(issues, [removed]);

    expect(open).toHaveLength(1);
    expect(open[0]!.issue).toBe('missing_required');
  });
});

describe('updateRefusalMessage', function () {
  const resolutionMessage =
    'Field definition changes require entry resolutions';

  it('names the loss, what to send and nothing a User typed', function () {
    const message = updateRefusalMessage(
      [issueAt(uuid(), 'content_loss')],
      resolutionMessage
    );

    expect(message).toBe(contentLossRefusal);
    expect(message).toContain('refused');
    expect(message).toContain('permanently delete stored content');
    expect(message).toContain('acceptedContentLoss');
    expect(message).not.toContain('Gone');
    expect(message).not.toContain(resolutionMessage);
  });

  it('carries both halves when one call reports both', function () {
    const message = updateRefusalMessage(
      [issueAt(uuid(), 'content_loss'), issueAt(uuid(), 'missing_required')],
      resolutionMessage
    );

    expect(message).toContain(contentLossRefusal);
    expect(message).toContain(resolutionMessage);
  });

  it('leaves the destructive half out where nothing is deleted', function () {
    const message = updateRefusalMessage(
      [issueAt(uuid(), 'unique_collision')],
      resolutionMessage
    );

    expect(message).toBe(resolutionMessage);
  });
});

describe('acceptedContentLossOf', function () {
  it('reads the field definition ids out of a refusal, once each', function () {
    const removed = uuid();
    const error = CoreError.conflict('refused', [
      issueAt(removed, 'content_loss'),
      issueAt(removed, 'content_loss'),
      issueAt(uuid(), 'missing_required'),
    ]);

    expect(acceptedContentLossOf(error)).toEqual([removed]);
  });

  it('reads nothing out of any other error', function () {
    expect(acceptedContentLossOf(new Error('nope'))).toEqual([]);
    expect(acceptedContentLossOf(CoreError.badRequest('nope'))).toEqual([]);
    expect(acceptedContentLossOf(CoreError.conflict('nope'))).toEqual([]);
    expect(
      acceptedContentLossOf(
        CoreError.conflict('nope', [issueAt(uuid(), 'type_mismatch')])
      )
    ).toEqual([]);
  });
});

describe('the issue types Core exports', function () {
  it('is exhaustive, so a case added later stops a consumer from compiling', function () {
    const describeIssue = (issue: EntryIssue): string => {
      switch (issue.issue) {
        case 'missing_required':
        case 'type_mismatch':
        case 'constraint_violation':
          return 'resolve it';
        case 'unique_collision':
          return `rename ${issue.value}`;
        case 'content_loss':
          // Narrowing to the destructive case reads what would go
          return issue.reason === 'field_removed'
            ? 'the whole Value goes'
            : `${issue.itemCount} go`;
        default: {
          const unreachable: never = issue;
          return unreachable;
        }
      }
    };

    expect(describeIssue(issueAt(uuid(), 'content_loss'))).toBe(
      'the whole Value goes'
    );
    expect(describeIssue(issueAt(uuid(), 'unique_collision'))).toBe(
      'rename Hello'
    );
    expect(describeIssue(issueAt(uuid(), 'type_mismatch'))).toBe('resolve it');
  });
});
