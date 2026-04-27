import type { FieldDefinition } from '../schema/fieldSchema.js';
import type { ProjectLanguages } from '../schema/projectSchema.js';
import type { Value } from '../schema/valueSchema.js';

/**
 * Builds a default Value object for a field definition, using the given languages.
 *
 * Returns null when a default cannot be constructed (required field with no defaultValue).
 * This signals to the caller that the field needs user-provided resolution.
 */
export function buildDefaultValue(
  fieldDefinition: FieldDefinition,
  languages: ProjectLanguages
): Value | null {
  switch (fieldDefinition.valueType) {
    case 'string': {
      if (
        'defaultValue' in fieldDefinition &&
        fieldDefinition.defaultValue !== null
      ) {
        return {
          objectType: 'value',
          valueType: 'string',
          content: Object.fromEntries(
            languages.map((language) => [
              language,
              fieldDefinition.defaultValue,
            ])
          ),
        };
      }
      if (fieldDefinition.isRequired) {
        return null; // Cannot auto-resolve
      }
      return {
        objectType: 'value',
        valueType: 'string',
        content: Object.fromEntries(
          languages.map((language) => [language, null])
        ),
      };
    }

    case 'number': {
      if (
        'defaultValue' in fieldDefinition &&
        fieldDefinition.defaultValue !== null
      ) {
        return {
          objectType: 'value',
          valueType: 'number',
          content: Object.fromEntries(
            languages.map((language) => [
              language,
              fieldDefinition.defaultValue,
            ])
          ),
        };
      }
      if (fieldDefinition.isRequired) {
        return null;
      }
      return {
        objectType: 'value',
        valueType: 'number',
        content: Object.fromEntries(
          languages.map((language) => [language, null])
        ),
      };
    }

    case 'boolean': {
      // Boolean/toggle fields always have a defaultValue and are always required
      const defaultVal =
        'defaultValue' in fieldDefinition
          ? fieldDefinition.defaultValue
          : false;
      return {
        objectType: 'value',
        valueType: 'boolean',
        content: Object.fromEntries(
          languages.map((language) => [language, defaultVal])
        ),
      };
    }

    case 'reference': {
      if (fieldDefinition.isRequired) {
        return null; // Cannot auto-resolve - user must provide references
      }
      return {
        objectType: 'value',
        valueType: 'reference',
        content: Object.fromEntries(
          languages.map((language) => [language, []])
        ),
      };
    }

    case 'component': {
      if (fieldDefinition.isRequired) {
        return null; // Cannot auto-resolve - user must provide component items
      }
      return {
        objectType: 'value',
        valueType: 'component',
        content: [],
      };
    }

    default:
      throw new Error(
        // @ts-expect-error Code cannot be reached, but if we add a new ValueType and forget to update this function, we want to be notified about it
        `Cannot build default value for unsupported ValueType "${fieldDefinition.valueType}"`
      );
  }
}
