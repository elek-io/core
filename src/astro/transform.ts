import type { ComponentsContext } from '../schema/componentSchema.js';
import type { Value } from '../schema/valueSchema.js';

/**
 * Transforms an elek.io Entry's values record into a flat object
 * keyed by field definition slug. Each value's translatable content
 * is preserved as-is.
 *
 * For component (dynamic) fields, the nested values within each
 * component item are recursively transformed. Every item also carries
 * its Component's slug as `componentSlug`, which is what a site
 * dispatches a polymorphic field on. `ctx` is what resolves the item's
 * `componentId` to that slug, so it is passed down the recursion.
 *
 * An item referencing a Component the Project does not have throws,
 * the same posture the schema builders in `schema.ts` take.
 */
export function transformEntryValues(
  values: Record<string, Value>,
  ctx: ComponentsContext
) {
  const result: Record<string, unknown> = {};
  for (const [slug, value] of Object.entries(values)) {
    if (value.valueType === 'component') {
      result[slug] = value.content.map((item) => {
        const component = ctx.componentMap.get(item.componentId);
        if (!component) {
          throw new Error(
            `Component "${item.componentId}" referenced by dynamic field "${slug}" not found in Project`
          );
        }
        return {
          id: item.id,
          componentId: item.componentId,
          componentSlug: component.slug,
          values: transformEntryValues(item.values, ctx),
        };
      });
    } else {
      result[slug] = value.content;
    }
  }
  return result;
}
