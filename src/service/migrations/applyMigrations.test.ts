import { describe, expect, it } from 'vitest';
import type { Migration } from '../../schema/migrationSchema.js';
import { CoreError } from '../../util/shared.js';
import { applyMigrations } from './applyMigrations.js';

describe('applyMigrations', () => {
  it('stamps version and leaves data unchanged when migration array is empty', () => {
    const data = { coreVersion: '1.0.0', name: 'test' };
    const result = applyMigrations(data, [], '2.0.0');

    expect(result['coreVersion']).toBe('2.0.0');
    expect(result['name']).toBe('test');
    // Original must not be mutated
    expect(data.coreVersion).toBe('1.0.0');
  });

  it('applies a single migration step', () => {
    const migrations: Migration[] = [
      {
        from: '1.0.0',
        to: '2.0.0',
        run: (data) => ({ ...data, newField: 'added' }),
      },
    ];
    const data = { coreVersion: '1.0.0', name: 'test' };
    const result = applyMigrations(data, migrations, '2.0.0');

    expect(result['coreVersion']).toBe('2.0.0');
    expect(result['newField']).toBe('added');
    expect(result['name']).toBe('test');
  });

  it('applies a multi-step chain sequentially', () => {
    const migrations: Migration[] = [
      {
        from: '1.0.0',
        to: '1.1.0',
        run: (data) => ({ ...data, step1: true }),
      },
      {
        from: '1.1.0',
        to: '2.0.0',
        run: (data) => ({ ...data, step2: true }),
      },
    ];
    const data = { coreVersion: '1.0.0' };
    const result = applyMigrations(data, migrations, '2.0.0');

    expect(result['coreVersion']).toBe('2.0.0');
    expect(result['step1']).toBe(true);
    expect(result['step2']).toBe(true);
  });

  it('stamps target version when no migration matches the current version', () => {
    const migrations: Migration[] = [
      {
        from: '1.0.0',
        to: '1.1.0',
        run: (data) => ({ ...data, transformed: true }),
      },
    ];
    // Starting at 1.5.0, no migration from 1.5.0 exists
    const data = { coreVersion: '1.5.0', name: 'test' };
    const result = applyMigrations(data, migrations, '2.0.0');

    expect(result['coreVersion']).toBe('2.0.0');
    expect(result['name']).toBe('test');
    expect(result['transformed']).toBeUndefined();
  });

  it('does not mutate the original data (deep clone)', () => {
    const migrations: Migration[] = [
      {
        from: '1.0.0',
        to: '2.0.0',
        run: (data) => {
          const result = { ...data };
          result['nested'] = { changed: true };
          return result;
        },
      },
    ];
    const data = { coreVersion: '1.0.0', nested: { original: true } };
    const result = applyMigrations(data, migrations, '2.0.0');

    expect((data.nested as Record<string, unknown>)['original']).toBe(true);
    expect((data.nested as Record<string, unknown>)['changed']).toBeUndefined();
    expect((result['nested'] as Record<string, unknown>)['changed']).toBe(true);
  });

  it('throws a VersionSkew error when data is newer than the target version', () => {
    const data = { coreVersion: '2.1.0', name: 'test' };

    let error: unknown = null;
    try {
      applyMigrations(data, [], '2.0.0');
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(CoreError);
    expect(error instanceof CoreError && error.type).toEqual('VersionSkew');
    expect(error instanceof CoreError && error.message).toContain('2.1.0');
    expect(error instanceof CoreError && error.message).toContain('2.0.0');
  });

  it('returns data unchanged when already at target version', () => {
    const data = { coreVersion: '2.0.0', name: 'test' };
    const result = applyMigrations(data, [], '2.0.0');

    expect(result['coreVersion']).toBe('2.0.0');
    expect(result['name']).toBe('test');
  });
});
