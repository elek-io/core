import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { currentDatetime, slug, uuid, uuidSchema } from '../test/setup.js';

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

describe('UNIX datetime', () => {
  it('can be generated', () => {
    const datetime = currentDatetime();
    const schema = z.string().datetime();

    schema.parse(datetime);
  });
});

describe('Slug', () => {
  it('can be generated', () => {
    expect(slug('Hello World')).toBe('hello-world');
    expect(slug(' Hello World ')).toBe('hello-world');
    expect(slug('Hello   World')).toBe('hello-world');
    expect(slug('Hello_World')).toBe('hello-world');
    expect(slug('Hello, World')).toBe('hello-world');
    expect(slug('HelloWorld')).toBe('hello-world');
    expect(slug('Hello@!`World')).toBe('hello-world');
    expect(slug('Hello @!` World')).toBe('hello-world');
    expect(slug('1Hello @!` World')).toBe('1-hello-world');
    expect(slug('1hello @!` world')).toBe('1hello-world');
  });
});
