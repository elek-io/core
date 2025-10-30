import { describe, expectTypeOf, it } from 'vitest';
import { projectSchema, uuid, uuidSchema } from './index.browser.js';

describe('Browser', function () {
  it('should be able to use the ElekIoCore utility functions', function () {
    expectTypeOf(uuid).toBeFunction();
    uuid();
  });

  it('should be able to use the ElekIoCore schemas', function () {
    expectTypeOf(projectSchema.parse.bind(projectSchema)).toBeFunction();
    uuidSchema.parse(uuid());
  });
});
