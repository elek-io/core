import { describe, expect, it, vi } from 'vitest';
import core, { uuid } from '../test/setup.js';

/**
 * Every service boundary used to pack `[BadRequest] (Project.read) ...`
 * into the message string, and elek.io Desktop parsed it back out at the
 * IPC boundary. Both ends were working around the same missing structure,
 * which is now `error.type` and `code.function.name` on the record. See
 * contributing/logging.md.
 */
describe('a failure at a service boundary is structured, not prefixed', function () {
  it('names the error type and the method as attributes', async function () {
    const error = vi.spyOn(core.logger, 'error');

    await expect(core.projects.read({ id: 'not-a-uuid' })).rejects.toThrow();

    const logged = error.mock.calls.map(([props]) => props);
    expect(logged).toHaveLength(1);
    expect(logged[0]?.meta).toMatchObject({
      'error.type': 'BadRequest',
      'code.function.name': 'Project.read',
    });
    error.mockRestore();
  });

  it('leaves the message readable, without the prefix', async function () {
    const error = vi.spyOn(core.logger, 'error');

    await expect(core.projects.read({ id: 'not-a-uuid' })).rejects.toThrow();

    const message = error.mock.calls[0]?.[0].message ?? '';
    expect(message).not.toContain('[BadRequest]');
    expect(message).not.toContain('(Project.read)');
    expect(message.length).toBeGreaterThan(0);
    error.mockRestore();
  });

  it('carries the status code of a failure a method did not expect', async function () {
    const error = vi.spyOn(core.logger, 'error');

    await expect(
      core.projects.delete({ id: uuid(), force: true })
    ).rejects.toThrow();

    const logged = error.mock.calls.map(([props]) => props.meta);
    expect(logged.at(-1)).toMatchObject({
      'error.type': 'Internal',
      'code.function.name': 'Project.delete',
      'elek.error.status_code': 500,
    });
    error.mockRestore();
  }, 30000);
});
