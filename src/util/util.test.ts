import { describe, expect, it } from 'vitest';
import { z } from '@hono/zod-openapi';
import { CoreError, datetime, slug, uuid, uuidSchema } from '../test/setup.js';

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
    const created = datetime();
    const schema = z.string().datetime();

    schema.parse(created);
  });

  it('reads 0 as the epoch rather than as absent', () => {
    // The one value a falsy guard silently turned into now
    expect(datetime(0)).toEqual('1970-01-01T00:00:00.000Z');
  });

  it('still answers an absent value with the current time', () => {
    // Every internal caller stamps `created` and `updated` this way
    const schema = z.string().datetime();

    schema.parse(datetime());
    schema.parse(datetime(undefined));
    // An empty string is absent too, `new Date('')` is an invalid date
    schema.parse(datetime(''));
  });

  it('converts the values it is given', () => {
    expect(datetime(1000)).toEqual('1970-01-01T00:00:01.000Z');
    expect(datetime('2024-03-01T12:00:00.000Z')).toEqual(
      '2024-03-01T12:00:00.000Z'
    );
    expect(datetime(new Date(0))).toEqual('1970-01-01T00:00:00.000Z');
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

describe('CoreError', () => {
  // Every type carries the HTTP status the local API answers with and the
  // one a Cloud response maps from, so a type added without a status would
  // otherwise surface as an undefined statusCode at a boundary
  it.each([
    ['notFound', 'NotFound', 404],
    ['badRequest', 'BadRequest', 400],
    ['unauthorized', 'Unauthorized', 401],
    ['conflict', 'Conflict', 409],
    ['preconditionFailed', 'PreconditionFailed', 412],
    ['upgradeFailed', 'UpgradeFailed', 422],
    ['versionSkew', 'VersionSkew', 422],
    ['rateLimited', 'RateLimited', 429],
    ['internal', 'Internal', 500],
  ] as const)(
    'has a %s with the status code %s',
    (factory, type, statusCode) => {
      const error = CoreError[factory]('something happened');

      expect(error.type).toBe(type);
      expect(error.statusCode).toBe(statusCode);
      expect(error.message).toBe('something happened');
    }
  );

  it('keeps the cause of what it was raised from', () => {
    const cause = new Error('the real one');

    expect(CoreError.rateLimited('too many', cause).cause).toBe(cause);
  });
});
