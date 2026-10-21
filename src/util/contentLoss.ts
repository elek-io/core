import type { Uuid } from '../schema/baseSchema.js';
import type { FieldDefinition } from '../schema/fieldSchema.js';
import type { Value } from '../schema/valueSchema.js';
import type {
  ContentLossIssue,
  EntryIssue,
  EntryIssueLocation,
  ValueLoss,
} from './entryIssue.js';
import { CoreError } from './shared.js';
import { entriesOf } from './typedObject.js';

/**
 * The sentence an update is refused with when applying it would delete
 * stored content. One string, so the same edit reads the same whether a
 * Collection or a Component answered.
 */
export const contentLossRefusal =
  'The update was refused, because applying it would delete stored content for good. Send it again with "acceptedContentLoss" naming the id of every field definition in this error whose content may go.';

/**
 * True when the Value holds something a person would miss. An added field
 * nobody filled in holds `null` per language, an empty allowlist holds no
 * items, and dropping either of those costs nothing.
 */
export function holdsContent(value: Value): boolean {
  switch (value.valueType) {
    case 'string':
    case 'number':
    case 'mdast':
      return entriesOf(value.content).some(
        ([, content]) => content !== undefined && content !== null
      );
    case 'boolean':
      // A toggle is never null, so any slot it carries is a stored answer
      return entriesOf(value.content).length > 0;
    case 'reference':
      return entriesOf(value.content).some(
        ([, references]) => references !== undefined && references.length > 0
      );
    case 'component':
      return value.content.length > 0;
  }
}

/**
 * What goes when a field definition is gone from the new list: the whole
 * Value, unless it holds nothing.
 */
export function lossOfRemovedField(value: Value): ValueLoss[] {
  if (holdsContent(value) === false) {
    return [];
  }
  return [{ reason: 'field_removed', currentValue: value }];
}

/**
 * Applies a field definition's `ofComponents` and `ofCollections` to a
 * stored Value, answering with the Value as the change leaves it and one
 * loss per drop.
 *
 * An empty allowlist allows every Component and every Collection, so it
 * drops nothing. An Asset reference is never dropped, `ofCollections` only
 * constrains Entry references.
 */
export function narrowAllowlists(
  value: Value,
  newFieldDefinition: FieldDefinition
): { value: Value; losses: ValueLoss[] } {
  if (
    value.valueType === 'component' &&
    newFieldDefinition.valueType === 'component' &&
    'ofComponents' in newFieldDefinition &&
    newFieldDefinition.ofComponents.length > 0
  ) {
    const allowed = new Set(newFieldDefinition.ofComponents);
    const kept = value.content.filter((item) => allowed.has(item.componentId));
    const dropped = value.content.filter(
      (item) => allowed.has(item.componentId) === false
    );
    if (dropped.length === 0) {
      return { value, losses: [] };
    }
    return {
      value: { ...value, content: kept },
      losses: [
        {
          reason: 'components_narrowed',
          currentValue: { ...value, content: dropped },
          itemCount: dropped.length,
        },
      ],
    };
  }

  if (
    value.valueType === 'reference' &&
    newFieldDefinition.valueType === 'reference' &&
    'ofCollections' in newFieldDefinition &&
    newFieldDefinition.ofCollections.length > 0
  ) {
    const allowed = new Set(newFieldDefinition.ofCollections);
    const keptContent: typeof value.content = {};
    const losses: ValueLoss[] = [];

    for (const [language, references] of entriesOf(value.content)) {
      if (references === undefined) {
        continue;
      }
      // An Asset reference carries no collectionId and is never dropped
      const isDropped = (reference: (typeof references)[number]): boolean =>
        'collectionId' in reference &&
        allowed.has(reference.collectionId) === false;
      const kept = references.filter(
        (reference) => isDropped(reference) === false
      );
      const dropped = references.filter(isDropped);
      keptContent[language] = kept;
      if (dropped.length > 0) {
        losses.push({
          reason: 'collections_narrowed',
          currentValue: { ...value, content: { [language]: dropped } },
          itemCount: dropped.length,
          language,
        });
      }
    }

    if (losses.length === 0) {
      return { value, losses: [] };
    }
    return { value: { ...value, content: keptContent }, losses };
  }

  return { value, losses: [] };
}

/**
 * Turns the rule's drops into issues, which is where the ids of the Entry
 * and the field definition come in.
 */
export function contentLossIssues(
  location: EntryIssueLocation,
  losses: ValueLoss[]
): ContentLossIssue[] {
  return losses.map((loss) => ({
    ...location,
    issue: 'content_loss',
    ...loss,
  }));
}

/**
 * Drops the refusals the caller accepted, by field definition id.
 *
 * An id the caller did not name still refuses, so an acceptance written for
 * one edit never carries a second one through.
 */
export function withoutAcceptedContentLoss(
  issues: EntryIssue[],
  acceptedContentLoss: Uuid[] | undefined
): EntryIssue[] {
  if (acceptedContentLoss === undefined || acceptedContentLoss.length === 0) {
    return issues;
  }
  const accepted = new Set(acceptedContentLoss);
  return issues.filter(
    (issue) =>
      issue.issue !== 'content_loss' ||
      accepted.has(issue.fieldDefinitionId) === false
  );
}

/**
 * The message an update refuses with. The destructive half is the same
 * sentence everywhere, the resolution half is the service's own.
 */
export function updateRefusalMessage(
  issues: EntryIssue[],
  resolutionMessage: string
): string {
  const sentences: string[] = [];
  if (issues.some((issue) => issue.issue === 'content_loss')) {
    sentences.push(contentLossRefusal);
  }
  if (issues.some((issue) => issue.issue !== 'content_loss')) {
    sentences.push(resolutionMessage);
  }
  return sentences.join(' ');
}

/**
 * The field definition ids a refusal names, and an empty list for every
 * other error. Core reads it to accept what its own migrations delete.
 */
export function acceptedContentLossOf(error: unknown): Uuid[] {
  if (!(error instanceof CoreError) || error.type !== 'Conflict') {
    return [];
  }
  if (!Array.isArray(error.cause)) {
    return [];
  }
  const ids = error.cause
    .filter(isContentLossIssue)
    .map((issue) => issue.fieldDefinitionId);
  return [...new Set(ids)];
}

/**
 * Recognizes a content loss issue inside an `unknown` cause, without
 * asserting the shape, so a cause carrying anything else is ignored.
 */
function isContentLossIssue(candidate: unknown): candidate is ContentLossIssue {
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    'issue' in candidate &&
    candidate.issue === 'content_loss' &&
    'fieldDefinitionId' in candidate &&
    typeof candidate.fieldDefinitionId === 'string'
  );
}
