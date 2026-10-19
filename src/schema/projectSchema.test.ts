import { describe, expect, it } from 'vitest';
import {
  projectDescriptionSchema,
  projectNameSchema,
  projectSettingsSchema,
} from './projectSchema.js';

describe('projectSettingsSchema', () => {
  it('accepts a valid language configuration', () => {
    expect(() =>
      projectSettingsSchema.parse({
        language: { default: 'en', supported: ['en', 'de'] },
      })
    ).not.toThrow();
  });

  it('rejects duplicate supported languages', () => {
    expect(() =>
      projectSettingsSchema.parse({
        language: { default: 'en', supported: ['en', 'de', 'en'] },
      })
    ).toThrow('Supported languages must not contain duplicates');
  });

  it('rejects an empty supported array', () => {
    expect(() =>
      projectSettingsSchema.parse({
        language: { default: 'en', supported: [] },
      })
    ).toThrow();
  });

  it('rejects a default language that is not supported', () => {
    expect(() =>
      projectSettingsSchema.parse({
        language: { default: 'de', supported: ['en'] },
      })
    ).toThrow('Default language must be one of the supported languages');
  });

  it('reports an unsupported default language on the default key', () => {
    const result = projectSettingsSchema.safeParse({
      language: { default: 'de', supported: ['en'] },
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['language', 'default']);
  });

  it('rejects removing the supported language that is still the default', () => {
    expect(() =>
      projectSettingsSchema.parse({
        language: { default: 'de', supported: ['en', 'fr'] },
      })
    ).toThrow('Default language must be one of the supported languages');
  });
});

describe('the caps of a Project name and description', () => {
  it.each([
    ['a name', projectNameSchema, 200],
    ['a description', projectDescriptionSchema, 500],
  ] as const)('holds %s to %i after trimming', (_, schema, cap) => {
    expect(schema.safeParse('N'.repeat(cap)).success).toBe(true);
    expect(schema.safeParse(`  ${'N'.repeat(cap)}  `).success).toBe(true);
    expect(schema.safeParse('N'.repeat(cap + 1)).success).toBe(false);
    expect(schema.safeParse('   ').success).toBe(false);
  });

  it('counts UTF-16 code units, as elek.io Cloud does', () => {
    expect(projectNameSchema.safeParse('😀'.repeat(100)).success).toBe(true);
    expect(projectNameSchema.safeParse('😀'.repeat(101)).success).toBe(false);
  });
});
