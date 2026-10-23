import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  extractText,
  isTableHeaderCell,
  mdastRender,
  projectSchema,
  REQUIRED_RENDERER_KEYS,
  tableCellAlign,
  uuid,
  uuidSchema,
  type MdastNodeContext,
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

  it('should expose what a table cell handler needs to place itself', function () {
    expectTypeOf(isTableHeaderCell).toBeFunction();
    expectTypeOf(tableCellAlign).toBeFunction();

    const headerRow = { type: 'tableRow' as const, children: [] };
    const context: MdastNodeContext = {
      index: 1,
      ancestors: [
        { type: 'table', align: [null, 'center'], children: [headerRow] },
        headerRow,
      ],
    };
    expect(isTableHeaderCell(context)).toBe(true);
    expect(tableCellAlign(context)).toBe('center');
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
