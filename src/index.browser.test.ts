import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  extractText,
  mdastRender,
  projectSchema,
  REQUIRED_RENDERER_KEYS,
  uuid,
  uuidSchema,
} from './index.browser.js';

describe('Browser', function () {
  it('should be able to use the ElekIoCore utility functions', function () {
    expectTypeOf(uuid).toBeFunction();
    uuid();
  });

  it('should be able to use the ElekIoCore schemas', function () {
    expectTypeOf(projectSchema.parse.bind(projectSchema)).toBeFunction();
    uuidSchema.parse(uuid());
  });

  it('should expose the framework-agnostic mdast rendering primitive', function () {
    expectTypeOf(mdastRender).toBeFunction();
    expect(REQUIRED_RENDERER_KEYS).toEqual([
      'html',
      'assetReference',
      'entryReference',
    ]);
  });

  it('should expose the extractText helper', function () {
    expect(
      extractText({
        type: 'root',
        children: [
          { type: 'paragraph', children: [{ type: 'text', value: 'hi' }] },
        ],
      })
    ).toBe('hi');
  });
});
