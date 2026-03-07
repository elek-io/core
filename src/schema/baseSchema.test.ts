import { describe, expect, it } from 'vitest';
import {
  translatableStringSchema,
  translatableNumberSchema,
  translatableBooleanSchema,
} from './baseSchema.js';

describe('translatableStringSchema', () => {
  it('accepts valid string values', () => {
    const result = translatableStringSchema.safeParse({ en: 'hello', de: 'hallo' });

    expect(result.success).toBe(true);
  });

  it('trims whitespace from values', () => {
    const result = translatableStringSchema.safeParse({ en: '  hello  ' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.en).toBe('hello');
    }
  });

  it('rejects whitespace-only strings', () => {
    const result = translatableStringSchema.safeParse({ en: '   ' });

    expect(result.success).toBe(false);
  });

  it('rejects non-string values', () => {
    const result = translatableStringSchema.safeParse({ en: 123 });

    expect(result.success).toBe(false);
  });
});

describe('translatableNumberSchema', () => {
  it('accepts valid number values', () => {
    const result = translatableNumberSchema.safeParse({ en: 42, de: 0 });

    expect(result.success).toBe(true);
  });

  it('rejects undefined values', () => {
    const result = translatableNumberSchema.safeParse({ en: undefined });

    expect(result.success).toBe(false);
  });

  it('rejects non-number values', () => {
    const result = translatableNumberSchema.safeParse({ en: 'not a number' });

    expect(result.success).toBe(false);
  });
});

describe('translatableBooleanSchema', () => {
  it('accepts valid boolean values', () => {
    const result = translatableBooleanSchema.safeParse({
      en: true,
      de: false,
    });

    expect(result.success).toBe(true);
  });

  it('rejects undefined values', () => {
    const result = translatableBooleanSchema.safeParse({ en: undefined });

    expect(result.success).toBe(false);
  });

  it('rejects non-boolean values', () => {
    const result = translatableBooleanSchema.safeParse({ en: 'yes' });

    expect(result.success).toBe(false);
  });
});
