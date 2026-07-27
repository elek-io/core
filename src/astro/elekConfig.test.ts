import { describe, expect, expectTypeOf, it } from 'vitest';
import { defineElekConfig, type ElekConfig } from './elekConfig.js';
import { CoreError } from '../util/shared.js';

const projectId = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

function expectBadRequest(fn: () => unknown, contains: string): void {
  let error: unknown = null;
  try {
    fn();
  } catch (e) {
    error = e;
  }

  expect(error).toBeInstanceOf(CoreError);
  expect(error instanceof CoreError && error.type).toEqual('BadRequest');
  expect(error instanceof CoreError && error.message).toContain(contains);
}

describe('defineElekConfig', function () {
  it('should return the very same object it validated', function () {
    const input = {
      projects: {
        website: { id: projectId, remoteUrl: 'https://example.com/repo.git' },
      },
    };

    expect(defineElekConfig(input)).toBe(input);
  });

  it('should accept a declaration without a remoteUrl', function () {
    // A purely local Project managed by the Desktop app has no remote
    // to provision from, only the loaders read it
    const config: ElekConfig = defineElekConfig({
      projects: { website: { id: projectId } },
    });

    expect(config.projects['website']?.remoteUrl).toBeUndefined();
  });

  it('should accept every channel and an exact version as ref', function () {
    expect(() =>
      defineElekConfig({
        projects: {
          a: { id: projectId, ref: 'production' },
          b: { id: projectId, ref: 'preview' },
          c: { id: projectId, ref: 'draft' },
          d: { id: projectId, ref: '1.4.0' },
          e: { id: projectId, ref: '1.5.0-preview.2' },
        },
      })
    ).not.toThrow();
  });

  it('should reject an id that is not a UUID', function () {
    expectBadRequest(
      () => defineElekConfig({ projects: { website: { id: 'not-a-uuid' } } }),
      'projects.website.id'
    );
  });

  it('should reject a ref that is neither a channel nor a version', function () {
    expectBadRequest(
      () =>
        defineElekConfig({
          projects: { website: { id: projectId, ref: 'latest' } },
        }),
      'projects.website.ref'
    );
  });

  it('should reject an empty remoteUrl', function () {
    expectBadRequest(
      () =>
        defineElekConfig({
          projects: { website: { id: projectId, remoteUrl: '   ' } },
        }),
      'projects.website.remoteUrl'
    );
  });

  it('should reject a config without any Project', function () {
    expectBadRequest(() => defineElekConfig({ projects: {} }), 'at least one');
  });

  it('should reject an alias that does not concatenate cleanly in camelCase', function () {
    // Aliases prefix the derived collection keys, so a hyphen or an
    // uppercase first letter would produce an unreadable key
    for (const alias of ['my-site', 'My site', 'Website', '1website', '']) {
      expectBadRequest(
        () => defineElekConfig({ projects: { [alias]: { id: projectId } } }),
        'lowercase letter'
      );
    }
  });

  it('should name the offending alias in the error', function () {
    expectBadRequest(
      () => defineElekConfig({ projects: { 'my-site': { id: projectId } } }),
      'my-site'
    );
  });

  it('should reject an unknown key instead of silently stripping it', function () {
    expectBadRequest(
      () =>
        defineElekConfig({
          projects: { website: { id: projectId, remotUrl: 'typo' } },
        }),
      'remotUrl'
    );
    expectBadRequest(
      () => defineElekConfig({ projects: {}, prjects: {} }),
      'prjects'
    );
  });

  it('should keep the alias literals in the returned type', function () {
    const config = defineElekConfig({
      projects: {
        website: { id: projectId },
        shop: { id: projectId },
      },
    });

    expectTypeOf<keyof typeof config.projects>().toEqualTypeOf<
      'website' | 'shop'
    >();
    // A config is still assignable to the widened interface every
    // entry point accepts
    expectTypeOf(config).toExtend<ElekConfig>();
  });
});
