import { describe, expect, it } from 'vitest';
import { uuidSchema } from '../schema/baseSchema.js';
import { currentTimestamp, slug, uuid } from './index.js';

describe('UUID', () => {
  it('can be generated', () => {
    const id = uuid();

    expect(id).toBeTypeOf('string');
    expect(id).toHaveLength(36);
  });

  it('can be validated', () => {
    const id = uuid();
    const result = uuidSchema.safeParse(id);

    expect(result.success).toBe(true);
  });
});

describe('UNIX timestamp', () => {
  it('can be generated', () => {
    const timestamp = currentTimestamp();

    expect(timestamp).toBeTypeOf('number');
    expect(timestamp).toBeGreaterThan(1700000000); // 2023-11-14
    expect(timestamp).toBeLessThan(2000000000); // 2033-05-18
  });
});

describe('Slug', () => {
  it('can be generated', () => {
    expect(slug('Hello World')).toBe('hello-world');
    expect(slug(' Hello World ')).toBe('hello-world');
    expect(slug('Hello   World')).toBe('hello-world');
    // expect(slug('Hello_World')).toBe('hello-world'); // @todo why is the underscore not replaced by a dash?
    expect(slug('Hello, World')).toBe('hello-world');
  });
});
