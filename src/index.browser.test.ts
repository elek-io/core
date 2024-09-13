import { describe, expectTypeOf, it } from 'vitest';
import { projectSchema, uuid, uuidSchema } from './index.browser.js';

describe.sequential('Integration', function () {
  it.sequential(
    'should be able to use the ElekIoCore utility functions',
    async function () {
      expectTypeOf(uuid).toBeFunction();
      uuid();
    }
  );

  it.sequential(
    'should be able to use the ElekIoCore schemas',
    async function () {
      expectTypeOf(projectSchema.parse).toBeFunction();
      uuidSchema.parse(uuid());
    }
  );
});
