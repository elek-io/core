import type { ComponentsContext } from '../schema/componentSchema.js';
import type { Value } from '../schema/valueSchema.js';
import { CoreError } from '../util/shared.js';

/**
 * Drops the `Value` envelope (`objectType`, `valueType`) and hoists `content`,
 * which is why a page reads `entry.data.title.en`. Component items keep their
 * nesting and each carries its Component's slug, resolved through `ctx`.
 * Throws `NotFound` on an item naming a Component the Project does not have.
 *
 * Exactly what `buildEntryValuesSchema` validates and
 * `buildEntryValuesTypeString` types. Not the unrelated `transformEntryValues`
 * in `src/util/entryTransform.ts`.
 *
 * @see ../../contributing/astro-entry.md
 */
export function transformEntryValues(
  values: Record<string, Value>,
  ctx: ComponentsContext,
  entryId: string
) {
  const result: Record<string, unknown> = {};
  for (const [slug, value] of Object.entries(values)) {
    if (value.valueType === 'component') {
      result[slug] = value.content.map((item) => {
        const component = ctx.componentMap.get(item.componentId);
        if (!component) {
          throw CoreError.notFound(
            `Component "${item.componentId}" referenced by dynamic field "${slug}" of Entry "${entryId}" not found in Project`
          );
        }
        return {
          id: item.id,
          componentId: item.componentId,
          componentSlug: component.slug,
          values: transformEntryValues(item.values, ctx, entryId),
        };
      });
    } else {
      result[slug] = value.content;
    }
  }
  return result;
}
