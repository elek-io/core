import { describe, expectTypeOf, it } from 'vitest';
import { projectSchema, uuid, uuidSchema } from './index.browser.js';

describe('Browser', function () {
  it('should be able to use the ElekIoCore utility functions', async function () {
    expectTypeOf(uuid).toBeFunction();
    uuid();
  });

  it('should be able to use the ElekIoCore schemas', async function () {
    expectTypeOf(projectSchema.parse).toBeFunction();
    uuidSchema.parse(uuid());
  });
});
