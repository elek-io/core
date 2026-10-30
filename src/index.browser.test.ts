import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  extractText,
  footnoteWayBackIdentifier,
  isInTightListItem,
  isTableHeaderCell,
  mdastRender,
  projectSchema,
  REQUIRED_RENDERER_KEYS,
  tableCellAlign,
  taskItemChecked,
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

  it('should expose what a paragraph handler needs to place the three', function () {
    expectTypeOf(isInTightListItem).toBeFunction();
    expectTypeOf(taskItemChecked).toBeFunction();
    expectTypeOf(footnoteWayBackIdentifier).toBeFunction();

    const item = {
      type: 'listItem' as const,
      spread: false,
      checked: true,
      children: [],
    };
    const inItem: MdastNodeContext = {
      index: 0,
      ancestors: [
        {
          type: 'list',
          ordered: false,
          start: null,
          spread: false,
          children: [item],
        },
        item,
      ],
    };
    expect(isInTightListItem(inItem)).toBe(true);
    expect(taskItemChecked(inItem)).toBe(true);

    const note = {
      type: 'footnoteDefinition' as const,
      identifier: 'n1',
      label: null,
      children: [{ type: 'paragraph' as const, children: [] }],
    };
    const inNote: MdastNodeContext = { index: 0, ancestors: [note] };
    expect(footnoteWayBackIdentifier(inNote)).toBe('n1');
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
