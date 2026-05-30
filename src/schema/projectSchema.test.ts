import { describe, expect, it } from 'vitest';
import { projectSettingsSchema } from './projectSchema.js';

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
});
