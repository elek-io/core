import { describe, expect, it } from 'vitest';
import { entriesOf, keysOf } from './typedObject.js';

describe('keysOf', function () {
  it('returns the same keys as Object.keys', function () {
    const value = { en: 1, de: 2 };

    expect(keysOf(value)).toEqual(Object.keys(value));
  });

  it('returns an empty array for an empty object', function () {
    expect(keysOf({})).toEqual([]);
  });

  it('narrows the key type to the object own keys', function () {
    const value: Partial<Record<'en' | 'de', number>> = { en: 1 };

    // Assigning to the narrow union is the point of the helper. This does
    // not compile with plain Object.keys, which widens to string[].
    const languages: Array<'en' | 'de'> = keysOf(value);

    expect(languages).toEqual(['en']);
  });

  it('skips keys that are not own enumerable properties', function () {
    const value: Record<string, unknown> = { own: 1 };
    Object.setPrototypeOf(value, { inherited: true });

    expect(keysOf(value)).toEqual(['own']);
  });
});

describe('entriesOf', function () {
  it('returns the same entries as Object.entries', function () {
    const value = { en: 1, de: 2 };

    expect(entriesOf(value)).toEqual(Object.entries(value));
  });

  it('returns an empty array for an empty object', function () {
    expect(entriesOf({})).toEqual([]);
  });

  it('narrows both the key and the value type', function () {
    const value: Partial<Record<'en' | 'de', number>> = { en: 1 };

    for (const [language, count] of entriesOf(value)) {
      const narrowed: 'en' | 'de' = language;
      const amount: number | undefined = count;

      expect(narrowed).toBe('en');
      expect(amount).toBe(1);
    }

    expect(entriesOf(value)).toHaveLength(1);
  });
});
