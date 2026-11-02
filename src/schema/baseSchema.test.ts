import { describe, expect, it } from 'vitest';
import {
  partialTranslatableStringSchema,
  slugSchema,
  reservedSlugs,
  supportedIconSchema,
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

describe('supportedIconSchema', () => {
  it('accepts Lucide icon names', () => {
    expect(supportedIconSchema.safeParse('newspaper').success).toBe(true);
    expect(supportedIconSchema.safeParse('car').success).toBe(true);
    expect(supportedIconSchema.safeParse('x').success).toBe(true);
    expect(supportedIconSchema.safeParse('a-arrow-down').success).toBe(true);
    expect(supportedIconSchema.safeParse('square-arrow-up-right').success).toBe(
      true
    );
  });

  it('accepts a Lucide name holding a digit', () => {
    expect(supportedIconSchema.safeParse('building-2').success).toBe(true);
    expect(supportedIconSchema.safeParse('arrow-down-0-1').success).toBe(true);
    expect(supportedIconSchema.safeParse('axis-3d').success).toBe(true);
  });

  it('accepts a name Lucide does not ship, since Core holds no catalog', () => {
    expect(supportedIconSchema.safeParse('no-such-lucide-icon').success).toBe(
      true
    );
  });

  it('accepts the names a Collection could carry before', () => {
    expect(supportedIconSchema.safeParse('home').success).toBe(true);
    expect(supportedIconSchema.safeParse('plus').success).toBe(true);
  });

  it('accepts a Lucide name that slugSchema reserves', () => {
    for (const name of ['delete', 'edit', 'list', 'settings']) {
      expect(
        supportedIconSchema.safeParse(name).success,
        `Expected icon name "${name}" to be accepted`
      ).toBe(true);
      expect(slugSchema.safeParse(name).success).toBe(false);
    }
  });

  it('accepts the longest name Lucide ships, with room to spare', () => {
    // 38 characters in lucide-react 1.63.0, against the cap of 64
    expect(
      supportedIconSchema.safeParse('triangles-centerline-dashed-horizontal')
        .success
    ).toBe(true);
    expect(supportedIconSchema.safeParse('a'.repeat(64)).success).toBe(true);
  });

  it('rejects empty strings', () => {
    expect(supportedIconSchema.safeParse('').success).toBe(false);
  });

  it('rejects strings exceeding max length', () => {
    expect(supportedIconSchema.safeParse('a'.repeat(65)).success).toBe(false);
  });

  it('rejects uppercase characters', () => {
    expect(supportedIconSchema.safeParse('Home').success).toBe(false);
    expect(supportedIconSchema.safeParse('NEWSPAPER').success).toBe(false);
    expect(supportedIconSchema.safeParse('aArrowDown').success).toBe(false);
  });

  it('rejects special characters', () => {
    expect(supportedIconSchema.safeParse('a_arrow_down').success).toBe(false);
    expect(supportedIconSchema.safeParse('a arrow down').success).toBe(false);
    expect(supportedIconSchema.safeParse('a.arrow.down').success).toBe(false);
    expect(supportedIconSchema.safeParse('a/arrow/down').success).toBe(false);
    expect(supportedIconSchema.safeParse('@newspaper').success).toBe(false);
    expect(supportedIconSchema.safeParse('newspaper\n').success).toBe(false);
  });

  it('rejects leading or trailing dashes', () => {
    expect(supportedIconSchema.safeParse('-newspaper').success).toBe(false);
    expect(supportedIconSchema.safeParse('newspaper-').success).toBe(false);
    expect(supportedIconSchema.safeParse('-newspaper-').success).toBe(false);
  });

  it('rejects consecutive dashes', () => {
    expect(supportedIconSchema.safeParse('a--arrow-down').success).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(supportedIconSchema.safeParse(123).success).toBe(false);
    expect(supportedIconSchema.safeParse(null).success).toBe(false);
    expect(supportedIconSchema.safeParse(undefined).success).toBe(false);
    expect(supportedIconSchema.safeParse({}).success).toBe(false);
  });
});
