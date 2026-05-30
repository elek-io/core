import { describe, expect, it } from 'vitest';
import {
  partialTranslatableStringSchema,
  slugSchema,
  reservedSlugs,
} from './baseSchema.js';

describe('translatableStringSchema', () => {
  it('accepts valid string values', () => {
    const result = partialTranslatableStringSchema.safeParse({
      en: 'hello',
      de: 'hallo',
    });

    expect(result.success).toBe(true);
  });

  it('trims whitespace from values', () => {
    const result = partialTranslatableStringSchema.safeParse({
      en: '  hello  ',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.en).toBe('hello');
    }
  });

  it('rejects whitespace-only strings', () => {
    const result = partialTranslatableStringSchema.safeParse({ en: '   ' });

    expect(result.success).toBe(false);
  });

  it('rejects non-string values', () => {
    const result = partialTranslatableStringSchema.safeParse({ en: 123 });

    expect(result.success).toBe(false);
  });
});

describe('slugSchema', () => {
  it('accepts valid slugs', () => {
    expect(slugSchema.safeParse('products').success).toBe(true);
    expect(slugSchema.safeParse('my-products').success).toBe(true);
    expect(slugSchema.safeParse('my-cool-products').success).toBe(true);
    expect(slugSchema.safeParse('a').success).toBe(true);
    expect(slugSchema.safeParse('a1b2').success).toBe(true);
    expect(slugSchema.safeParse('123').success).toBe(true);
    expect(slugSchema.safeParse('product-1').success).toBe(true);
  });

  it('rejects empty strings', () => {
    expect(slugSchema.safeParse('').success).toBe(false);
  });

  it('rejects strings exceeding max length', () => {
    const longSlug = 'a'.repeat(129);
    expect(slugSchema.safeParse(longSlug).success).toBe(false);
  });

  it('accepts strings at max length', () => {
    const maxSlug = 'a'.repeat(128);
    expect(slugSchema.safeParse(maxSlug).success).toBe(true);
  });

  it('rejects uppercase characters', () => {
    expect(slugSchema.safeParse('Products').success).toBe(false);
    expect(slugSchema.safeParse('PRODUCTS').success).toBe(false);
    expect(slugSchema.safeParse('myProducts').success).toBe(false);
  });

  it('rejects special characters', () => {
    expect(slugSchema.safeParse('my_products').success).toBe(false);
    expect(slugSchema.safeParse('my products').success).toBe(false);
    expect(slugSchema.safeParse('my.products').success).toBe(false);
    expect(slugSchema.safeParse('my/products').success).toBe(false);
    expect(slugSchema.safeParse('@products').success).toBe(false);
  });

  it('rejects leading or trailing hyphens', () => {
    expect(slugSchema.safeParse('-products').success).toBe(false);
    expect(slugSchema.safeParse('products-').success).toBe(false);
    expect(slugSchema.safeParse('-products-').success).toBe(false);
  });

  it('rejects consecutive hyphens', () => {
    expect(slugSchema.safeParse('my--products').success).toBe(false);
  });

  it('rejects all reserved slugs', () => {
    for (const reserved of reservedSlugs) {
      expect(
        slugSchema.safeParse(reserved).success,
        `Expected reserved slug "${reserved}" to be rejected`
      ).toBe(false);
    }
  });

  it('rejects non-string values', () => {
    expect(slugSchema.safeParse(123).success).toBe(false);
    expect(slugSchema.safeParse(null).success).toBe(false);
    expect(slugSchema.safeParse(undefined).success).toBe(false);
    expect(slugSchema.safeParse({}).success).toBe(false);
  });
});
