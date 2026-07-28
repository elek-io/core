import { assert, describe, expect, it, vi } from 'vitest';
import { CoreError } from '../util/shared.js';
import { loadCompiler } from './util.js';

// Stands in for an install without the optional peer dependency, where
// resolving it rejects with ERR_MODULE_NOT_FOUND
vi.mock('tsdown', () => {
  throw new Error(`Cannot find package 'tsdown'`);
});

describe('loadCompiler', () => {
  it('fails with a CoreError naming both packages to install', async () => {
    await expect(loadCompiler()).rejects.toThrow(CoreError);
    await expect(loadCompiler()).rejects.toThrow(/tsdown/);
    await expect(loadCompiler()).rejects.toThrow(/typescript/);
  });

  it('keeps the resolution failure as the cause', async () => {
    const error: unknown = await loadCompiler().catch(
      (reason: unknown) => reason
    );

    // The message is actionable on its own, the cause keeps the raw
    // resolution failure for whoever debugs the install
    assert(error instanceof CoreError);
    expect(error.cause).toBeInstanceOf(Error);
  });
});
